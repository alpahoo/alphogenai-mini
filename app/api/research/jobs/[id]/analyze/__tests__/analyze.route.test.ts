import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level payload tests for the analysis endpoint.
 * Goal: fail loudly if research_angles inserts write a user_id column,
 * which does not exist in the T-1101 schema (ownership is via research_job_id).
 */

vi.mock('@supabase/supabase-js');
vi.mock('@/lib/research/angles', () => ({ generateAngles: vi.fn() }));

import { createClient } from '@supabase/supabase-js';
import { generateAngles } from '@/lib/research/angles';
import { POST } from '../route';

const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>;
const mockGenerate = generateAngles as unknown as ReturnType<typeof vi.fn>;

interface Capture {
  table: string;
  op: 'insert' | 'update';
  payload: unknown;
}

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

describe('POST /analyze — insert/update payload schema alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  async function runSuccess() {
    const job = {
      data: { id: 'job-1', user_id: 'user-1', topic: 'AI', mode: 'news', status: 'ready_for_angles' },
      error: null,
    };
    const sources = {
      data: [{ url: 'https://a.com', title: 'A', extracted_markdown: 'content here' }],
      error: null,
    };
    const finalResp = { data: { id: 'job-1', status: 'ready_for_angles' }, error: null };

    // Queue order = awaited terminals: job fetch, sources fetch, set-scripting,
    // insert angles, final update
    const { client, captures } = makeServiceMock([
      job,
      sources,
      { data: null, error: null },
      { data: null, error: null },
      finalResp,
    ]);
    const auth = authClientOk('user-1');
    mockCreateClient.mockImplementation((_url: string, key: string) =>
      key === 'service-key' ? client : auth,
    );

    const angle = (n: number) => ({
      title: `Angle ${n}`,
      hook: 'A compelling hook here.',
      positioning: 'Unique positioning.',
      score: 0.8,
    });
    mockGenerate.mockResolvedValue({ angles: [angle(1), angle(2), angle(3)] });

    const req = new NextRequest('http://localhost/api/research/jobs/job-1/analyze', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    return { res, captures };
  }

  it('inserts research_angles with research_job_id and without user_id', async () => {
    const { res, captures } = await runSuccess();
    expect(res.status).toBe(200);

    const insert = captures.find((c) => c.table === 'research_angles' && c.op === 'insert');
    expect(insert).toBeTruthy();
    const rows = insert!.payload as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.research_job_id).toBe('job-1');
      expect(row).not.toHaveProperty('user_id');
      expect(row.selected).toBe(false);
    }
  });
});
