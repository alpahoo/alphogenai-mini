/**
 * Choosing clips for a montage in the Studio history. Pure, client-safe.
 */
import { modelForTemplateVersion } from "@/lib/studio/catalog";
import { isActive } from "@/lib/studio/status";
import type { StudioRun } from "@/components/studio/types";
import { MAX_MONTAGE_CLIPS, MIN_MONTAGE_CLIPS } from "./files";

export type MontageAudio = "corrected" | "original";

/** A generation that can be joined: finished, a video, with a video file for the chosen sound. */
export function isMontageClip(run: Pick<StudioRun, "status" | "template_version" | "assets">, audio: MontageAudio = "corrected"): boolean {
  if (run.status !== "done" || isActive(run.status)) return false;
  if (modelForTemplateVersion(run.template_version).kind !== "video") return false;
  const role = audio === "original" ? "raw" : "final";
  return (run.assets ?? []).some(a => a.role === role && (a.mime === undefined || a.mime === "video/mp4"));
}

/** Add a clip at the end, or remove it when it is already chosen. The order of the choices is the order of the montage. */
export function togglePick(picked: readonly string[], id: string, max: number = MAX_MONTAGE_CLIPS): string[] {
  if (picked.includes(id)) return picked.filter(x => x !== id);
  return picked.length >= max ? [...picked] : [...picked, id];
}

export const canMakeMontage = (picked: readonly string[]) => picked.length >= MIN_MONTAGE_CLIPS && picked.length <= MAX_MONTAGE_CLIPS;

export function montageRequestBody(picked: readonly string[], audio: MontageAudio, name: string) {
  const trimmed = name.trim();
  return { run_ids: [...picked], audio, ...(trimmed ? { name: trimmed } : {}) };
}

export const formatBytes = (n: number | null | undefined) => (n == null ? "" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
