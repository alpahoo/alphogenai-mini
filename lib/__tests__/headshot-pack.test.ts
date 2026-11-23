import { describe, expect, it } from "vitest";
import { buildHeadshotPrompts, deriveHeadshotPackStatus, validateHeadshotInput } from "../headshot-pack";

describe("headshot pack", () => {
  it("requires consent and 1-6 references", () => {
    expect(validateHeadshotInput({ source_images: ["https://cdn.test/me.jpg"], consent: false }).error).toContain("permission");
    expect(validateHeadshotInput({ source_images: [], consent: true }).error).toContain("1 and 6");
    expect(validateHeadshotInput({ source_images: ["https://cdn.test/me.jpg"], consent: true }).value?.sourceImages).toHaveLength(1);
  });

  it("locks identity in every prompt", () => {
    const prompts = buildHeadshotPrompts({ name: "Maya", sourceImages: ["https://cdn.test/me.jpg"], consent: true });
    expect(Object.values(prompts)).toHaveLength(4);
    for (const prompt of Object.values(prompts)) {
      expect(prompt).toContain("exact recognizable identity");
      expect(prompt).toContain("Do not replace");
      expect(prompt).toContain("Maya");
    }
  });

  it("derives partial and ready states", () => {
    expect(deriveHeadshotPackStatus(["ready", "ready", "ready", "ready"])).toBe("ready");
    expect(deriveHeadshotPackStatus(["ready", "failed", "failed", "failed"])).toBe("partial");
  });
});
