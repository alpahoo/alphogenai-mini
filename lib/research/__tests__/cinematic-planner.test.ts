import { describe, it, expect } from 'vitest';
import { planCinematicScenes, type PlannerInput } from '@/lib/research/cinematic-planner';

function baseInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    topic: 'AI tooling',
    mode: 'news',
    language: 'en-US',
    targetDurationSeconds: 60,
    angle: { title: 'The angle', hook: 'A compelling hook line.', positioning: 'Unique take.' },
    script: 'First sentence of the script. Second sentence follows.',
    scenes: [
      { title: 'Intro', prompt: 'A person at a desk', duration_sec: 5 },
      { title: 'Body', prompt: 'A chart on screen', duration_sec: 6 },
      { title: 'Close', prompt: 'A closing shot', duration_sec: 4 },
    ],
    sources: [
      { title: 'OpenAI News', url: 'https://openai.com/news/', source_type: 'official' },
      { title: 'Demo video', url: 'https://youtube.com/watch?v=x', source_type: 'youtube' },
    ],
    ...overrides,
  };
}

describe('planCinematicScenes', () => {
  it('returns empty for empty scenes', () => {
    expect(planCinematicScenes(baseInput({ scenes: [] }))).toHaveLength(0);
  });

  it('preserves canonical fields and order, non-empty', () => {
    const out = planCinematicScenes(baseInput());
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe('Intro');
    expect(out[1].title).toBe('Body');
    expect(out[2].title).toBe('Close');
    for (const s of out) {
      expect(typeof s.prompt).toBe('string');
      expect(s.prompt.length).toBeGreaterThan(0);
      expect(s.duration_sec).toBeGreaterThanOrEqual(3);
      expect(s.duration_sec).toBeLessThanOrEqual(10);
    }
  });

  it('clamps duration to [3,10]', () => {
    const out = planCinematicScenes(
      baseInput({
        targetDurationSeconds: null,
        scenes: [{ title: 'A', prompt: 'p', duration_sec: 99 }, { title: 'B', prompt: 'p', duration_sec: 0 }],
      }),
    );
    expect(out[0].duration_sec).toBe(10);
    expect(out[1].duration_sec).toBe(3);
  });

  it('composes cinematic descriptors INTO the prompt (the video channel)', () => {
    const out = planCinematicScenes(baseInput());
    // first scene news default lighting = soft daylight, establishing shot
    expect(out[0].prompt).toContain('establishing shot');
    expect(out[0].prompt.toLowerCase()).toContain('lighting');
    expect(out[0].prompt.toLowerCase()).toContain('mood');
    for (const s of out) {
      expect(s.prompt.length).toBeLessThanOrEqual(2000);
    }
  });

  it('news mode → reportage framing + source citation populated', () => {
    const out = planCinematicScenes(baseInput({ mode: 'news' }));
    expect(out[0].camera_shot).toBe('establishing');
    expect(out.some((s) => s.source_citation && s.source_citation.length > 0)).toBe(true);
    expect(out.some((s) => s.onscreen_text && s.onscreen_text.startsWith('Source:'))).toBe(true);
  });

  it('tutorial mode → step framing + screen capture', () => {
    const out = planCinematicScenes(baseInput({ mode: 'tutorial', sources: [] }));
    expect(out[0].camera_shot).toBe('screen_capture');
    expect(out.some((s) => s.camera_shot === 'screen_capture')).toBe(true);
    expect(out[0].onscreen_text).toBe('Step 1');
    expect(out[1].onscreen_text).toBe('Step 2');
  });

  it('product mode → product/establishing shots', () => {
    const out = planCinematicScenes(baseInput({ mode: 'product' }));
    expect(out[0].camera_shot).toBe('establishing');
    expect(['close_up', 'medium', 'insert']).toContain(out[1].camera_shot);
  });

  it('competitor mode → split-screen + neutral mood', () => {
    const out = planCinematicScenes(baseInput({ mode: 'competitor', sources: [] }));
    expect(out[0].camera_shot).toBe('split_screen');
    expect(out[0].onscreen_text).toBe('A vs B');
    expect(out.every((s) => s.mood === 'neutral_analytical' || s.mood === 'curious')).toBe(true);
  });

  it('fills every field deterministically when LLM hints are absent', () => {
    const out = planCinematicScenes(
      baseInput({ scenes: [{ title: 'Only title and prompt', prompt: 'something' }] }),
    );
    const s = out[0];
    expect(s.camera_shot.length).toBeGreaterThan(0);
    expect(s.camera_motion.length).toBeGreaterThan(0);
    expect(s.lighting.length).toBeGreaterThan(0);
    expect(s.mood.length).toBeGreaterThan(0);
    expect(s.visual_intent.length).toBeGreaterThan(0);
    expect(s.voiceover_line.length).toBeGreaterThan(0);
  });

  it('preserves valid LLM cinematic hints, rejects invalid ones', () => {
    const out = planCinematicScenes(
      baseInput({
        mode: 'news',
        scenes: [
          { title: 'A', prompt: 'p', camera_shot: 'close_up', lighting: 'low_key', mood: 'tense', camera_motion: 'dolly' },
          { title: 'B', prompt: 'p', camera_shot: 'not_a_real_shot', lighting: 'nope' },
        ],
      }),
    );
    // valid hints preserved
    expect(out[0].camera_shot).toBe('close_up');
    expect(out[0].lighting).toBe('low_key');
    expect(out[0].mood).toBe('tense');
    expect(out[0].camera_motion).toBe('dolly');
    // invalid hints fall back to deterministic defaults (known vocab)
    expect(['wide', 'medium', 'close_up', 'over_shoulder', 'screen_capture', 'split_screen', 'insert', 'establishing']).toContain(out[1].camera_shot);
    expect(['soft_daylight', 'studio_key', 'low_key', 'clean_ui', 'high_key', 'golden_hour']).toContain(out[1].lighting);
  });

  it('uses the angle hook as the first scene voice-over when LLM omits it', () => {
    const out = planCinematicScenes(baseInput());
    expect(out[0].voiceover_line).toBe('A compelling hook line.');
  });

  it('asset policy: uses source context without pretending media is attached', () => {
    const out = planCinematicScenes(baseInput());
    const withHint = out.find((s) => s.reference_asset_hint);
    expect(withHint).toBeTruthy();
    expect(withHint!.reference_asset_hint!).toMatch(/source context:/);
    expect(withHint!.reference_asset_hint!).not.toMatch(/asset_id|byteplus|face/i);
    expect(withHint!.prompt).toMatch(/do not show the website or logo unless a real reference image\/video is attached/i);
    expect(withHint!.risk_note).toMatch(/usage rights/i);
  });

  it('no asset hint when no usable sources', () => {
    const out = planCinematicScenes(baseInput({ sources: [{ title: 'Forum', url: 'https://reddit.com/r/x', source_type: 'forum' }] }));
    expect(out.every((s) => s.reference_asset_hint === null)).toBe(true);
  });

  it('keeps serialized output under the 100 KB DB cap', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      title: `Scene ${i}`,
      prompt: 'x'.repeat(1500),
      duration_sec: 5,
      visual_intent: 'y'.repeat(490),
    }));
    const out = planCinematicScenes(baseInput({ scenes: many }));
    expect(out.length).toBeGreaterThan(0);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(102400);
  });

  it('rebalances scene durations to match targetDurationSeconds when within reach', () => {
    const out = planCinematicScenes(
      baseInput({
        targetDurationSeconds: 20,
        scenes: [
          { title: 'A', prompt: 'p', duration_sec: 3 },
          { title: 'B', prompt: 'p', duration_sec: 3 },
          { title: 'C', prompt: 'p', duration_sec: 4 },
        ],
      }),
    );
    expect(out.reduce((sum, s) => sum + s.duration_sec, 0)).toBe(20);
    for (const s of out) {
      expect(s.duration_sec).toBeGreaterThanOrEqual(3);
      expect(s.duration_sec).toBeLessThanOrEqual(10);
    }
  });

  it('rebalances scene durations down when total is too high, clamped to [3,10]', () => {
    const manyScenes = Array.from({ length: 8 }, (_, i) => ({ title: `S${i}`, prompt: 'p', duration_sec: 10 }));
    const out = planCinematicScenes(baseInput({ targetDurationSeconds: 30, scenes: manyScenes }));
    const total = out.reduce((sum, s) => sum + s.duration_sec, 0);
    expect(total).toBeLessThan(80);
    for (const s of out) {
      expect(s.duration_sec).toBeGreaterThanOrEqual(3);
      expect(s.duration_sec).toBeLessThanOrEqual(10);
    }
  });

  it('does not rebalance when total duration is already within tolerance of target', () => {
    const out = planCinematicScenes(
      baseInput({
        targetDurationSeconds: 60,
        scenes: [
          { title: 'A', prompt: 'p', duration_sec: 9 },
          { title: 'B', prompt: 'p', duration_sec: 10 },
          { title: 'C', prompt: 'p', duration_sec: 10 },
          { title: 'D', prompt: 'p', duration_sec: 10 },
          { title: 'E', prompt: 'p', duration_sec: 10 },
          { title: 'F', prompt: 'p', duration_sec: 9 },
        ],
      }),
    );
    expect(out.map((s) => s.duration_sec)).toEqual([9, 10, 10, 10, 10, 9]);
  });

  it('does not rebalance when targetDurationSeconds is null', () => {
    const out = planCinematicScenes(
      baseInput({
        targetDurationSeconds: null,
        scenes: [
          { title: 'A', prompt: 'p', duration_sec: 3 },
          { title: 'B', prompt: 'p', duration_sec: 3 },
          { title: 'C', prompt: 'p', duration_sec: 3 },
        ],
      }),
    );
    expect(out.map((s) => s.duration_sec)).toEqual([3, 3, 3]);
  });

  it('overrides repeated consecutive camera_shot hints from the LLM', () => {
    const out = planCinematicScenes(
      baseInput({
        mode: 'news',
        targetDurationSeconds: null,
        scenes: [
          { title: 'A', prompt: 'p', camera_shot: 'medium' },
          { title: 'B', prompt: 'p', camera_shot: 'medium' },
          { title: 'C', prompt: 'p', camera_shot: 'medium' },
        ],
      }),
    );
    expect(out[0].camera_shot).toBe('medium');
    expect(out[1].camera_shot).not.toBe(out[0].camera_shot);
    expect(out[2].camera_shot).not.toBe(out[1].camera_shot);
  });

  it('falls back to the next vocabulary shot when both the LLM hint and the mode default repeat the previous shot', () => {
    const out = planCinematicScenes(
      baseInput({
        mode: 'tutorial',
        targetDurationSeconds: null,
        sources: [],
        scenes: [
          { title: 'A', prompt: 'p' },
          { title: 'B', prompt: 'p', camera_shot: 'medium' },
          { title: 'C', prompt: 'p', camera_shot: 'medium' },
        ],
      }),
    );
    expect(out[1].camera_shot).toBe('medium');
    expect(out[2].camera_shot).toBe('close_up');
    expect(out[2].camera_shot).not.toBe(out[1].camera_shot);
  });

  it('never leaks provider/model names into output', () => {
    const out = planCinematicScenes(baseInput());
    const blob = JSON.stringify(out).toLowerCase();
    for (const name of ['groq', 'openai api', 'litellm', 'gpt-4', 'llama', 'anthropic', 'claude']) {
      expect(blob).not.toContain(name);
    }
  });
});
