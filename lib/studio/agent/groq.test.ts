import { describe, expect, it, vi } from "vitest";
import { getAssistantProvider } from "./provider";
import { GROQ_QWEN_MODEL, groqMessages, groqQwenProvider, parseGroqCompletion } from "./groq";
import type { ProviderRequest, ToolCall } from "./provider";

const call: ToolCall = { id: "call_a", name: "get_config", input: {} };
function req(): ProviderRequest {
  return {
    system: "Only C2a tools",
    messages: [
      { role: "user", text: "Show settings" },
      { role: "assistant", text: "", toolCalls: [call] },
      { role: "tool", results: [{ id: "call_a", content: '{"ok":true}', isError: false }] },
      { role: "assistant", text: "Ready" },
      { role: "user", text: "More detail" },
    ],
    tools: [{ name: "get_config", description: "Current settings", input_schema: { type: "object", properties: {}, additionalProperties: false } }],
    maxOutputTokens: 700,
    signal: new AbortController().signal,
  };
}
const answer = (toolCalls: unknown[] = [], finish = "stop") => ({
  choices: [{ finish_reason: finish, message: { content: finish === "tool_calls" ? null : "Bonjour", tool_calls: toolCalls } }],
  usage: { prompt_tokens: 1000, completion_tokens: 90 },
});

describe("Groq Qwen adapter (fully offline)", () => {
  it("is unavailable by default and also without its key", () => {
    expect(getAssistantProvider({ GROQ_API_KEY: "secret", STUDIO_ASSISTANT_PROVIDER: "groq" })).toMatchObject({ enabled: false, reason: "disabled" });
    expect(getAssistantProvider({ STUDIO_ASSISTANT_ENABLED: "true", STUDIO_ASSISTANT_PROVIDER: "groq" })).toMatchObject({ enabled: false, reason: "no_provider" });
    const enabled = getAssistantProvider({ STUDIO_ASSISTANT_ENABLED: "true", STUDIO_ASSISTANT_PROVIDER: "groq", GROQ_API_KEY: "test-key" });
    expect(enabled.enabled).toBe(true);
    if (enabled.enabled) expect(enabled.provider).toMatchObject({ model: GROQ_QWEN_MODEL, pricing: { inputPerMTok: 0.8, outputPerMTok: 4 } });
  });

  it("converts assistant tool calls and matching tool results into Groq protocol", () => {
    expect(groqMessages(req())).toEqual([
      { role: "system", content: "Only C2a tools" },
      { role: "user", content: "Show settings" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_a", type: "function", function: { name: "get_config", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_a", content: '{"ok":true}' },
      { role: "assistant", content: "Ready" },
      { role: "user", content: "More detail" },
    ]);
  });

  it("sends a fixed model, hidden reasoning, no streaming, and only declared tools", async () => {
    const mock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify(answer()), { status: 200 }));
    const p = groqQwenProvider("test-key", mock as typeof fetch);
    const result = await p.complete(req());
    expect(result).toEqual({ text: "Bonjour", stop: "end", toolCalls: [], usage: { inputTokens: 1000, outputTokens: 90 } });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(init.signal).toBeDefined();
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({ model: GROQ_QWEN_MODEL, stream: false, reasoning_format: "hidden", reasoning_effort: "none", parallel_tool_calls: false, max_completion_tokens: 700 });
    expect(payload.tools.map((x: { function: { name: string } }) => x.function.name)).toEqual(["get_config"]);
    expect(payload.tools).not.toContainEqual(expect.objectContaining({ function: expect.objectContaining({ name: "generate" }) }));
    expect(JSON.stringify(payload)).not.toMatch(/test-key/);
  });

  it("parses local tool calls, preserves ids, and rejects malformed arguments safely", () => {
    const r = parseGroqCompletion(answer([
      { id: "call_a", type: "function", function: { name: "propose_patch", arguments: '{"changes":{"steps":30}}' } },
    ], "tool_calls"));
    expect(r).toMatchObject({ stop: "tool_use", toolCalls: [{ id: "call_a", name: "propose_patch", input: { changes: { steps: 30 } } }] });
    const bad = parseGroqCompletion(answer([
      { id: "call_b", type: "function", function: { name: "propose_patch", arguments: "{bad" } },
    ], "tool_calls"));
    expect(bad.toolCalls[0].input).toBeNull();
    expect(() => parseGroqCompletion({ choices: [{ finish_reason: "tool_calls", message: {} }] })).toThrow();
  });

  it("treats 429, provider errors and malformed responses as safe errors without exposing bodies", async () => {
    for (const status of [400, 401, 429, 500]) {
      const mock = vi.fn(async () => new Response('private response: sk-secret', { status }));
      await expect(groqQwenProvider("test-key", mock as typeof fetch).complete(req())).rejects.not.toThrow(/private|sk-secret/);
    }
    const mock = vi.fn(async () => new Response(JSON.stringify({ unexpected: "secret" }), { status: 200 }));
    await expect(groqQwenProvider("test-key", mock as typeof fetch).complete(req())).rejects.toThrow(/Missing Groq choice/);
  });

  it("passes through an abort signal without retrying any call", async () => {
    const controller = new AbortController();
    const mock = vi.fn(async (_: unknown, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      throw new Error("aborted");
    });
    const provider = groqQwenProvider("test-key", mock as typeof fetch);
    await expect(provider.complete({ ...req(), signal: controller.signal })).rejects.toThrow(/aborted/);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
