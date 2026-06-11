import { describe, it, expect } from 'vitest';
import {
  buildScriptPrompt,
  parseScriptResponse,
  validateAndTruncateScript,
  normalizeSections,
  normalizeScenes,
  normalizeSubscores,
  computeQualityScore,
  clampSceneDuration,
  clampScore,
  SCRIPT_MAX_CHARS,
  SECTIONS_MAX_CHARS,
  SCENES_MAX_CHARS,
} from '@/lib/research/script';

describe('Script + Storyboard helpers', () => {
  describe('buildScriptPrompt', () => {
    it('includes topic, mode, and angle', () => {
      const prompt = buildScriptPrompt(
        'AI Trends',
        'news',
        { title: 'The Angle', hook: 'A hook', positioning: 'Unique' },
        ['Source A content'],
      );
      expect(prompt).toContain('Topic: AI Trends');
      expect(prompt).toContain('Content Mode: news');
      expect(prompt).toContain('The Angle');
      expect(prompt).toContain('A hook');
      expect(prompt).toContain('Source A content');
    });

    it('truncates each source excerpt to 500 chars', () => {
      const long = 'x'.repeat(2000);
      const prompt = buildScriptPrompt('T', 'news', { title: 't', hook: 'h' }, [long]);
      // 500 x's present, 501st not as a run of 501
      expect(prompt).toContain('x'.repeat(500));
      expect(prompt).not.toContain('x'.repeat(501));
    });
  });

  describe('clampScore', () => {
    it('clamps and rounds', () => {
      expect(clampScore(1.5)).toBe(1);
      expect(clampScore(-1)).toBe(0);
      expect(clampScore(0.736)).toBe(0.74);
    });
    it('returns null for non-numbers', () => {
      expect(clampScore('x')).toBeNull();
      expect(clampScore(undefined)).toBeNull();
      expect(clampScore(NaN)).toBeNull();
    });
  });

  describe('clampSceneDuration', () => {
    it('clamps to [3,10] and rounds', () => {
      expect(clampSceneDuration(1)).toBe(3);
      expect(clampSceneDuration(999)).toBe(10);
      expect(clampSceneDuration(4.4)).toBe(4);
      expect(clampSceneDuration(7)).toBe(7);
    });
    it('defaults to 5 for invalid', () => {
      expect(clampSceneDuration('x')).toBe(5);
      expect(clampSceneDuration(undefined)).toBe(5);
    });
  });

  describe('parseScriptResponse', () => {
    const valid = JSON.stringify({
      script: 'A script body.',
      sections: [{ label: 'Hook', content: 'c', duration_sec: 4 }],
      subscores: { clarity: 0.8 },
      scenes: [{ title: 'Scene', prompt: 'p', duration_sec: 5 }],
    });

    it('parses a valid object', () => {
      const parsed = parseScriptResponse(valid);
      expect(parsed).not.toBeNull();
      expect(parsed!.script).toBe('A script body.');
      expect(parsed!.scenes).toHaveLength(1);
    });

    it('strips code fences', () => {
      const fenced = '```json\n' + valid + '\n```';
      const parsed = parseScriptResponse(fenced);
      expect(parsed).not.toBeNull();
      expect(parsed!.script).toBe('A script body.');
    });

    it('returns null on invalid JSON', () => {
      expect(parseScriptResponse('not json')).toBeNull();
    });

    it('returns null when top-level is an array', () => {
      expect(parseScriptResponse('[]')).toBeNull();
    });

    it('returns null when script is missing', () => {
      expect(parseScriptResponse(JSON.stringify({ scenes: [] }))).toBeNull();
    });

    it('defaults missing sections/scenes to empty arrays', () => {
      const parsed = parseScriptResponse(JSON.stringify({ script: 'body' }));
      expect(parsed!.sections).toEqual([]);
      expect(parsed!.scenes).toEqual([]);
    });
  });

  describe('validateAndTruncateScript', () => {
    it('returns null below 50 chars', () => {
      expect(validateAndTruncateScript('too short')).toBeNull();
    });

    it('keeps valid-length scripts', () => {
      const body = 'a'.repeat(100);
      expect(validateAndTruncateScript(body)).toBe(body);
    });

    it('truncates above max length', () => {
      const body = 'word '.repeat(5000); // 25000 chars
      const result = validateAndTruncateScript(body);
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(SCRIPT_MAX_CHARS);
    });
  });

  describe('normalizeSections', () => {
    it('keeps valid sections and clamps duration', () => {
      const result = normalizeSections([
        { label: 'Hook', content: 'c', duration_sec: 99 },
        'not an object',
        { label: 'Body', content: 'b' },
      ]);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(2);
      expect(result![0].duration_sec).toBe(10);
    });

    it('drops trailing sections to fit size cap', () => {
      const big = Array.from({ length: 50 }, (_, i) => ({
        label: `S${i}`,
        content: 'x'.repeat(500),
      }));
      const result = normalizeSections(big);
      expect(result).not.toBeNull();
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(SECTIONS_MAX_CHARS);
    });

    it('returns null when nothing valid remains', () => {
      expect(normalizeSections(['x', 1, null])).toBeNull();
    });
  });

  describe('normalizeScenes', () => {
    it('normalizes title/role and duration', () => {
      const result = normalizeScenes([
        { title: 'A', prompt: 'pa', duration_sec: 5 },
        { role: 'B', prompt: 'pb', durationSec: 1 },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('A');
      expect(result[1].title).toBe('B');
      expect(result[1].duration_sec).toBe(3);
    });

    it('drops scenes missing title or prompt', () => {
      const result = normalizeScenes([
        { prompt: 'no title' },
        { title: 'no prompt' },
        { title: 'ok', prompt: 'p' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('ok');
    });

    it('clamps every duration into [3,10]', () => {
      const result = normalizeScenes([
        { title: 'A', prompt: 'p', duration_sec: 0 },
        { title: 'B', prompt: 'p', duration_sec: 100 },
      ]);
      expect(result.every((s) => s.duration_sec >= 3 && s.duration_sec <= 10)).toBe(true);
    });

    it('returns empty when no scenes valid', () => {
      expect(normalizeScenes([{ foo: 'bar' }, 'x'])).toHaveLength(0);
    });

    it('keeps serialized scenes under the size cap', () => {
      const big = Array.from({ length: 2000 }, (_, i) => ({
        title: `S${i}`,
        prompt: 'x'.repeat(200),
        duration_sec: 5,
      }));
      const result = normalizeScenes(big);
      expect(result.length).toBeGreaterThan(0);
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(SCENES_MAX_CHARS);
    });
  });

  describe('normalizeSubscores', () => {
    it('maps known keys and clamps; missing → null', () => {
      const out = normalizeSubscores({ hook_strength: 1.4, clarity: 0.5, bogus: 0.9 });
      expect(out.hook_strength).toBe(1);
      expect(out.clarity).toBe(0.5);
      expect(out.source_coverage).toBeNull();
      expect(out).not.toHaveProperty('bogus');
    });
  });

  describe('computeQualityScore', () => {
    it('averages present subscores', () => {
      expect(computeQualityScore({ clarity: 0.6, originality: 0.8 })).toBe(0.7);
    });
    it('returns null when no subscore present', () => {
      expect(computeQualityScore({})).toBeNull();
    });
  });
});
