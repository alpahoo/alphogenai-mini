import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level payload tests for the script endpoint.
 * Goal: fail loudly if research_scripts or research_storyboards inserts write
 * columns that do not exist in the T-1101 schema (user_id/job_id), and verify
 * the route stores Director-compatible scenes.
 */

vi.mock('@supabase/supabase-js');
vi.mock('@/lib/research/script-llm', () => ({ callLLMForScript: vi.fn() }));

import { createClient } from '@supabase/supabase-js';
import { callLLMForScript } from '@/lib/research/script-llm';
import { POST } from '../route';

const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>;
const mockCallLLM = callLLMForScript as unknown as ReturnType<typeof vi.fn>;

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

function validLLMContent() {
  return JSON.stringify({
    script:
      'This is a complete short-form research script with enough length to pass validation and become a stored script.',
    sections: [{ label: 'Hook', content: 'Open with the central tension.', duration_sec: 4 }],
    subscores: {
      hook_strength: 0.8,
      source_coverage: 0.7,
      clarity: 0.9,
      originality: 0.6,
      risk_disclosure: 0.5,
      rhythm_fit: 0.7,
      duration_fit: 0.8,
    },
    scenes: [
      { title: 'Hook shot', prompt: 'A cinematic opening visual.', duration_sec: 1 },
      { role: 'Evidence', prompt: 'A clean visual summary of the source material.', durationSec: 999 },
    ],
  });
}

describe('POST /script - insert payload schema alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  async function runSuccess(body?: unknown) {
    const job = {
      data: { id: 'job-1', user_id: 'user-1', topic: 'AI', mode: 'news', status: 'ready_for_angles' },
      error: null,
    };
    const selectedAngle = {
      data: [{ id: 'angle-1', title: 'Angle', hook: 'Hook text', positioning: 'Positioning' }],
      error: null,
    };
    const explicitAngle = {
      data: { id: 'angle-2', title: 'Explicit', hook: 'Explicit hook', positioning: null },
      error: null,
    };
    const sources = {
      data: [{ title: 'Source A', extracted_markdown: 'Extracted source context.' }],
      error: null,
    };
    const insertedScript = { data: { id: 'script-1' }, error: null };
    const insertedStoryboard = { data: { id: 'storyboard-1' }, error: null };

    const responses = body
      ? [job, explicitAngle, sources, { data: null, error: null }, insertedScript, insertedStoryboard]
      : [job, selectedAngle, sources, { data: null, error: null }, insertedScript, insertedStoryboard];

    const { client, captures } = makeServiceMock(responses);
    const auth = authClientOk('user-1');
    mockCreateClient.mockImplementation((_url: string, key: string) =>
      key === 'service-key' ? client : auth,
    );
    mockCallLLM.mockResolvedValue({
      content: validLLMContent(),
      tokensUsed: 123,
      modelUsed: 'test-model',
    });

    const req = new NextRequest('http://localhost/api/research/jobs/job-1/script', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    return { res, captures };
  }

  it('inserts research_scripts with schema-valid columns only', async () => {
    const { res, captures } = await runSuccess();
    expect(res.status).toBe(200);

    const insert = captures.find((c) => c.table === 'research_scripts' && c.op === 'insert');
    expect(insert).toBeTruthy();
    const payload = insert!.payload as Record<string, unknown>;

    expect(payload.research_job_id).toBe('job-1');
    expect(payload.angle_id).toBe('angle-1');
    expect(payload.approved).toBe(false);
    expect(payload.model_used).toBe('test-model');
    expect(payload.tokens_used).toBe(123);
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('job_id');
  });

  it('inserts research_storyboards with Director-compatible scenes and no user_id/job_id', async () => {
    const { res, captures } = await runSuccess();
    expect(res.status).toBe(200);

    const insert = captures.find((c) => c.table === 'research_storyboards' && c.op === 'insert');
    expect(insert).toBeTruthy();
    const payload = insert!.payload as Record<string, unknown>;

    expect(payload.research_job_id).toBe('job-1');
    expect(payload.script_id).toBe('script-1');
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('job_id');

    const scenes = payload.scenes_json as Array<Record<string, unknown>>;
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ title: 'Hook shot', duration_sec: 3 });
    expect(scenes[1]).toMatchObject({ title: 'Evidence', duration_sec: 10 });
    for (const scene of scenes) {
      expect(typeof scene.title).toBe('string');
      expect(typeof scene.prompt).toBe('string');
      expect(scene.duration_sec).toBeGreaterThanOrEqual(3);
      expect(scene.duration_sec).toBeLessThanOrEqual(10);
    }
  });

  it('stores cinematically enriched, Director-compatible scenes_json', async () => {
    const { res, captures } = await runSuccess();
    expect(res.status).toBe(200);

    const insert = captures.find((c) => c.table === 'research_storyboards' && c.op === 'insert');
    const payload = insert!.payload as Record<string, unknown>;
    const scenes = payload.scenes_json as Array<Record<string, unknown>>;
    expect(scenes.length).toBeGreaterThan(0);

    for (const scene of scenes) {
      // Canonical Director fields preserved
      expect(typeof scene.title).toBe('string');
      expect(typeof scene.prompt).toBe('string');
      expect(scene.duration_sec).toBeGreaterThanOrEqual(3);
      expect(scene.duration_sec).toBeLessThanOrEqual(10);
      // Additive cinematic metadata present
      expect(typeof scene.camera_shot).toBe('string');
      expect(typeof scene.camera_motion).toBe('string');
      expect(typeof scene.lighting).toBe('string');
      expect(typeof scene.mood).toBe('string');
      expect(typeof scene.voiceover_line).toBe('string');
      // Cinematic detail composed INTO the prompt (the only field that reaches video)
      expect((scene.prompt as string).toLowerCase()).toContain('lighting');
      expect((scene.prompt as string).length).toBeLessThanOrEqual(2000);
    }
  });

  it('uses explicit angle_id when provided', async () => {
    const { res, captures } = await runSuccess({ angle_id: 'angle-2' });
    expect(res.status).toBe(200);

    const insert = captures.find((c) => c.table === 'research_scripts' && c.op === 'insert');
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.angle_id).toBe('angle-2');
  });
});
