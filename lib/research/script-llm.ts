/**
 * Research script LLM call (network only).
 * Isolated from pure helpers so tests can mock the network without mocking
 * parsing/normalization logic.
 */

export interface ScriptLLMResult {
  content: string;
  tokensUsed: number | null;
  modelUsed: string | null;
  error?: string;
}

/**
 * Call the LLM to generate a script + storyboard (Claude via Anthropic API).
 * Server-side only; provider details are not surfaced to user-facing responses.
 */
export async function callLLMForScript(
  prompt: string,
  timeoutMs: number = 30000,
): Promise<ScriptLLMResult> {
  const apiKey = process.env.RESEARCH_LLM_API_KEY;
  const model = process.env.RESEARCH_LLM_MODEL || 'claude-opus-4-8';

  if (!apiKey) {
    return { content: '', tokensUsed: null, modelUsed: null, error: 'LLM API key not configured' };
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
        max_tokens: 4000,
        system: `You are a short-form video script + storyboard expert. Generate one complete script and a Director-compatible storyboard from the provided angle and sources.

Return ONLY a valid JSON object. Do not include markdown, code blocks, or explanations outside the JSON.`,
        messages: [{ role: 'user', content: prompt }],
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
      return { content: '', tokensUsed: null, modelUsed: null, error: errorMsg };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };

    const content = data.content?.[0]?.text || '';
    const tokensUsed =
      (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) || null;

    return { content, tokensUsed, modelUsed: data.model || model };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        content: '',
        tokensUsed: null,
        modelUsed: null,
        error: `LLM request timed out after ${timeoutMs}ms`,
      };
    }
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return { content: '', tokensUsed: null, modelUsed: null, error: errMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}
