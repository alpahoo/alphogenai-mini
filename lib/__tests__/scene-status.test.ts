import { describe, it, expect } from "vitest";
import { sceneStatusMeta, supportsSingleSceneRegen } from "../scene-status";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

describe("sceneStatusMeta", () => {
  it("maps known statuses to label + tone", () => {
    expect(sceneStatusMeta("done")).toEqual({ label: "Complete", tone: "done" });
    expect(sceneStatusMeta("failed")).toEqual({ label: "Failed", tone: "failed" });
    expect(sceneStatusMeta("generating").tone).toBe("active");
    expect(sceneStatusMeta("encoding").tone).toBe("active");
    expect(sceneStatusMeta("uploading").tone).toBe("active");
    expect(sceneStatusMeta("skipped")).toEqual({ label: "Skipped", tone: "skipped" });
  });

  it("falls back to Queued/pending for unknown/empty status", () => {
    expect(sceneStatusMeta("pending")).toEqual({ label: "Queued", tone: "pending" });
    expect(sceneStatusMeta("")).toEqual({ label: "Queued", tone: "pending" });
    expect(sceneStatusMeta("something_new").tone).toBe("pending");
  });

  it("labels never expose a provider/aggregator name", () => {
    for (const s of ["done", "failed", "generating", "encoding", "uploading", "skipped", "pending", "x"]) {
      expect(FORBIDDEN_RE.test(sceneStatusMeta(s).label)).toBe(false);
    }
  });
});

describe("supportsSingleSceneRegen (conservative default-deny)", () => {
  it("allows EvoLink + Bailian engines", () => {
    for (const k of [
      "evolink",
      "evolink_fast",
      "hailuo",
      "hailuo_fast",
      "happy_horse_10",
      "kling_o3",
      "kling_v3",
      "sora_2",
      "wan_26",
      "wan_27",
      "wan_26_bailian",
      "wan_27_bailian",
    ]) {
      expect(supportsSingleSceneRegen(k), k).toBe(true);
    }
  });

  it("denies BytePlus / Atlas / HeyGen / Modal-local and unknown/empty", () => {
    for (const k of [
      "seedance2_byteplus",
      "seedance2_fast_byteplus",
      "seedance15pro_byteplus",
      "seedance2_atlas",
      "seedance2_fast_atlas",
      "heygen_avatar_iv",
      "heygen_avatar_shots",
      "wan_i2v",
      "totally_unknown",
      "",
    ]) {
      expect(supportsSingleSceneRegen(k), k).toBe(false);
    }
    expect(supportsSingleSceneRegen(null)).toBe(false);
    expect(supportsSingleSceneRegen(undefined)).toBe(false);
  });
});
