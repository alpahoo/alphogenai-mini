import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/supabase-js');

import { createClient } from '@supabase/supabase-js';
import { POST } from '../route';

const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>;

interface Capture {
  table: string;
  op: 'update';
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
      order: () => b,
      limit: () => b,
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

describe('POST /api/research/jobs/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('requires auth', async () => {
    const req = new NextRequest('http://localhost/api/research/jobs/job-1/approve', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    expect(res.status).toBe(401);
  });

  it('approves the latest script and marks the job approved via service role', async () => {
    const { client, captures } = makeServiceMock([
      { data: { id: 'job-1', user_id: 'user-1', status: 'scripting' }, error: null },
      { data: [{ id: 'script-1', approved: false }], error: null },
      { data: [{ id: 'storyboard-1' }], error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    const auth = authClientOk('user-1');
    mockCreateClient.mockImplementation((_url: string, key: string) =>
      key === 'service-key' ? client : auth,
    );

    const req = new NextRequest('http://localhost/api/research/jobs/job-1/approve', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ id: 'job-1', status: 'approved', script_id: 'script-1', approved: true });
    expect(captures).toEqual([
      { table: 'research_scripts', op: 'update', payload: { approved: true } },
      {
        table: 'research_jobs',
        op: 'update',
        payload: { status: 'approved', error_step: null, error_message: null },
      },
    ]);
  });

  it('rejects approval before a storyboard exists', async () => {
    const { client } = makeServiceMock([
      { data: { id: 'job-1', user_id: 'user-1', status: 'scripting' }, error: null },
      { data: [{ id: 'script-1', approved: false }], error: null },
      { data: [], error: null },
    ]);
    const auth = authClientOk('user-1');
    mockCreateClient.mockImplementation((_url: string, key: string) =>
      key === 'service-key' ? client : auth,
    );

    const req = new NextRequest('http://localhost/api/research/jobs/job-1/approve', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Generate a storyboard');
  });
});
