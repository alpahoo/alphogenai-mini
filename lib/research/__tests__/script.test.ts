import { describe, it, expect } from 'vitest';
import { buildScriptPrompt, buildPacingGuidance } from '@/lib/research/script';

describe('buildPacingGuidance', () => {
  it('returns flexible framing when targetDurationSeconds is null/undefined/zero', () => {
    expect(buildPacingGuidance(null)).toMatch(/no fixed duration/i);
    expect(buildPacingGuidance(undefined)).toMatch(/no fixed duration/i);
    expect(buildPacingGuidance(0)).toMatch(/no fixed duration/i);
  });

  it('states the target duration and a scene-count plan summing to it', () => {
    const guidance = buildPacingGuidance(60);
    expect(guidance).toContain('60 seconds');
    expect(guidance).toMatch(/Plan \d+(-\d+)? scenes/);
    expect(guidance.toLowerCase()).toContain('duration_sec');
  });

  it('keeps the suggested scene-count range within [1,10]', () => {
    for (const target of [3, 10, 30, 60, 120, 300, 600]) {
      const guidance = buildPacingGuidance(target);
      const match = guidance.match(/Plan (\d+)(?:-(\d+))? scenes/);
      expect(match).toBeTruthy();
      const min = Number(match![1]);
      const max = match![2] ? Number(match![2]) : min;
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeLessThanOrEqual(10);
      expect(min).toBeLessThanOrEqual(max);
    }
  });
});

describe('buildScriptPrompt', () => {
  const angle = { title: 'Angle title', hook: 'Hook line', positioning: 'Positioning text' };

  it('includes pacing guidance with the target duration when provided', () => {
    const prompt = buildScriptPrompt('Topic', 'news', angle, [], 60);
    expect(prompt).toContain('60 seconds');
    expect(prompt).toMatch(/Plan \d+(-\d+)? scenes/);
  });

  it('falls back to flexible framing when target duration is null', () => {
    const prompt = buildScriptPrompt('Topic', 'news', angle, [], null);
    expect(prompt).toMatch(/no fixed duration/i);
  });

  it('falls back to flexible framing when target duration is omitted', () => {
    const prompt = buildScriptPrompt('Topic', 'news', angle, []);
    expect(prompt).toMatch(/no fixed duration/i);
  });

  it('includes concrete anti-repetition / anti-generic rules', () => {
    const prompt = buildScriptPrompt('Topic', 'news', angle, [], 60);
    expect(prompt).toMatch(/different concrete subject/i);
    expect(prompt).toMatch(/do not repeat the same "camera_shot"/i);
  });
});
