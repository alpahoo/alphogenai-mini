import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanRewrite, h3SystemPrompt, keepAsWritten, rewriteH3Prompt } from "@/lib/parallax-h3-prompt";

const GOOD = "A barista pours steamed milk into a latte on a wooden counter, a heart forming in the foam. Slow push-in, 50 mm lens. " +
  "Warm morning light, cozy mood. Fine detail on the crema. Soundscape: gentle milk pouring, quiet café chatter.";

afterEach(() => vi.unstubAllEnvs());

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
    expect(await rewriteH3Prompt("un latte", 5, vi.fn().mockRejectedValue(new Error("timeout")))).toEqual({ prompt: "un latte", rewritten: false });
    expect(await rewriteH3Prompt("un latte", 5, vi.fn().mockResolvedValue("Sure! Here it is."))).toEqual({ prompt: "un latte", rewritten: false });
    vi.stubEnv("EVOLINK_API_KEY", "");
    const call = vi.fn();
    expect(await rewriteH3Prompt("un latte", 5, call)).toEqual({ prompt: "un latte", rewritten: false });
    expect(call).not.toHaveBeenCalled();
  });

  it("keeps a prompt already in H3 format or long enough to be written on purpose", async () => {
    vi.stubEnv("EVOLINK_API_KEY", "test");
    const call = vi.fn();
    expect(keepAsWritten(GOOD)).toBe(true);
    expect(keepAsWritten("x".repeat(600))).toBe(true);
    expect(keepAsWritten("un latte")).toBe(false);
    expect(await rewriteH3Prompt(`  ${GOOD}  `, 5, call)).toEqual({ prompt: GOOD, rewritten: false });
    expect(call).not.toHaveBeenCalled();
  });
});
