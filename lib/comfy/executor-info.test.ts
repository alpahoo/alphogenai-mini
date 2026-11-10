import { describe, expect, it } from "vitest";
import { executorInfo, MOSS_GPU_ENV, parseExecutorGpu } from "./executor-info";

describe("executorInfo: GPU only from server sources, never guessed", () => {
  it("parses exactly L40S or H100, like the Modal selector", () => {
    expect(parseExecutorGpu("L40S")).toBe("L40S");
    expect(parseExecutorGpu("H100")).toBe("H100");
    for (const v of [undefined, "", "h100", " H100", "H100 ", "A100", "L40S,H100", "auto"]) expect(parseExecutorGpu(v)).toBeNull();
  });

  it("MOSS without the server variable: GPU not confirmed and no estimate", () => {
    expect(executorInfo("moss-image", {})).toEqual({ gpu: null, gpu_source: null, estimate: null });
    expect(executorInfo("moss-image", { [MOSS_GPU_ENV]: "A100" })).toEqual({ gpu: null, gpu_source: null, estimate: null });
  });

  it("MOSS on H100: measured estimate from the 10 Nov 2026 run", () => {
    const info = executorInfo("moss-image", { [MOSS_GPU_ENV]: "H100" });
    expect(info.gpu).toBe("H100");
    expect(info.gpu_source).toBe("server_config");
    expect(info.estimate).toMatchObject({ low_usd: 0.06, high_usd: 0.06, measured: true });
  });

  it("MOSS on L40S: labelled as an unmeasured estimate", () => {
    const info = executorInfo("moss-image", { [MOSS_GPU_ENV]: "L40S" });
    expect(info.estimate).toMatchObject({ low_usd: 0.03, high_usd: 0.10, measured: false });
  });

  it("H3 is fixed to H100 by its executor code and ignores the MOSS variable", () => {
    for (const env of [{}, { [MOSS_GPU_ENV]: "L40S" }]) {
      const info = executorInfo("minimax-h3", env);
      expect(info).toMatchObject({ gpu: "H100", gpu_source: "executor_code" });
      expect(info.estimate?.measured).toBe(false);
    }
  });

  it("every estimate is labelled with its basis", () => {
    for (const [slug, gpu] of [["moss-image", "H100"], ["moss-image", "L40S"], ["minimax-h3", undefined]] as const) {
      expect(executorInfo(slug, { [MOSS_GPU_ENV]: gpu }).estimate?.basis.length).toBeGreaterThan(10);
    }
  });
});
