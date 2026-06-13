import { describe, it, expect } from "vitest";
import {
  buildVoiceoverScript,
  VOICEOVER_MAX_CHARS,
} from "../voiceover-script";

describe("buildVoiceoverScript", () => {
  it("concatenates per-scene voiceover lines in order (canonical source)", () => {
    const result = buildVoiceoverScript({
      scenes: [
        { voiceover_line: "First line." },
        { voiceover_line: "Second line." },
        { voiceover_line: "Third line." },
      ],
      script: "Unused full prose.",
    });
    expect(result.source).toBe("scenes");
    expect(result.text).toBe("First line. Second line. Third line.");
    expect(result.sceneLineCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("skips empty / whitespace / non-string scene lines but keeps order", () => {
    const result = buildVoiceoverScript({
      scenes: [
        { voiceover_line: "  Keep one.  " },
        { voiceover_line: "   " },
        { voiceover_line: null },
        { voiceover_line: undefined },
        // @ts-expect-error — exercise malformed runtime input
        { voiceover_line: 42 },
        { voiceover_line: "Keep two." },
      ],
      script: null,
    });
    expect(result.source).toBe("scenes");
    expect(result.text).toBe("Keep one. Keep two.");
    expect(result.sceneLineCount).toBe(2);
  });

  it("collapses internal whitespace within a line", () => {
    const result = buildVoiceoverScript({
      scenes: [{ voiceover_line: "Hello\n\n  there\tworld" }],
    });
    expect(result.text).toBe("Hello there world");
  });

  it("falls back to full script when no usable scene lines", () => {
    const result = buildVoiceoverScript({
      scenes: [{ voiceover_line: "" }, { voiceover_line: null }],
      script: "  Full narration prose here.  ",
    });
    expect(result.source).toBe("script");
    expect(result.text).toBe("Full narration prose here.");
    expect(result.sceneLineCount).toBe(0);
  });

  it("falls back to script when scenes array is empty", () => {
    const result = buildVoiceoverScript({ scenes: [], script: "Prose only." });
    expect(result.source).toBe("script");
    expect(result.text).toBe("Prose only.");
  });

  it("returns empty/none when neither scenes nor script are usable", () => {
    expect(buildVoiceoverScript({ scenes: [], script: "" })).toEqual({
      text: "",
      source: "none",
      sceneLineCount: 0,
      truncated: false,
    });
    expect(buildVoiceoverScript({ scenes: [], script: null })).toEqual({
      text: "",
      source: "none",
      sceneLineCount: 0,
      truncated: false,
    });
  });

  it("tolerates malformed input without throwing", () => {
    // @ts-expect-error — scenes not an array
    expect(buildVoiceoverScript({ scenes: null, script: "X prose." }).source).toBe("script");
    // @ts-expect-error — missing scenes entirely
    expect(buildVoiceoverScript({}).source).toBe("none");
    const withJunk = buildVoiceoverScript({
      // @ts-expect-error — junk scene entries
      scenes: [null, 5, "str", { voiceover_line: "Good." }],
    });
    expect(withJunk.text).toBe("Good.");
  });

  it("truncates scenes output to VOICEOVER_MAX_CHARS on a word boundary", () => {
    const longLine = "word ".repeat(1000).trim(); // ~5000 chars
    const result = buildVoiceoverScript({ scenes: [{ voiceover_line: longLine }] });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(VOICEOVER_MAX_CHARS);
    expect(result.text.endsWith("word")).toBe(true); // clean boundary, no partial token
  });

  it("truncates script fallback to VOICEOVER_MAX_CHARS", () => {
    const longScript = "a".repeat(VOICEOVER_MAX_CHARS + 500);
    const result = buildVoiceoverScript({ scenes: [], script: longScript });
    expect(result.source).toBe("script");
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(VOICEOVER_MAX_CHARS);
  });

  it("does not truncate when exactly at the cap", () => {
    const exact = "a".repeat(VOICEOVER_MAX_CHARS);
    const result = buildVoiceoverScript({ scenes: [], script: exact });
    expect(result.truncated).toBe(false);
    expect(result.text.length).toBe(VOICEOVER_MAX_CHARS);
  });
});
