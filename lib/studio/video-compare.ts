/**
 * Phase 4B.2: pure helpers for comparing two video runs and for the audio information shown with H3 results.
 * Read-only: pure functions, no network, no storage, no GPU.
 */
import { modelForTemplateVersion } from "./catalog";
import type { StudioAsset, StudioRun } from "@/components/studio/types";

/** The asset shown for a run: the corrected file when it exists, otherwise the original. */
export function primaryVideoAsset(run: Pick<StudioRun, "assets">): StudioAsset | undefined {
  const assets = run.assets ?? [];
  return assets.find(a => a.role === "final") ?? assets.find(a => a.role === "raw");
}

/** Completed video runs other than `runId`, from the administrator's own history (already owner-scoped by the API). */
export function videoCompareCandidates(history: StudioRun[] | null | undefined, runId: string): StudioRun[] {
  return (history ?? []).filter(r => r.id !== runId && r.status === "done"
    && modelForTemplateVersion(r.template_version).kind === "video" && !!primaryVideoAsset(r));
}

export interface RunFacts {
  model: string;
  version: string | null;
  prompt: string;
  aspect: string | null;
  seconds: number | null;
  quality: string | null;
  generationSeconds: number | null;
  seed: string | null;
  audioShiftS: number | null;
}

const num = (v: unknown): number | null => { const n = Number(v); return v !== undefined && v !== null && v !== "" && Number.isFinite(n) ? n : null; };
const txt = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));

/** Main parameters of a run, only what exists. Nothing is invented for older runs. */
export function runFacts(run: StudioRun): RunFacts {
  const p = run.params_effective ?? {};
  return {
    model: modelForTemplateVersion(run.template_version).title,
    version: run.template_version?.includes("@") ? run.template_version.split("@")[1] : null,
    prompt: String(p.prompt ?? ""),
    aspect: txt(p.aspect),
    seconds: num(p.seconds),
    quality: txt(p.quality),
    generationSeconds: run.generation_seconds ? Math.round(run.generation_seconds) : null,
    seed: txt(p.seed),
    audioShiftS: num(p.audio_shift_s),
  };
}

export type FactKey = keyof RunFacts;
export const FACT_ROWS: { key: Exclude<FactKey, "prompt">; label: string }[] = [
  { key: "model", label: "Model" }, { key: "version", label: "Version" }, { key: "aspect", label: "Format" },
  { key: "seconds", label: "Duration" }, { key: "quality", label: "Quality" }, { key: "generationSeconds", label: "Generation time" },
  { key: "seed", label: "Seed" }, { key: "audioShiftS", label: "Audio advance" },
];

export function formatFact(key: FactKey, f: RunFacts): string {
  const v = f[key];
  if (v === null || v === "") return "Not recorded";
  if (key === "seconds") return `${v} s`;
  if (key === "generationSeconds") return `${v} s`;
  if (key === "audioShiftS") return `${v} s`;
  if (key === "quality") return String(v).replace(/^./, c => c.toUpperCase());
  return String(v);
}

/** Plain explanation of how two clips of different lengths behave under "Play both". */
export function durationNote(a: number | null | undefined, b: number | null | undefined): string | null {
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a - b) < 0.25) return null;
  const [short, long] = a < b ? ["A", "B"] : ["B", "A"];
  return `Clip ${short} is shorter (${Math.min(a, b).toFixed(1)} s vs ${Math.max(a, b).toFixed(1)} s). It stops on its last frame while ${long} keeps playing.`;
}

/**
 * Precaution only, never a detection of the actual sound. True when the prompt asks for speech that is not
 * explicitly delayed, because the Corrected file drops the first part of the audio track.
 */
const SPEECH = /\b(says?|said|saying|speaks?|speaking|talks?|talking|whispers?|shouts?|asks?|replies|narrat\w*|dialogue|voice[- ]?over|voice|sings?|singing|greets?|introduces)\b|[“"][^”"]{2,}[”"]|\b(dit|parle|chuchote|raconte|dialogue|voix)\b/i;
const DELAYED = /\b(after (a|an|the|\d)|following|then|later|finally|pauses?|pause|once|eventually|a moment|a beat|a second)\b|\bapr[eè]s\b|\bensuite\b|\bpuis\b/i;

export function speechAtStartCaution(prompt: string | null | undefined): boolean {
  const p = String(prompt ?? "");
  return SPEECH.test(p) && !DELAYED.test(p);
}

export function audioShiftCautionText(shiftSeconds: number | null | undefined): string {
  const s = shiftSeconds ?? 0.4;
  return `Precaution: this prompt seems to ask for speech or a voice, and nothing says it starts later. The Corrected version drops the first ${s} s of the audio track, so a word or sound right at the start could be cut. This is based on the prompt text only, not on the actual sound. Compare with Original to check.`;
}

export const AUDIO_EXPLANATION = [
  { term: "Original", text: "The audio exactly as the model produced it. Nothing is changed or removed." },
  { term: "Corrected", text: "The same video with the audio moved earlier by the configured advance (0.4 s by default) to fix the delay seen on a reference run." },
  { term: "Trade-off", text: "The correction removes the first part of the audio, so it can cut the start of a dialogue or a sound effect. One reference run does not prove the same value fits every scene." },
] as const;

/** Which single track is audible while comparing. Only one at a time so the difference stays easy to hear. */
export type AudibleTrack = "a" | "b" | "off";
export const mutedFor = (audible: AudibleTrack, side: "a" | "b"): boolean => audible !== side;

/** Tolerance (seconds) before a mirrored player is moved to match the one the user is driving. */
export const SYNC_TOLERANCE_S = 0.15;

/** Track the destination of a programmatic seek so the reflected seeked event cannot move the source backwards. */
export function createSeekMirror() {
  type Player = { currentTime: number; duration: number };
  const propagated = new WeakMap<Player, number>();
  return (src: Player, dst: Player) => {
    const pending = propagated.get(src);
    if (pending !== undefined) {
      propagated.delete(src);
      if (Math.abs(src.currentTime - pending) <= SYNC_TOLERANCE_S) return;
    }
    const t = Math.min(src.currentTime, Number.isFinite(dst.duration) ? dst.duration : src.currentTime);
    if (Math.abs(dst.currentTime - t) > SYNC_TOLERANCE_S) {
      propagated.set(dst, t);
      dst.currentTime = t;
    }
  };
}

/** Keep exactly one native soundtrack active, including clicks on the video's own mute button. */
export function nextAudibleOnVolumeChange(current: AudibleTrack, side: "a" | "b", muted: boolean): AudibleTrack {
  return muted ? (current === side ? "off" : current) : side;
}

/** A completed shorter clip must remain at its last frame on Pause/Resume. */
export function shouldResumePlayer(video: Pick<HTMLVideoElement, "ended" | "paused">): boolean {
  return video.paused && !video.ended;
}
