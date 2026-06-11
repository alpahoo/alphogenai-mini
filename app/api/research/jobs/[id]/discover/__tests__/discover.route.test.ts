import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level payload tests for the discovery endpoint.
 * Goal: fail loudly if research_sources inserts or research_jobs updates
 * write columns that do not exist in the T-1101 schema
 * (job_id, user_id on research_sources; sources_count on research_jobs).
 */

vi.mock('@supabase/supabase-js');
vi.mock('@/lib/research/discovery', () => ({ discoverSources: vi.fn() }));

import { createClient } from '@supabase/supabase-js';
import { discoverSources } from '@/lib/research/discovery';
import { POST } from '../route';

const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>;
const mockDiscover = discoverSources as unknown as ReturnType<typeof vi.fn>;

interface Capture {
  table: string;
  op: 'insert' | 'update';
  payload: unknown;
}

// Builds a Supabase service-client mock that records insert/update payloads
// and resolves each awaited terminal from a FIFO response queue.
function makeServiceMock(responses: Array<{ data: unknown; error: unknown }>) {
  const captures: Capture[] = [];
  let i = 0;
  const next = () => (i < responses.length ? responses[i++] : { data: null, error: null });

  const from = (table: string) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      not: () => b,
      limit: () => b,
      insert: (payload: unknown) => {
        captures.push({ table, op: 'insert', payload });
        return b;
      },
      update: (payload: unknown) => {
        captures.push({ table, op: 'update', payload });
        return b;
      },
      single: () => Promise.resolve(next()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(next()).then(resolve, reject),
    };
    return b;
  };

  return { client: { from }, captures };
}

function authClientOk(userId: string) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  };
}

describe('POST /discover — insert/update payload schema alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  async function runSuccess() {
    const job = {
      data: { id: 'job-1', user_id: 'user-1', topic: 'AI', status: 'draft', input_url: null },
      error: null,
    };
    const insertResp = { data: [{ url: 'https://a.com' }], error: null };
    const finalResp = { data: { id: 'job-1', status: 'ready_for_angles' }, error: null };

    // Queue order = awaited terminals: job fetch, set-discovering, insert.select, final update
    const { client, captures } = makeServiceMock([
      job,
      { data: null, error: null },
      insertResp,
      finalResp,
    ]);
    const auth = authClientOk('user-1');
    mockCreateClient.mockImplementation((_url: string, key: string) =>
      key === 'service-key' ? client : auth,
    );

    mockDiscover.mockResolvedValue([
      { url: 'https://a.com', title: 'A', source_type: 'media', credibility_score: 0.5 },
      { url: 'https://b.com', title: 'B', source_type: 'github', credibility_score: 0.5 },
    ]);

    const req = new NextRequest('http://localhost/api/research/jobs/job-1/discover', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    return { res, captures };
  }

  it('inserts research_sources with research_job_id and without user_id/job_id', async () => {
    const { res, captures } = await runSuccess();
    expect(res.status).toBe(200);

    const insert = captures.find((c) => c.table === 'research_sources' && c.op === 'insert');
    expect(insert).toBeTruthy();
    const rows = insert!.payload as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.research_job_id).toBe('job-1');
      expect(row).not.toHaveProperty('user_id');
      expect(row).not.toHaveProperty('job_id');
    }
  });

  it('never writes sources_count (or user_id) on research_jobs update', async () => {
    const { captures } = await runSuccess();
    const jobUpdates = captures.filter((c) => c.table === 'research_jobs' && c.op === 'update');
    expect(jobUpdates.length).toBeGreaterThan(0);
    for (const upd of jobUpdates) {
      expect(upd.payload).not.toHaveProperty('sources_count');
      expect(upd.payload).not.toHaveProperty('user_id');
    }
  });
});
