import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { enhancePrompt } from "../prompt-enhancer";

// ---------------------------------------------------------------------------
// These tests exercise the skip/passthrough paths of enhancePrompt().
// When EVOLINK_API_KEY is not set (default in test env), the function
// returns the original prompt — no mocks or network calls needed.
// ---------------------------------------------------------------------------

describe("enhancePrompt — skip behavior", () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.EVOLINK_API_KEY;
    delete process.env.EVOLINK_API_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.EVOLINK_API_KEY = originalKey;
    }
  });

  it("returns original when no API key", async () => {
    const prompt = "a cat jumping";
    const result = await enhancePrompt(prompt);
    expect(result).toBe(prompt);
  });

  it("returns original for long prompts (>300 chars)", async () => {
    // Even with API key, prompts >300 chars are skipped
    process.env.EVOLINK_API_KEY = "test-key";
    const longPrompt = "A ".repeat(200); // 400 chars
    const result = await enhancePrompt(longPrompt);
    expect(result).toBe(longPrompt);
    delete process.env.EVOLINK_API_KEY;
  });

  it("returns original for exactly 301 chars", async () => {
    process.env.EVOLINK_API_KEY = "test-key";
    const prompt = "x".repeat(301);
    const result = await enhancePrompt(prompt);
    expect(result).toBe(prompt);
    delete process.env.EVOLINK_API_KEY;
  });

  it("preserves whitespace in original prompt", async () => {
    const prompt = "  a cat jumping  ";
    const result = await enhancePrompt(prompt);
    expect(result).toBe(prompt);
  });

  it("handles empty string", async () => {
    const result = await enhancePrompt("");
    expect(result).toBe("");
  });
});
