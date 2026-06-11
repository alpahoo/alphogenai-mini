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
 * Call the Research LLM gateway (LiteLLM, OpenAI-compatible).
 * Server-side only; provider/model are hidden behind the gateway.
 */
export async function callLLMForScript(
  prompt: string,
  timeoutMs: number = 30000,
): Promise<ScriptLLMResult> {
  const gatewayUrl = process.env.RESEARCH_LLM_GATEWAY_URL;
  const serviceToken = process.env.RESEARCH_LLM_SERVICE_TOKEN;
  const model = process.env.RESEARCH_LLM_MODEL || 'research-basic';

  if (!gatewayUrl || !serviceToken) {
    return { content: '', tokensUsed: null, modelUsed: null, error: 'LLM gateway not configured' };
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
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: `You are a short-form video script + storyboard expert. Generate one complete script and a Director-compatible storyboard from the provided angle and sources.

Return ONLY a valid JSON object. Do not include markdown, code blocks, or explanations outside the JSON.`,
          },
          { role: 'user', content: prompt },
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
      return { content: '', tokensUsed: null, modelUsed: null, error: errorMsg };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || null;

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
