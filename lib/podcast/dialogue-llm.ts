/**
 * Podcast dialogue LLM call (network only).
 *
 * Uses the same Research LiteLLM gateway (OpenAI-compatible) as the rest of the
 * app — provider/model stay hidden behind the gateway. NOT a direct Anthropic
 * call. Kept separate from the pure helpers so tests can mock the network.
 */

export interface DialogueLLMResult {
  content: string;
  tokensUsed: number | null;
  modelUsed: string | null;
  error?: string;
}

export async function callLLMForPodcastDialogue(
  prompt: string,
  timeoutMs: number = 30000,
): Promise<DialogueLLMResult> {
  const gatewayUrl = process.env.RESEARCH_LLM_GATEWAY_URL;
  const serviceToken = process.env.RESEARCH_LLM_SERVICE_TOKEN;
  const model = process.env.RESEARCH_LLM_MODEL || "research-basic";

  if (!gatewayUrl || !serviceToken) {
    return { content: "", tokensUsed: null, modelUsed: null, error: "LLM gateway not configured" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "You are a podcast dialogue writer. Produce a natural two-person (host/guest) conversation. " +
              "Return ONLY a valid JSON object. Do not include markdown, code blocks, or any text outside the JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorMsg =
        response.status === 429
          ? "Rate limited by LLM provider"
          : response.status >= 500
            ? "LLM provider error"
            : `LLM request failed: ${response.status}`;
      return { content: "", tokensUsed: null, modelUsed: null, error: errorMsg };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content || "";
    return { content, tokensUsed: data.usage?.total_tokens || null, modelUsed: data.model || model };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { content: "", tokensUsed: null, modelUsed: null, error: `LLM request timed out after ${timeoutMs}ms` };
    }
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return { content: "", tokensUsed: null, modelUsed: null, error: errMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}
