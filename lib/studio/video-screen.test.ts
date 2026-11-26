import { describe, expect, it } from "vitest";
import { findModel } from "./catalog";
import { EXAMPLE_CATEGORIES, VIDEO_EXAMPLES, examplesIn } from "./video-examples";
import { isVideoRun, needsDispatchRetry, playableAsset, tileKind, tilePrompt, tileRatio, videoFormatParams, videoRuns, type TileRun } from "./video-screen";
import { defaultValues, outputSize, validateValues, type StudioManifest } from "./manifest";

const run = (over: Partial<TileRun> = {}): TileRun => ({ id: "r", status: "done", template_version: "minimax-h3@1", assets: [], ...over });
const mp4 = (role: string, id = role) => ({ id, role, mime: "video/mp4" });

describe("Video screen history", () => {
  it("lists video runs only: image runs stay in the image Studio, and a run without a template counts as the H3 video default", () => {
    const items = [run({ id: "v1" }), run({ id: "img", template_version: "moss-image@1" }), run({ id: "v2", template_version: null })];
    expect(videoRuns(items)?.map(r => r.id)).toEqual(["v1", "v2"]);
    expect(isVideoRun({ template_version: "moss-image@1" })).toBe(false);
  });

  it("keeps 'not loaded yet' distinct from 'no videos', so the screen shows its skeleton, not its empty state", () => {
    expect(videoRuns(null)).toBeNull();
    expect(videoRuns([])).toEqual([]);
  });

  it("draws a tile from the real status: active runs wait, finished runs with a video play, everything else says so", () => {
    expect(tileKind(run({ status: "queued" }))).toBe("pending");
    expect(tileKind(run({ status: "running" }))).toBe("pending");
    expect(tileKind(run({ status: "loading" }))).toBe("pending");
    expect(tileKind(run({ assets: [mp4("final")] }))).toBe("done");
    expect(tileKind(run({ assets: [mp4("raw")] }))).toBe("done");
    for (const status of ["failed", "expired", "cancelled"]) expect(tileKind(run({ status, assets: [mp4("final")] }))).toBe("failed");
  });

  it("never plays a finished run that has no video file: it is 'unavailable', not a broken player", () => {
    expect(tileKind(run({ assets: [] }))).toBe("unavailable");
    expect(tileKind(run({ assets: undefined }))).toBe("unavailable");
    expect(tileKind(run({ assets: [{ id: "p", role: "raw", mime: "image/png" }] }))).toBe("unavailable");
  });

  it("plays the Corrected file when there is one, else the Original", () => {
    expect(playableAsset({ assets: [mp4("raw"), mp4("final")] })?.role).toBe("final");
    expect(playableAsset({ assets: [mp4("raw")] })?.role).toBe("raw");
    expect(playableAsset({ assets: [{ id: "x", role: "final", mime: "image/png" }] })).toBeUndefined();
  });

  it("sizes a tile from the requested format, 9:16 when the run does not say", () => {
    expect(tileRatio({ params_effective: { aspect: "16:9" } })).toBe("16 / 9");
    expect(tileRatio({ params_effective: { aspect: "1:1" } })).toBe("1 / 1");
    for (const aspect of [undefined, "wide", "0:9", "9:0"]) expect(tileRatio({ params_effective: { aspect } })).toBe("9 / 16");
    expect(tileRatio({ params_effective: null })).toBe("9 / 16");
  });

  it("offers 'Retry dispatch' only for a queued run whose dispatch was never acknowledged", () => {
    expect(needsDispatchRetry({ status: "queued", dispatched: false })).toBe(true);
    expect(needsDispatchRetry({ status: "queued", dispatched: true })).toBe(false);
    expect(needsDispatchRetry({ status: "queued" })).toBe(false);
    expect(needsDispatchRetry({ status: "running", dispatched: false })).toBe(false);
  });

  it("titles a tile with its prompt, 'Untitled' when it has none", () => {
    expect(tilePrompt({ params_effective: { prompt: "  A fox  " } })).toBe("A fox");
    expect(tilePrompt({ params_effective: { prompt: "  " } })).toBe("Untitled");
    expect(tilePrompt({ params_effective: undefined })).toBe("Untitled");
  });
});

describe("Video screen examples", () => {
  const h3 = findModel("minimax-h3")!.manifest!;
  const maxLength = h3.params.find(p => p.key === "prompt")!.maxLength!;

  it("ships the twelve Parallax starter prompts, each with a unique id and a known category", () => {
    expect(VIDEO_EXAMPLES).toHaveLength(12);
    expect(new Set(VIDEO_EXAMPLES.map(e => e.id)).size).toBe(12);
    const known = new Set<string>(EXAMPLE_CATEGORIES.map(c => c.id));
    for (const e of VIDEO_EXAMPLES) expect(known.has(e.category)).toBe(true);
  });

  it("every example fits the H3 prompt field, so choosing one can never produce an invalid form", () => {
    for (const e of VIDEO_EXAMPLES) { expect(e.prompt.trim().length).toBeGreaterThan(20); expect(e.prompt.length).toBeLessThanOrEqual(maxLength); }
  });

  it("filters by category, 'all' shows everything and an unknown category shows nothing", () => {
    expect(examplesIn("all")).toHaveLength(12);
    expect(examplesIn("nature").map(e => e.id).sort()).toEqual(["desert-drone", "forest-fox", "harbour-dawn"]);
    expect(examplesIn("nope")).toEqual([]);
    const total = EXAMPLE_CATEGORIES.filter(c => c.id !== "all").reduce((n, c) => n + examplesIn(c.id).length, 0);
    expect(total).toBe(12);
  });
});

describe("Video screen formats (H3 480p/704p)", () => {
  const h3 = findModel("minimax-h3")!.manifest as StudioManifest;
  const base = { ...defaultValues(h3), prompt: "Luz walks along the quay" };
  it("offers the resolution picker on the Video screen", () => {
    expect(videoFormatParams(h3).map(p => p.key)).toEqual(["resolution"]);
  });
  it("mirrors the server 704p limits: Turbo only, up to 5 s, portrait or landscape", () => {
    expect(validateValues(h3, { ...base, resolution: "704p", quality: "turbo", seconds: 5, aspect: "9:16" })).toEqual({});
    expect(validateValues(h3, { ...base, resolution: "704p", quality: "full" }).resolution).toBe("704p is available in Turbo only");
    expect(validateValues(h3, { ...base, resolution: "704p", seconds: 6 }).seconds).toBe("704p is limited to 5 seconds");
    expect(validateValues(h3, { ...base, resolution: "704p", aspect: "1:1" }).aspect).toBe("704p is available in portrait and landscape only");
    expect(validateValues(h3, { ...base, resolution: "480p", seconds: 10, aspect: "1:1" })).toEqual({});
  });
  it("reports the 704p output size", () => {
    expect(outputSize(h3, { ...base, resolution: "704p", aspect: "16:9" })).toEqual([1280, 704]);
  });
});
