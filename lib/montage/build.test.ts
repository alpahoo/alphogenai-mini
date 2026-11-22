import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildMontage, resolveFfmpeg, type Runner } from "./build";
import { MontageError, formatMismatch, readClipInfo } from "./mp4-info";

const fx = (name: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "__fixtures__", `${name}.mp4`)));
const t440 = fx("tone440"), t660 = fx("tone660"), t880 = fx("tone880"), otherSize = fx("other-size"), noAudio = fx("no-audio");
const ffmpegPath = await resolveFfmpeg();

describe("reading a clip", () => {
  it("reads the video and audio format and the exact length from the frame table", () => {
    const info = readClipInfo(t440);
    expect(info.video).toMatchObject({ codec: "avc1", width: 96, height: 160, frames: 24, durationS: 1 });
    expect(info.video.config).toMatch(/^avcC:01640/); // High profile
    expect(info.audio).toEqual({ codec: "mp4a", channels: 2, sampleRate: 32000 });
  });
  it("reports a clip without sound", () => { expect(readClipInfo(noAudio).audio).toBeNull(); });
  it("refuses what is not a readable MP4, without crashing", () => {
    for (const bad of [new Uint8Array(0), new Uint8Array([1, 2, 3]), new TextEncoder().encode("not a video at all, just text"), t440.subarray(0, 50), t440.subarray(0, t440.length - 3000)]) {
      expect(() => readClipInfo(bad)).toThrow(MontageError);
    }
  });
  it("two clips of the same format match, a different size, config or missing audio does not", () => {
    expect(formatMismatch(readClipInfo(t440), readClipInfo(t880))).toBeNull();
    expect(formatMismatch(readClipInfo(t440), readClipInfo(otherSize))).toMatch(/picture size differs \(96×160 and 128×160\)|video format differs/);
    expect(formatMismatch(readClipInfo(t440), readClipInfo(noAudio))).toMatch(/no audio/);
  });
});

describe("buildMontage: the method", () => {
  const runs: { args: string[]; cwd: string; files: string[] }[] = [];
  const fake: Runner = async (_ff, args, cwd) => {
    runs.push({ args, cwd, files: fs.readdirSync(cwd).sort() });
    // Write plausible outputs so the later steps and the final check have something to read.
    if (args.includes("video.mp4") && !args.includes("out.mp4")) fs.writeFileSync(path.join(cwd, "video.mp4"), "v");
    if (args.includes("audio.m4a") && !args.includes("out.mp4")) fs.writeFileSync(path.join(cwd, "audio.m4a"), "a");
    if (args.includes("out.mp4")) fs.writeFileSync(path.join(cwd, "out.mp4"), Buffer.concat([Buffer.from(t440)]));
  };

  it("copies the video, cuts each audio to its exact video length with short fades, and muxes (no re-encoding of the picture)", async () => {
    runs.length = 0;
    // The fake output is one clip, so the final frame check fails: the commands are what is asserted here.
    await buildMontage([t440, t660, t880], { run: fake, ffmpeg: "ffmpeg-test" }).catch(() => undefined);
    expect(runs).toHaveLength(3);
    const [video, audio, mux] = runs.map(r => r.args);
    expect(video).toEqual(["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c:v", "copy", "-an", "-movflags", "+faststart", "video.mp4"]);
    expect(audio.slice(0, 9)).toEqual(["-y", "-v", "error", "-i", "c0.mp4", "-i", "c1.mp4", "-i", "c2.mp4"]);
    const graph = audio[audio.indexOf("-filter_complex") + 1];
    for (let i = 0; i < 3; i++) expect(graph).toContain(`[${i}:a]atrim=0:1.0000000,asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=0.9920000:d=0.008[a${i}]`);
    expect(graph).toContain("[a0][a1][a2]concat=n=3:v=0:a=1[a]");
    expect(audio).toEqual(expect.arrayContaining(["-c:a", "aac", "-b:a", "192k", "-ar", "32000", "audio.m4a"]));
    expect(mux).toEqual(["-y", "-v", "error", "-i", "video.mp4", "-i", "audio.m4a", "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", "out.mp4"]);
    // No picture re-encoding anywhere, and no library the minimal ffmpeg would lack.
    expect(runs.flatMap(r => r.args).join(" ")).not.toMatch(/libx264|-c:v libx|-crf|-preset/);
  });

  it("lists the clips in the given order and always removes its temporary folder", async () => {
    runs.length = 0;
    await buildMontage([t880, t440], { run: fake, ffmpeg: "ffmpeg-test" }).catch(() => undefined);
    expect(runs[0].files).toEqual(["c0.mp4", "c1.mp4", "list.txt"]);
    const dir = runs[0].cwd;
    expect(fs.existsSync(dir)).toBe(false);
    expect(path.dirname(dir)).toBe(path.resolve(os.tmpdir()));
  });

  it("uses the exact video length of each clip, so sound cannot drift", async () => {
    runs.length = 0;
    await buildMontage([t440, t660], { run: fake, ffmpeg: "ffmpeg-test" }).catch(() => undefined);
    const graph = runs[1].args[runs[1].args.indexOf("-filter_complex") + 1];
    expect(graph.match(/atrim=0:1\.0000000/g)).toHaveLength(2);
  });
});

describe("buildMontage: refusals and failures are explicit", () => {
  it("needs two clips", async () => {
    await expect(buildMontage([t440], { ffmpeg: "x" })).rejects.toMatchObject({ code: "invalid", status: 400 });
  });
  it("refuses a clip without sound, a different format and an unreadable file, before running anything", async () => {
    const run = vi.fn() as unknown as Runner;
    await expect(buildMontage([t440, noAudio], { run, ffmpeg: "x" })).rejects.toMatchObject({ code: "no_audio" });
    await expect(buildMontage([t440, otherSize], { run, ffmpeg: "x" })).rejects.toMatchObject({ code: "different_format" });
    await expect(buildMontage([t440, new Uint8Array([1, 2, 3])], { run, ffmpeg: "x" })).rejects.toMatchObject({ code: "unreadable" });
    expect(run).not.toHaveBeenCalled();
    await expect(buildMontage([t440, otherSize], { run, ffmpeg: "x" })).rejects.toThrow(/Clip 2 cannot be joined with clip 1: .* re-encoding, which is not supported yet/);
  });
  it("says so when ffmpeg is not installed (501), without running anything", async () => {
    const run = vi.fn() as unknown as Runner;
    await expect(buildMontage([t440, t660], { run, ffmpeg: null })).rejects.toMatchObject({ code: "unavailable", status: 501 });
    expect(run).not.toHaveBeenCalled();
  });
  it("a failing ffmpeg gives a generic error (details stay in the server log) and the folder is still removed", async () => {
    let dir = "";
    const run: Runner = async (_f, _a, cwd) => { dir = cwd; throw new Error("secret ffmpeg stderr"); };
    const err = await buildMontage([t440, t660], { run, ffmpeg: "x" }).catch(e => e);
    expect(err).toBeInstanceOf(MontageError);
    expect(err).toMatchObject({ code: "failed", status: 500, message: "The montage could not be built." });
    expect(fs.existsSync(dir)).toBe(false);
  });
  it("never reports success when the result is incomplete (a frame is missing or the sound is gone)", async () => {
    const run: Runner = async (_f, args, cwd) => { if (args.includes("out.mp4")) fs.writeFileSync(path.join(cwd, "out.mp4"), noAudio); else fs.writeFileSync(path.join(cwd, args[args.length - 1]), "x"); };
    await expect(buildMontage([t440, t660], { run, ffmpeg: "x" })).rejects.toMatchObject({ code: "failed" });
  });
});

/** Zero crossings per second of the signal in each window: 440, 660 and 880 Hz tones give 880, 1320 and 1760. */
function toneBoundaries(pcm: Float32Array, sr: number, winMs = 5) {
  const w = Math.round(sr * winMs / 1000), classes: (number | null)[] = [];
  for (let i = 0; i + w <= pcm.length; i += w) {
    let peak = 0, zc = 0;
    for (let j = i; j < i + w; j++) { peak = Math.max(peak, Math.abs(pcm[j])); if (j > i && (pcm[j - 1] < 0) !== (pcm[j] < 0)) zc++; }
    if (peak < 0.05) { classes.push(null); continue; } // silence (the fixtures' tones peak near 0.125)
    const hz = zc / (w / sr) / 2;
    classes.push([440, 660, 880].reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a)));
  }
  const changes: number[] = []; let last: number | null = null, lastIdx = 0;
  classes.forEach((c, k) => { if (c === null) return; if (last !== null && c !== last) changes.push(((lastIdx + 1 + k) / 2) * winMs / 1000); last = c; lastIdx = k; });
  return changes;
}
const decode = (ffmpeg: string, file: string) => new Promise<Float32Array>((resolve, reject) => {
  execFile(ffmpeg, ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "32000", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
    if (err) reject(err); else resolve(new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)));
  });
});

describe.skipIf(!ffmpegPath)("buildMontage with the real ffmpeg", () => {
  it("joins three clips in order: 72 frames, 3.0 s, picture and sound in step at both cuts", async () => {
    const out = await buildMontage([t440, t660, t880]);
    const info = readClipInfo(out.bytes);
    expect(out).toMatchObject({ frames: 72, clips: 3 });
    expect(info.video).toMatchObject({ frames: 72, width: 96, height: 160 });
    expect(info.video.durationS).toBeCloseTo(3, 3);
    expect(info.audio).toMatchObject({ codec: "mp4a", channels: 2, sampleRate: 32000 });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montage-test-")); const file = path.join(dir, "out.mp4");
    try {
      fs.writeFileSync(file, out.bytes);
      const pcm = await decode(ffmpegPath!, file);
      const cuts = toneBoundaries(pcm, 32000);
      // ffmpeg applies the file's edit list, so the AAC encoder delay is already skipped: the cuts sit at 1.0 s and 2.0 s.
      expect(cuts).toHaveLength(2);
      expect(Math.abs(cuts[0] - 1)).toBeLessThan(0.012);
      expect(Math.abs(cuts[1] - 2)).toBeLessThan(0.012);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("control: a plain stream copy puts the second clip's sound later than its picture (why this method exists)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montage-ctl-"));
    try {
      for (const [i, c] of [t440, t660, t880].entries()) fs.writeFileSync(path.join(dir, `c${i}.mp4`), c);
      fs.writeFileSync(path.join(dir, "list.txt"), "file 'c0.mp4'\nfile 'c1.mp4'\nfile 'c2.mp4'\n");
      await new Promise<void>((ok, ko) => execFile(ffmpegPath!, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "copy.mp4"], { cwd: dir }, e => (e ? ko(e) : ok())));
      const cuts = toneBoundaries(await decode(ffmpegPath!, path.join(dir, "copy.mp4")), 32000);
      // The copy's cuts are later than 1.0 s and 2.0 s (it adds each clip's AAC delay and padding): beyond the method's 12 ms.
      console.info("plain copy cuts (s):", cuts.map(c => c.toFixed(3)).join(", "));
      expect(Math.max(Math.abs(cuts[0] - 1), Math.abs(cuts[1] - 2))).toBeGreaterThan(0.012);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
