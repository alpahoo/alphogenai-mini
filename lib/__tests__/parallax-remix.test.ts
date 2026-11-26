import { describe, expect, it } from "vitest";
import { normalizeRemixPrompt, REMIX_PROMPT_FALLBACK, REMIX_MODES } from "@/lib/parallax-remix";

describe("Parallax Remix adaptation", () => {
  it("keeps the source interaction's fallback while bounding user input", () => {
    expect(normalizeRemixPrompt("   ")).toBe(REMIX_PROMPT_FALLBACK);
    expect(normalizeRemixPrompt("  slow   camera   push-in ")).toBe("slow camera push-in");
    expect(normalizeRemixPrompt("x".repeat(2100))).toHaveLength(2000);
  });

  it("exposes the two source modes without exposing a provider name", () => {
    expect(REMIX_MODES.map((mode) => mode.id)).toEqual(["standard", "pro"]);
    expect(REMIX_MODES.join(" ")).not.toMatch(/wan|parallax/i);
  });
});


