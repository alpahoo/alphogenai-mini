import { describe, expect, it } from "vitest";
import { DEFAULT_SHORT_ENGINE, SHORT_ENGINES, resolveShortEngine, shortSceneCount } from "@/lib/parallax-shorts";

describe("Shorts engine choice", () => {
  it("defaults to LTX-2.5", () => {
    expect(DEFAULT_SHORT_ENGINE).toBe("ltx_2_5");
    expect(resolveShortEngine(undefined)).toBe("ltx_2_5");
    expect(resolveShortEngine("not-an-engine")).toBe("ltx_2_5");
  });

  it("keeps an available choice", () => {
    expect(resolveShortEngine("wan_i2v")).toBe("wan_i2v");
    expect(resolveShortEngine("ltx_2_5")).toBe("ltx_2_5");
  });

  it("never sends an engine that is not wired yet (MiniMax H3 comes in step 2)", () => {
    for (const option of SHORT_ENGINES.filter((e) => !e.available)) {
      expect(resolveShortEngine(option.id)).toBe("ltx_2_5");
    }
    expect(SHORT_ENGINES.find((e) => e.id === "h3_turbo_480")?.available).toBe(false);
    expect(SHORT_ENGINES.find((e) => e.id === "h3_turbo_704")?.available).toBe(false);
  });

  it("renders LTX-2.5 Shorts as one take and leaves other engines on the default split", () => {
    expect(shortSceneCount("ltx_2_5")).toBe(1);
    expect(shortSceneCount("wan_i2v")).toBeUndefined();
  });

  it("lists the default engine first", () => {
    expect(SHORT_ENGINES[0].id).toBe(DEFAULT_SHORT_ENGINE);
  });
});
