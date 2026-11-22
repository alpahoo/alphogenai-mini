import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  durationNote, formatFact, mutedFor, primaryVideoAsset, runFacts, speechAtStartCaution, videoCompareCandidates, createSeekMirror, nextAudibleOnVolumeChange, shouldResumePlayer,
} from "./video-compare";
import type { StudioRun } from "@/components/studio/types";

const run = (id: string, over: Partial<StudioRun> = {}): StudioRun => ({
  id, status: "done", error_code: null, generation_seconds: 42.4, template_version: "minimax-h3@1",
  params_effective: { prompt: "A fox", aspect: "16:9", seconds: 5, quality: "turbo", seed: 7, audio_shift_s: 0.4 },
  assets: [{ id: `${id}-raw`, role: "raw" }, { id: `${id}-final`, role: "final" }], ...over,
});

describe("video run comparison candidates", () => {
  it("lists only other, completed video runs that have a file", () => {
    const history = [
      run("a"), run("b"), run("c", { status: "failed" }), run("d", { status: "running" }),
      run("e", { assets: [] }), run("img", { template_version: "moss-image@1" }), run("f", { status: "expired" }),
    ];
    expect(videoCompareCandidates(history, "a").map(r => r.id)).toEqual(["b"]);
  });
  it("is empty for no history (null while loading) and never includes the selected run", () => {
    expect(videoCompareCandidates(null, "a")).toEqual([]);
    expect(videoCompareCandidates([run("a")], "a")).toEqual([]);
  });
  it("shows the corrected file when it exists, otherwise the original", () => {
    expect(primaryVideoAsset(run("a"))?.role).toBe("final");
    expect(primaryVideoAsset(run("a", { assets: [{ id: "x", role: "raw" }] }))?.role).toBe("raw");
    expect(primaryVideoAsset(run("a", { assets: [] }))).toBeUndefined();
  });
});

describe("run facts", () => {
  it("reports model, version, format, duration, quality and generation time", () => {
    const f = runFacts(run("a"));
    expect(f).toMatchObject({ model: "MiniMax H3", version: "1", aspect: "16:9", seconds: 5, quality: "turbo", generationSeconds: 42, seed: "7", audioShiftS: 0.4 });
    expect(formatFact("seconds", f)).toBe("5 s");
    expect(formatFact("quality", f)).toBe("Turbo");
    expect(formatFact("generationSeconds", f)).toBe("42 s");
  });
  it("says 'Not recorded' instead of inventing values for older runs", () => {
    const f = runFacts(run("old", { params_effective: null, generation_seconds: null, template_version: null }));
    expect(formatFact("seconds", f)).toBe("Not recorded");
    expect(formatFact("quality", f)).toBe("Not recorded");
    expect(formatFact("generationSeconds", f)).toBe("Not recorded");
    expect(formatFact("audioShiftS", f)).toBe("Not recorded");
  });
});

describe("clips of different lengths", () => {
  it("explains which clip stops early", () => {
    expect(durationNote(4, 8)).toMatch(/Clip A is shorter \(4\.0 s vs 8\.0 s\).*last frame while B keeps playing/);
    expect(durationNote(8, 4)).toMatch(/Clip B is shorter/);
  });
  it("says nothing for equal or unknown durations", () => {
    expect(durationNote(5, 5.1)).toBeNull();
    expect(durationNote(undefined, 5)).toBeNull();
    expect(durationNote(NaN, 5)).toBeNull();
  });
});

describe("speech-at-start precaution", () => {
  it("flags prompts that ask for speech without delaying it", () => {
    expect(speechAtStartCaution('A woman says "Welcome to the show" to the camera')).toBe(true);
    expect(speechAtStartCaution("A narrator explains the steps in a calm voice")).toBe(true);
    expect(speechAtStartCaution("Elle dit bonjour à la caméra")).toBe(true);
  });
  it("does not flag silent prompts or speech that explicitly starts later", () => {
    expect(speechAtStartCaution("A fox runs through a snowy forest, soundscape: wind")).toBe(false);
    expect(speechAtStartCaution('After a short pause she says: "Thank you for having me."')).toBe(false);
    expect(speechAtStartCaution("")).toBe(false);
    expect(speechAtStartCaution(undefined)).toBe(false);
  });
  it("is worded as a precaution based on the prompt, never as detected sound", () => {
    const src = readFileSync("lib/studio/video-compare.ts", "utf8");
    expect(src).toMatch(/Precaution/);
    expect(src).toMatch(/based on the prompt text only, not on the actual sound/);
  });
});

describe("one soundtrack at a time", () => {
  it("never has both tracks audible", () => {
    for (const audible of ["a", "b", "off"] as const) {
      const heard = (["a", "b"] as const).filter(side => !mutedFor(audible, side));
      expect(heard.length).toBeLessThanOrEqual(1);
    }
    expect(mutedFor("off", "a")).toBe(true); expect(mutedFor("off", "b")).toBe(true);
    expect(mutedFor("a", "a")).toBe(false); expect(mutedFor("a", "b")).toBe(true);
  });
});

describe("read only: comparing never generates, reserves or exposes anything", () => {
  const files = ["lib/studio/video-compare.ts", "components/studio/video-compare.tsx", "components/studio/private-video.tsx"];
  it("makes no run, dispatch, gate or reservation request and stores nothing", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/fetch\(|\/api\/admin\/comfy\/runs|generate\(|retryDispatch|dispatch|idempotency|admit|reserv|localStorage|sessionStorage|supabase|modal_call/i);
    }
  });
  it("signs only through the existing owner-scoped media route (via signMedia), never builds a URL itself", () => {
    const player = readFileSync("components/studio/private-video.tsx", "utf8");
    expect(player).toMatch(/signMedia\(asset\.id/);
    expect(player).not.toMatch(/storage|createSignedUrl|https?:\/\//);
  });
  it("reuses the existing compare state and candidates instead of a new store", () => {
    const hook = readFileSync("components/studio/use-studio.ts", "utf8");
    expect(hook).toMatch(/const \[compareWith, setCompareWith\]/);
    expect(hook).not.toMatch(/compareVideo/);
  });
});

describe("mirrored seeking with unequal durations", () => {
  it("does not pull a 10-second clip back to 4 seconds when the 4-second clip reports its mirrored seek", () => {
    const mirror = createSeekMirror();
    const a = { currentTime: 8, duration: 10 };
    const b = { currentTime: 0, duration: 4 };
    mirror(a, b);
    expect(b.currentTime).toBe(4);
    mirror(b, a); // Programmatic seeked, not a new user action
    expect(a.currentTime).toBe(8);
    b.currentTime = 2; // Actual user seek of the shorter clip
    mirror(b, a);
    expect(a.currentTime).toBe(2);
    mirror(a, b);
    expect(b.currentTime).toBe(2);
  });
  it("mirrors within tolerance without recursive ping-pong", () => {
    const mirror = createSeekMirror();
    const a = { currentTime: 3, duration: 10 }, b = { currentTime: 0, duration: 10 };
    mirror(a,b); mirror(b,a);
    expect(a.currentTime).toBe(3);
    expect(b.currentTime).toBe(3);
  });
});
describe("native volume controls", () => {
  it("switches to the unmuted track and switches off when that track is muted", () => {
    expect(nextAudibleOnVolumeChange("a","b",false)).toBe("b");
    expect(nextAudibleOnVolumeChange("b","a",true)).toBe("b");
    expect(nextAudibleOnVolumeChange("b","b",true)).toBe("off");
    expect(nextAudibleOnVolumeChange("off","a",false)).toBe("a");
  });
  it("wires the native volumechange event to both players and immediately silences the other", () => {
    const ui = readFileSync("components/studio/video-compare.tsx","utf8");
    const player = readFileSync("components/studio/private-video.tsx","utf8");
    expect(ui.match(/onVolumeChange=\{video => onVolumeChange\(side, video\)\}/g)).toHaveLength(2);
    expect(ui).toMatch(/other\.muted = true/);
    expect(player).toMatch(/onVolumeChange=\{e => onVolumeChange\?\.\(e\.currentTarget\)\}/);
  });
});

describe("resume after unequal-duration playback", () => {
  it("only resumes a paused player that has not already ended", () => {
    expect(shouldResumePlayer({paused:true,ended:false})).toBe(true);
    expect(shouldResumePlayer({paused:true,ended:true})).toBe(false);
    expect(shouldResumePlayer({paused:false,ended:false})).toBe(false);
    const ui=readFileSync("components/studio/video-compare.tsx","utf8");
    expect(ui).toMatch(/vs\.filter\(shouldResumePlayer\)/);
  });
});
