import { describe, expect, it } from "vitest";
import { PARALLAX_MODULES, defaultModuleStates, isParallaxModuleId } from "@/lib/parallax-modules";

describe("parallax module registry", () => {
  it("keeps existing AlphoGenAI journeys on and Parallax journeys off by default", () => {
    const states = defaultModuleStates();
    expect(states.alphogenai_clipping).toBe(true);
    expect(states.alphogenai_podcast).toBe(true);
    expect(states.parallax_shorts).toBe(false);
    expect(states.parallax_audio).toBe(false);
    expect(states.parallax_remix).toBe(false);
  });

  it("accepts only registered module ids", () => {
    expect(isParallaxModuleId("parallax_shorts")).toBe(true);
    expect(isParallaxModuleId("providers")).toBe(false);
    expect(Object.keys(PARALLAX_MODULES)).toHaveLength(5);
  });
});

