import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORT_ENGINE, SHORT_ENGINES, isH3ShortEngine, resolveShortDuration, resolveShortEngine, shortH3Params,
  shortMaxSeconds, shortSceneCount, shortStudioUrl,
} from "@/lib/parallax-shorts";
import { resolveTemplate } from "@/lib/comfy/template";

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

  it("offers MiniMax H3 480p and 704p, named in the picker", () => {
    expect(resolveShortEngine("h3_turbo_480")).toBe("h3_turbo_480");
    expect(resolveShortEngine("h3_turbo_704")).toBe("h3_turbo_704");
    for (const id of ["h3_turbo_480", "h3_turbo_704"] as const) {
      expect(isH3ShortEngine(id)).toBe(true);
      expect(SHORT_ENGINES.find((e) => e.id === id)?.label).toMatch(/^MiniMax H3/);
    }
    expect(isH3ShortEngine("ltx_2_5")).toBe(false);
    expect(isH3ShortEngine("wan_i2v")).toBe(false);
  });

  it("caps H3 704p at 5 s and keeps 5 or 10 s elsewhere", () => {
    expect(shortMaxSeconds("h3_turbo_704")).toBe(5);
    expect(resolveShortDuration("h3_turbo_704", 10)).toBe(5);
    expect(resolveShortDuration("h3_turbo_704", 5)).toBe(5);
    for (const id of ["ltx_2_5", "wan_i2v", "h3_turbo_480"] as const) {
      expect(shortMaxSeconds(id)).toBe(10);
      expect(resolveShortDuration(id, 10)).toBe(10);
      expect(resolveShortDuration(id, 5)).toBe(5);
      expect(resolveShortDuration(id, 7)).toBe(10);
    }
  });

  it("builds H3 params the Studio binder accepts: portrait, Turbo, 480x832 or 704x1280", () => {
    const owner = "8b3a3cd3-7c7b-4ba8-9ed5-c124f3176986";
    vi.stubEnv("COMFY_H3_LONG_ENABLED", "true");
    const r480 = resolveTemplate(shortH3Params("h3_turbo_480", "A chef plates a dessert", 10), owner);
    expect(r480.graph["6"].inputs).toMatchObject({ width: 480, height: 832, length: 243 });
    expect(r480.params).toMatchObject({ aspect: "9:16", quality: "turbo", resolution: "480p", seconds: 10 });
    const r704 = resolveTemplate(shortH3Params("h3_turbo_704", "A chef plates a dessert", 5), owner);
    expect(r704.graph["6"].inputs).toMatchObject({ width: 704, height: 1280, length: 124 });
    expect(() => resolveTemplate(shortH3Params("h3_turbo_704", "A chef plates a dessert", 10), owner)).toThrow();
    vi.unstubAllEnvs();
  });

  it("opens an H3 Short in the Studio", () => {
    expect(shortStudioUrl("0b6c1f0e-5d7a-4c55-9a43-1f2b3c4d5e6f"))
      .toBe("/admin/studio?model=minimax-h3&run=0b6c1f0e-5d7a-4c55-9a43-1f2b3c4d5e6f");
  });

  it("renders LTX-2.5 Shorts as one take and leaves other engines on the default split", () => {
    expect(shortSceneCount("ltx_2_5")).toBe(1);
    expect(shortSceneCount("wan_i2v")).toBeUndefined();
    expect(shortSceneCount("h3_turbo_480")).toBeUndefined();
  });

  it("lists the default engine first", () => {
    expect(SHORT_ENGINES[0].id).toBe(DEFAULT_SHORT_ENGINE);
  });
});
