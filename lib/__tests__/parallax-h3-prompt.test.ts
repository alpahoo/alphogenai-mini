import { afterEach, describe, expect, it, vi } from "vitest";
import { H3_REWRITE_MODELS, callH3RewriteLLM, cleanRewrite, h3SystemPrompt, keepAsWritten, rewriteH3Prompt } from "@/lib/parallax-h3-prompt";

const GOOD = "A barista pours steamed milk into a latte on a wooden counter, a heart forming in the foam. Slow push-in, 50 mm lens. " +
  "Warm morning light, cozy mood. Fine detail on the crema. Soundscape: gentle milk pouring, quiet café chatter.";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("H3 prompt instructions", () => {
  it("follow the Studio H3 guidance: English paragraph, fixed order, Soundscape last, vertical, no early sound", () => {
    const s = h3SystemPrompt(5);
    expect(s).toMatch(/9:16/);
    expect(s).toMatch(/5 seconds long/);
    expect(s).toMatch(/subject and action; setting; camera movement and lens; lighting and mood; texture details/);
    expect(s).toMatch(/"Soundscape:"/);
    expect(s).toMatch(/Write in English/);
    expect(s).toMatch(/keeps its language, word for word/);
    expect(s).toMatch(/first half second/);
    expect(s).toMatch(/no title, no quotes/);
  });

  it("cap dialogue at about 2.5 words per second after 1.5 s", () => {
    expect(h3SystemPrompt(5)).toMatch(/at most 8 words/);
    expect(h3SystemPrompt(10)).toMatch(/at most 21 words/);
  });
});

describe("cleanRewrite", () => {
  it("keeps a valid paragraph and strips quotes, labels, fences and line breaks", () => {
    expect(cleanRewrite(GOOD)).toBe(GOOD);
    expect(cleanRewrite(`"${GOOD}"`)).toBe(GOOD);
    expect(cleanRewrite(`Prompt: ${GOOD}`)).toBe(GOOD);
    expect(cleanRewrite("```\n" + GOOD + "\n```")).toBe(GOOD);
    expect(cleanRewrite(GOOD.replace(" Soundscape:", "\nSoundscape:"))).toBe(GOOD);
  });

  it("rejects output without a Soundscape, too short or too long", () => {
    expect(cleanRewrite(GOOD.replace("Soundscape:", "Sounds:"))).toBeNull();
    expect(cleanRewrite("Soundscape: rain.")).toBeNull();
    expect(cleanRewrite(GOOD + " x".repeat(1100))).toBeNull();
  });
});

describe("rewriteH3Prompt", () => {
  it("returns the model's H3 paragraph for a short idea", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    const call = vi.fn().mockResolvedValue(GOOD);
    expect(await rewriteH3Prompt("un latte art en cœur", 5, call)).toEqual({ prompt: GOOD, rewritten: true });
    expect(call).toHaveBeenCalledWith(h3SystemPrompt(5), "un latte art en cœur");
  });

  it("falls back to the idea when the model fails, answers badly or is not configured", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    expect(await rewriteH3Prompt("un latte", 5, vi.fn().mockRejectedValue(new Error("timeout")))).toEqual({ prompt: "un latte", rewritten: false, reason: "llm_error" });
    expect(await rewriteH3Prompt("un latte", 5, vi.fn().mockResolvedValue("Sure! Here it is."))).toEqual({ prompt: "un latte", rewritten: false, reason: "unusable_output" });
    vi.stubEnv("EVOLINK_API_KEY", "");
    const call = vi.fn();
    expect(await rewriteH3Prompt("un latte", 5, call)).toEqual({ prompt: "un latte", rewritten: false, reason: "not_configured" });
    expect(call).not.toHaveBeenCalled();
  });

  it("keeps a prompt already in H3 format or long enough to be written on purpose", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    const call = vi.fn();
    expect(keepAsWritten(GOOD)).toBe(true);
    expect(keepAsWritten("x".repeat(600))).toBe(true);
    expect(keepAsWritten("un latte")).toBe(false);
    expect(await rewriteH3Prompt(`  ${GOOD}  `, 5, call)).toEqual({ prompt: GOOD, rewritten: false, reason: "as_written" });
    expect(call).not.toHaveBeenCalled();
  });
});

describe("callH3RewriteLLM", () => {
  const answer = (content: unknown, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content, ...extra } }], usage: { completion_tokens: 12 } }), { status: 200 });

  it("returns the first model's text, with room for thinking models", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    const fetchMock = vi.fn().mockResolvedValue(answer(GOOD));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callH3RewriteLLM("sys", "idea")).toBe(GOOD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ model: H3_REWRITE_MODELS[0], max_tokens: 1500 });
  });

  it("tries the second model when the first answers with empty content", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    const fetchMock = vi.fn().mockResolvedValueOnce(answer("", { reasoning_content: "thinking" })).mockResolvedValueOnce(answer(GOOD));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callH3RewriteLLM("sys", "idea")).toBe(GOOD);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).model).toBe(H3_REWRITE_MODELS[1]);
  });

  it("throws with the answers' shape, never their text, when no model returns text", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(answer(null, { reasoning_content: "secret idea" })).mockResolvedValueOnce(new Response("no", { status: 503 })));
    const error = (await callH3RewriteLLM("sys", "idea").then(() => null, (e: unknown) => e)) as Error;
    expect(error.message).toMatch(/deepseek-chat: empty content .*"finish_reason":"stop".*"message_keys":\["role","content","reasoning_content"\]/);
    expect(error.message).toMatch(/HTTP 503/);
    expect(error.message).not.toMatch(/secret idea/);
  });
});
