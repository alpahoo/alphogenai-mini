/**
 * Joins finished clips into one MP4, in the given order, keeping sound and picture in step at every cut.
 *
 * Why not simply concatenate with `-c copy`: tested on three real H3 clips (22/11/2026), a plain copy leaves the
 * sound 49 ms later at every join (32 ms of AAC encoder delay and 17 ms of padding per clip), so the third clip
 * is about three frames out of sync. The method that holds:
 *   1. the video is copied as is (concat demuxer, no re-encoding, no quality loss, needs identical formats);
 *   2. each clip's audio is cut to the exact length of its video (frames / frame rate), given a 8 ms fade at both
 *      ends against clicks, joined, and encoded once as AAC;
 *   3. the two are muxed together.
 * Measured on the three real clips: sound/picture offset 0.00 ms at both cuts, 372 frames, under a second.
 * It needs only ffmpeg's native AAC encoder (no libx264).
 *
 * Read only toward everything else: no network, no database, no GPU, no gate. Files are written to a temporary
 * folder that is always removed.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MontageError, formatMismatch, readClipInfo } from "./mp4-info";

export const FADE_S = 0.008;
export const AUDIO_BITRATE = "192k";
const FFMPEG_TIMEOUT_MS = 40_000;

/** Runs ffmpeg with these arguments inside `cwd`. Injected in tests. */
export type Runner = (ffmpeg: string, args: string[], cwd: string) => Promise<void>;

export const defaultRunner: Runner = (ffmpeg, args, cwd) => new Promise((resolve, reject) => {
  execFile(ffmpeg, args, { cwd, timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
    if (err) { console.warn(JSON.stringify({ event: "montage_ffmpeg_failed", reason: String(stderr || err.message).slice(0, 400) })); reject(err); } else resolve();
  });
});

/**
 * A binary that exists but lost its executable bit (a bundled file on a serverless platform) is copied to the
 * temporary folder and made executable, once. Returns the path to run, or null when it cannot be made to run.
 */
export function ensureExecutable(file: string): string | null {
  try { fs.accessSync(file, fs.constants.X_OK); return file; } catch { /* fall through to the copy */ }
  try {
    const copy = path.join(os.tmpdir(), `alphogen-ffmpeg-${process.pid}`);
    if (!fs.existsSync(copy)) { fs.copyFileSync(file, copy); fs.chmodSync(copy, 0o755); }
    fs.accessSync(copy, fs.constants.X_OK);
    return copy;
  } catch { return null; }
}

/** The ffmpeg binary: FFMPEG_PATH, else the one installed by `ffmpeg-static`. Null when there is none. */
export async function resolveFfmpeg(): Promise<string | null> {
  const env = process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return ensureExecutable(env);
  try {
    const mod = (await import("ffmpeg-static")) as { default?: string | null };
    const p = mod.default;
    return p && fs.existsSync(p) ? ensureExecutable(p) : null;
  } catch { return null; }
}

export interface MontageResult { bytes: Buffer; frames: number; durationS: number; clips: number }

export async function buildMontage(clips: Uint8Array[], opts: { run?: Runner; ffmpeg?: string | null; fadeS?: number } = {}): Promise<MontageResult> {
  if (clips.length < 2) throw new MontageError("invalid", "A montage needs at least two clips.", 400);
  const infos = clips.map(readClipInfo);
  infos.forEach((info, i) => { if (!info.audio) throw new MontageError("no_audio", `Clip ${i + 1} has no audio track.`); });
  for (let i = 1; i < infos.length; i++) {
    const why = formatMismatch(infos[0], infos[i]);
    if (why) throw new MontageError("different_format", `Clip ${i + 1} cannot be joined with clip 1: ${why}. Joining different formats needs re-encoding, which is not supported yet.`);
  }
  const ffmpeg = opts.ffmpeg === undefined ? await resolveFfmpeg() : opts.ffmpeg;
  if (!ffmpeg) throw new MontageError("unavailable", "Joining clips is not available on this server (ffmpeg is not installed).", 501);

  const fade = opts.fadeS ?? FADE_S;
  const run = opts.run ?? defaultRunner;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alphogen-montage-"));
  try {
    await Promise.all(clips.map((bytes, i) => fs.promises.writeFile(path.join(dir, `c${i}.mp4`), bytes)));
    await fs.promises.writeFile(path.join(dir, "list.txt"), clips.map((_, i) => `file 'c${i}.mp4'`).join("\n") + "\n");

    // 1. Picture: copied. 2. Sound: each clip cut to its exact video length, faded, joined, encoded once. 3. Muxed.
    await run(ffmpeg, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c:v", "copy", "-an", "-movflags", "+faststart", "video.mp4"], dir);
    const chains = infos.map((info, i) => {
      const d = info.video.durationS;
      return `[${i}:a]atrim=0:${d.toFixed(7)},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${(d - fade).toFixed(7)}:d=${fade}[a${i}]`;
    });
    const graph = `${chains.join(";")};${infos.map((_, i) => `[a${i}]`).join("")}concat=n=${infos.length}:v=0:a=1[a]`;
    await run(ffmpeg, ["-y", "-v", "error", ...clips.flatMap((_, i) => ["-i", `c${i}.mp4`]), "-filter_complex", graph, "-map", "[a]", "-c:a", "aac", "-b:a", AUDIO_BITRATE, "-ar", String(infos[0].audio!.sampleRate), "audio.m4a"], dir);
    await run(ffmpeg, ["-y", "-v", "error", "-i", "video.mp4", "-i", "audio.m4a", "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", "out.mp4"], dir);

    const bytes = await fs.promises.readFile(path.join(dir, "out.mp4"));
    // The result must really contain every frame and a sound track.
    const out = readClipInfo(bytes);
    const frames = infos.reduce((n, i) => n + i.video.frames, 0);
    if (out.video.frames !== frames || !out.audio) throw new MontageError("failed", "The montage could not be built.", 500);
    return { bytes, frames, durationS: out.video.durationS, clips: clips.length };
  } catch (e) {
    if (e instanceof MontageError) throw e;
    throw new MontageError("failed", "The montage could not be built.", 500);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
