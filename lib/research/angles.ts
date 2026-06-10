/**
 * Research angles analysis adapter
 * Generates editorial angles via LLM
 */

export interface ResearchAngle {
  title: string;
  hook: string;
  positioning: string;
  score: number;
}

export interface LLMResponse {
  content: string;
  tokens_used: number;
  error?: string;
}

/**
 * Build prompt for LLM angle generation
 */
export function buildAnglePrompt(
  topic: string,
  mode: string,
  sourceSummaries: string[],
): string {
  const sourceExcerpts = sourceSummaries.slice(0, 5).join('\n---\n');

  return `Topic: ${topic}
Content Mode: ${mode}
Target Audience: Content creators interested in ${topic}

Extracted Sources Summary:
${sourceExcerpts}

Generate 3-5 editorial angles as JSON array:
[
  {
    "title": "Angle title (short, catchy)",
    "hook": "Opening hook for viewers/readers (1-2 sentences)",
    "positioning": "Unique positioning vs. other content (2-3 sentences)",
    "score": 0.85
  }
]

Ensure titles are unique, hooks are compelling, and scores reflect content quality/novelty (0.0=poor, 1.0=excellent).`;
}

/**
 * Clamp score to [0.0, 1.0]
 */
export function clampScore(score: number): number {
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Validate a single angle
 */
export function validateAngle(angle: unknown): angle is ResearchAngle {
  if (!angle || typeof angle !== 'object') {
    return false;
  }

  const obj = angle as Record<string, unknown>;

  return (
    typeof obj.title === 'string' &&
    obj.title.length > 0 &&
    obj.title.length <= 100 &&
    typeof obj.hook === 'string' &&
    obj.hook.length > 0 &&
    obj.hook.length <= 300 &&
    typeof obj.positioning === 'string' &&
    obj.positioning.length > 0 &&
    obj.positioning.length <= 500 &&
    typeof obj.score === 'number'
  );
}

/**
 * Parse and validate LLM response as angle array
 */
export function parseAnglesFromLLM(response: string): ResearchAngle[] {
  try {
    const parsed = JSON.parse(response);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const angles: ResearchAngle[] = [];

    for (const item of parsed) {
      if (validateAngle(item)) {
        angles.push({
          title: item.title,
          hook: item.hook,
          positioning: item.positioning,
          score: clampScore(item.score),
        });
      }
    }

    return angles;
  } catch {
    return [];
  }
}

/**
 * Call LLM (Claude via Anthropic API)
 * Server-side only, provider hidden from user
 */
export async function callLLMForAngles(
  prompt: string,
  timeoutMs: number = 30000,
): Promise<{ angles: ResearchAngle[]; error?: string }> {
  const apiKey = process.env.RESEARCH_LLM_API_KEY;
  const model = process.env.RESEARCH_LLM_MODEL || 'claude-opus-4-8';

  if (!apiKey) {
    return { angles: [], error: 'LLM API key not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: `You are an editorial angles expert. Generate 3-5 unique, compelling angles for a video/article based on research sources.

Each angle should offer a distinct perspective or approach to the topic, suitable for video/content production.

Return ONLY valid JSON. Do not include markdown, code blocks, or explanations outside the JSON.`,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorMsg =
        response.status === 429
          ? 'Rate limited by LLM provider'
          : response.status >= 500
            ? 'LLM provider error'
            : `LLM request failed: ${response.status}`;
      return { angles: [], error: errorMsg };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text: string }>;
    };
    const content = data.content?.[0]?.text || '';

    const angles = parseAnglesFromLLM(content);

    if (angles.length === 0) {
      return { angles: [], error: 'Invalid angles format from LLM' };
    }

    return { angles };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { angles: [], error: `LLM request timed out after ${timeoutMs}ms` };
    }

    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return { angles: [], error: errMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate angles for a research job
 */
export async function generateAngles(
  topic: string,
  mode: string,
  sourceSummaries: string[],
  timeoutMs?: number,
): Promise<{ angles: ResearchAngle[]; error?: string }> {
  if (sourceSummaries.length === 0) {
    return { angles: [], error: 'No sources provided' };
  }

  const prompt = buildAnglePrompt(topic, mode, sourceSummaries);
  return callLLMForAngles(prompt, timeoutMs);
}
