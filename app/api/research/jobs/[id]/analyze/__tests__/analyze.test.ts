import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  buildAnglePrompt,
  callLLMForAngles,
  clampScore,
  validateAngle,
  parseAnglesFromLLM,
} from '@/lib/research/angles';

/**
 * Unit tests for angles analysis adapter
 * Route-level tests covered via integration testing
 */

describe('Angles Analysis Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEARCH_LLM_GATEWAY_URL;
    delete process.env.RESEARCH_LLM_SERVICE_TOKEN;
    delete process.env.RESEARCH_LLM_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildAnglePrompt', () => {
    it('should include topic and mode', () => {
      const prompt = buildAnglePrompt('AI Trends', 'news', ['Source 1', 'Source 2']);

      expect(prompt).toContain('Topic: AI Trends');
      expect(prompt).toContain('Content Mode: news');
    });

    it('should include source summaries', () => {
      const sources = ['Source 1 content', 'Source 2 content'];
      const prompt = buildAnglePrompt('AI', 'tutorial', sources);

      expect(prompt).toContain('Source 1 content');
      expect(prompt).toContain('Source 2 content');
    });

    it('should limit to top 5 sources', () => {
      const sources = Array.from({ length: 10 }, (_, i) => `Source ${i}`);
      const prompt = buildAnglePrompt('Topic', 'mode', sources);

      // Should include first 5, not last 5
      expect(prompt).toContain('Source 0');
      expect(prompt).toContain('Source 4');
    });

    it('should truncate each source excerpt to 500 chars', () => {
      const long = 'x'.repeat(2000);
      const prompt = buildAnglePrompt('Topic', 'mode', [long]);

      expect(prompt).toContain('x'.repeat(500));
      expect(prompt).not.toContain('x'.repeat(501));
    });

    it('should request JSON array format', () => {
      const prompt = buildAnglePrompt('Topic', 'mode', ['Source']);

      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"title"');
      expect(prompt).toContain('"hook"');
      expect(prompt).toContain('"positioning"');
      expect(prompt).toContain('"score"');
    });
  });

  describe('clampScore', () => {
    it('should clamp scores above 1.0', () => {
      expect(clampScore(1.5)).toBe(1.0);
      expect(clampScore(100)).toBe(1.0);
    });

    it('should clamp scores below 0.0', () => {
      expect(clampScore(-0.5)).toBe(0.0);
      expect(clampScore(-10)).toBe(0.0);
    });

    it('should preserve valid scores', () => {
      expect(clampScore(0.5)).toBe(0.5);
      expect(clampScore(0.0)).toBe(0.0);
      expect(clampScore(1.0)).toBe(1.0);
    });
  });

  describe('validateAngle', () => {
    const validAngle = {
      title: 'Interesting Angle',
      hook: 'This is a compelling hook.',
      positioning: 'This angle offers a unique perspective.',
      score: 0.85,
    };

    it('should accept valid angle', () => {
      expect(validateAngle(validAngle)).toBe(true);
    });

    it('should reject missing fields', () => {
      expect(validateAngle({ title: 'No hook' })).toBe(false);
      expect(validateAngle({ ...validAngle, hook: undefined })).toBe(false);
      expect(validateAngle({ ...validAngle, score: undefined })).toBe(false);
    });

    it('should reject empty title', () => {
      expect(validateAngle({ ...validAngle, title: '' })).toBe(false);
    });

    it('should reject title over 100 chars', () => {
      expect(
        validateAngle({
          ...validAngle,
          title: 'x'.repeat(101),
        }),
      ).toBe(false);
    });

    it('should reject hook over 300 chars', () => {
      expect(
        validateAngle({
          ...validAngle,
          hook: 'x'.repeat(301),
        }),
      ).toBe(false);
    });

    it('should reject positioning over 500 chars', () => {
      expect(
        validateAngle({
          ...validAngle,
          positioning: 'x'.repeat(501),
        }),
      ).toBe(false);
    });

    it('should reject non-numeric score', () => {
      expect(validateAngle({ ...validAngle, score: 'high' })).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateAngle('not an object')).toBe(false);
      expect(validateAngle(null)).toBe(false);
    });
  });

  describe('parseAnglesFromLLM', () => {
    it('should parse valid JSON array', () => {
      const json = JSON.stringify([
        {
          title: 'Angle 1',
          hook: 'Hook 1',
          positioning: 'Positioning 1',
          score: 0.8,
        },
        {
          title: 'Angle 2',
          hook: 'Hook 2',
          positioning: 'Positioning 2',
          score: 0.9,
        },
      ]);

      const angles = parseAnglesFromLLM(json);

      expect(angles).toHaveLength(2);
      expect(angles[0].title).toBe('Angle 1');
      expect(angles[1].score).toBe(0.9);
    });

    it('should clamp scores during parsing', () => {
      const json = JSON.stringify([
        {
          title: 'High Score',
          hook: 'Hook',
          positioning: 'Positioning',
          score: 1.5,
        },
        {
          title: 'Low Score',
          hook: 'Hook',
          positioning: 'Positioning',
          score: -0.5,
        },
      ]);

      const angles = parseAnglesFromLLM(json);

      expect(angles[0].score).toBe(1.0);
      expect(angles[1].score).toBe(0.0);
    });

    it('should skip invalid angles', () => {
      const json = JSON.stringify([
        {
          title: 'Valid',
          hook: 'Hook',
          positioning: 'Positioning',
          score: 0.8,
        },
        {
          title: '',
          hook: 'Hook',
          positioning: 'Positioning',
          score: 0.5,
        },
        {
          title: 'Another Valid',
          hook: 'Hook',
          positioning: 'Positioning',
          score: 0.7,
        },
      ]);

      const angles = parseAnglesFromLLM(json);

      expect(angles).toHaveLength(2);
      expect(angles[0].title).toBe('Valid');
      expect(angles[1].title).toBe('Another Valid');
    });

    it('should handle invalid JSON', () => {
      const angles = parseAnglesFromLLM('not json');
      expect(angles).toHaveLength(0);
    });

    it('should handle non-array response', () => {
      const json = JSON.stringify({
        title: 'Not an array',
        hook: 'This is an object not an array',
        positioning: 'Cannot use this',
        score: 0.5,
      });

      const angles = parseAnglesFromLLM(json);
      expect(angles).toHaveLength(0);
    });

    it('should parse JSON wrapped in markdown fences', () => {
      const json = `\`\`\`json
[
  {
    "title": "Wrapped",
    "hook": "Hook",
    "positioning": "Positioning",
    "score": 0.8
  }
]
\`\`\``;

      const angles = parseAnglesFromLLM(json);

      expect(angles).toHaveLength(1);
      expect(angles[0].title).toBe('Wrapped');
    });

    it('should parse object-wrapped angle arrays from gateway models', () => {
      const json = JSON.stringify({
        angles: [
          {
            title: 'Wrapped Array',
            hook: 'Hook',
            positioning: 'Positioning',
            score: 0.7,
          },
        ],
      });

      const angles = parseAnglesFromLLM(json);

      expect(angles).toHaveLength(1);
      expect(angles[0].title).toBe('Wrapped Array');
    });

    it('should handle empty array', () => {
      const angles = parseAnglesFromLLM('[]');
      expect(angles).toHaveLength(0);
    });

    it('should filter 3-5 valid angles', () => {
      const angles = Array.from({ length: 5 }, (_, i) => ({
        title: `Angle ${i}`,
        hook: 'Hook',
        positioning: 'Positioning',
        score: 0.5 + i * 0.1,
      }));

      const json = JSON.stringify(angles);
      const parsed = parseAnglesFromLLM(json);

      expect(parsed.length).toBeGreaterThanOrEqual(3);
      expect(parsed.length).toBeLessThanOrEqual(5);
    });
  });

  describe('callLLMForAngles', () => {
    it('should require the LiteLLM gateway env vars', async () => {
      const result = await callLLMForAngles('prompt');

      expect(result).toEqual({ angles: [], error: 'LLM gateway not configured' });
    });

    it('should call the OpenAI-compatible LiteLLM endpoint', async () => {
      process.env.RESEARCH_LLM_GATEWAY_URL = 'https://research-gw.example.com';
      process.env.RESEARCH_LLM_SERVICE_TOKEN = 'service-token';
      process.env.RESEARCH_LLM_MODEL = 'research-basic';

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    title: 'LiteLLM Angle',
                    hook: 'Hook',
                    positioning: 'Positioning',
                    score: 0.9,
                  },
                ]),
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await callLLMForAngles('prompt');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://research-gw.example.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer service-token',
          }),
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.model).toBe('research-basic');
      expect(body.messages[0].role).toBe('system');
      expect(result.angles).toHaveLength(1);
      expect(result.angles[0].title).toBe('LiteLLM Angle');
    });
  });
});
