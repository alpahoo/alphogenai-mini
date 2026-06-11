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

export const ANGLE_SOURCE_EXCERPT_CHARS = 500;

/**
 * Build prompt for LLM angle generation
 */
export function buildAnglePrompt(
  topic: string,
  mode: string,
  sourceSummaries: string[],
): string {
  const sourceExcerpts = sourceSummaries
    .slice(0, 5)
    .map((source) => source.slice(0, ANGLE_SOURCE_EXCERPT_CHARS))
    .join('\n---\n');

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
    let text = response.trim();
    // Strip markdown code fences if the model wrapped the JSON.
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) {
      text = fence[1].trim();
    }

    let parsed: unknown = JSON.parse(text);

    // Some models wrap the array in an object, e.g. { "angles": [...] }.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const arr = Object.values(parsed as Record<string, unknown>).find((v) => Array.isArray(v));
      parsed = arr ?? [];
    }

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
 * Call the Research LLM gateway (LiteLLM, OpenAI-compatible).
 * Server-side only; provider/model are hidden behind the gateway.
 */
export async function callLLMForAngles(
  prompt: string,
  timeoutMs: number = 30000,
): Promise<{ angles: ResearchAngle[]; error?: string }> {
  const gatewayUrl = process.env.RESEARCH_LLM_GATEWAY_URL;
  const serviceToken = process.env.RESEARCH_LLM_SERVICE_TOKEN;
  const model = process.env.RESEARCH_LLM_MODEL || 'research-basic';

  if (!gatewayUrl || !serviceToken) {
    return { angles: [], error: 'LLM gateway not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: `You are an editorial angles expert. Generate 3-5 unique, compelling angles for a video/article based on research sources.

Each angle should offer a distinct perspective or approach to the topic, suitable for video/content production.

Return ONLY valid JSON (a top-level array). Do not include markdown, code blocks, or explanations outside the JSON.`,
          },
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
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';

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
