import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canMakeMontage, formatBytes, isMontageClip, montageRequestBody, togglePick } from "./select";
import { MAX_MONTAGE_CLIPS, montageDownloadName, montageFileName, montageName, parseMontageFileName } from "./files";

const video = (over = {}) => ({ status: "done", template_version: "minimax-h3@1", assets: [{ id: "a", role: "final", mime: "video/mp4" }, { id: "b", role: "raw", mime: "video/mp4" }], ...over });

describe("which generations can be joined", () => {
  it("a finished video with a file for the chosen sound", () => {
    expect(isMontageClip(video())).toBe(true);
    expect(isMontageClip(video(), "original")).toBe(true);
    expect(isMontageClip(video({ assets: [{ id: "b", role: "raw", mime: "video/mp4" }] }), "corrected")).toBe(false);
    expect(isMontageClip(video({ assets: [{ id: "b", role: "raw", mime: "video/mp4" }] }), "original")).toBe(true);
  });
  it("not an unfinished, failed, deleted-looking or image generation", () => {
    for (const status of ["queued", "running", "failed", "expired", "cancelled", "loading"]) expect(isMontageClip(video({ status }))).toBe(false);
    expect(isMontageClip(video({ template_version: "moss-image@1", assets: [{ id: "a", role: "raw", mime: "image/png" }] }))).toBe(false);
    expect(isMontageClip(video({ assets: [] }))).toBe(false);
    expect(isMontageClip(video({ assets: undefined }))).toBe(false);
    expect(isMontageClip(video({ assets: [{ id: "a", role: "final", mime: "image/png" }] }))).toBe(false);
  });
});

describe("choosing clips in order", () => {
  it("keeps the order of the choices, removes a clip chosen again, and stops at the maximum", () => {
    expect(togglePick(togglePick(togglePick([], "b"), "a"), "c")).toEqual(["b", "a", "c"]);
    expect(togglePick(["b", "a", "c"], "a")).toEqual(["b", "c"]);
    const full = Array.from({ length: MAX_MONTAGE_CLIPS }, (_, i) => `r${i}`);
    expect(togglePick(full, "extra")).toEqual(full);
    expect(togglePick(full, "r3")).toHaveLength(MAX_MONTAGE_CLIPS - 1);
  });
  it("needs two to ten clips", () => {
    expect(canMakeMontage([])).toBe(false); expect(canMakeMontage(["a"])).toBe(false);
    expect(canMakeMontage(["a", "b"])).toBe(true); expect(canMakeMontage(Array.from({ length: 10 }, (_, i) => `r${i}`))).toBe(true);
    expect(canMakeMontage(Array.from({ length: 11 }, (_, i) => `r${i}`))).toBe(false);
  });
  it("builds the request with the order, the sound, and a name only when given", () => {
    expect(montageRequestBody(["b", "a"], "corrected", "  ")).toEqual({ run_ids: ["b", "a"], audio: "corrected" });
    expect(montageRequestBody(["b", "a"], "original", " Luz test ")).toEqual({ run_ids: ["b", "a"], audio: "original", name: "Luz test" });
  });
  it("formats sizes", () => { expect(formatBytes(null)).toBe(""); expect(formatBytes(512)).toBe("1 KB"); expect(formatBytes(4_200_000)).toBe("4.2 MB"); });
});

describe("montage file names", () => {
  const ID = "cccccccc-0000-4000-8000-000000000001";
  it("round-trips any name, ignores strays", () => {
    for (const name of ["Luz test", "Élodie été", "Luz 🌴"]) expect(parseMontageFileName(montageFileName(name, ID))).toEqual({ id: ID, name, fileName: montageFileName(name, ID) });
    for (const bad of ["notes.txt", `zz_${ID}.mp4`, `4c757a_${ID}.png`, "4c757a_not-a-uuid.mp4"]) expect(parseMontageFileName(bad)).toBeNull();
  });
  it("gives a dated default name and validates a given one", () => {
    expect(montageName(undefined, new Date("2026-11-22T14:05:09Z"))).toBe("Montage 2026-11-22 14:05");
    expect(montageName("")).toMatch(/^Montage /);
    expect(montageName("  Luz  test ")).toBe("Luz test");
    expect(montageName("x".repeat(41))).toBeNull(); expect(montageName("a\u0000b")).toBeNull(); expect(montageName(12)).toBeNull();
  });
  it("builds the download name on the server, from letters and digits only", () => {
    expect(montageDownloadName("Luz test", ID)).toBe("alphogen-Luz-test-cccccccc.mp4");
    expect(montageDownloadName("../../etc/passwd é", ID)).toBe("alphogen-etc-passwd-e-cccccccc.mp4");
    expect(montageDownloadName("🌴🌴", ID)).toBe("alphogen-montage-cccccccc.mp4");
  });
});

describe("the interface only reads and joins: it starts nothing", () => {
  it("talks only to the montage route, never to a run, a gate or a generation", () => {
    for (const f of ["components/studio/montage-panel.tsx", "lib/montage/select.ts"]) {
      const src = readFileSync(f, "utf8");
      const urls = [...src.matchAll(/["'`](\/api\/[^"'`?]*)/g)].map(m => m[1]);
      expect(urls.every(u => u === "/api/admin/studio/montages"), `${f}: ${urls.join(", ")}`).toBe(true);
      expect(src).not.toMatch(/comfy\/runs|generate\(|\.rpc\(|idempotency|localStorage/);
    }
  });
  it("the history rail makes no request of its own for the montage mode and only offers it on finished videos", () => {
    const rail = readFileSync("components/studio/history-rail.tsx", "utf8");
    expect(rail).not.toMatch(/fetch\(/);
    expect(rail).toMatch(/isMontageClip\(run, audio\)/);
    expect(rail).toMatch(/else if \(clip\) setPicked/);
  });
});
