import { describe, expect, it } from "vitest";
import { AI_DIRECTOR_AUTO_ENGINE, resolveDirectorEngineKey } from "@/lib/director-engine";

describe("director engine resolution", () => {
  it("resolves AI Director Auto to the configured fast Seedance engine", () => {
    expect(AI_DIRECTOR_AUTO_ENGINE).toBe("seedance2_fast_byteplus");
    expect(resolveDirectorEngineKey("auto")).toBe("seedance2_fast_byteplus");
  });

  it("keeps explicit model selections unchanged", () => {
    expect(resolveDirectorEngineKey("wan_i2v")).toBe("wan_i2v");
    expect(resolveDirectorEngineKey("seedance2_byteplus")).toBe("seedance2_byteplus");
  });
});
