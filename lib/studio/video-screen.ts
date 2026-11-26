import { modelForTemplateVersion } from "./catalog";
import { isActive } from "./status";

/**
 * What the Video screen needs to know about a run to draw its tile. Structural on purpose: the screen passes the
 * Studio's own run objects, so nothing is re-fetched or duplicated.
 */
export interface TileAsset { id: string; role: string; mime?: string }
export interface TileRun {
  id: string;
  status: string;
  template_version?: string | null;
  params_effective?: Record<string, unknown> | null;
  assets?: TileAsset[];
  dispatched?: boolean;
  error_code?: string | null;
}

/** done: a private video can be played; pending: queued or running; failed: ended without a result; unavailable: finished but no file is listed. */
export type TileKind = "done" | "pending" | "failed" | "unavailable";

/** The Video screen lists video generations only: image runs (MOSS) belong to the image Studio. */
export function isVideoRun(run: Pick<TileRun, "template_version">): boolean {
  return modelForTemplateVersion(run.template_version).kind === "video";
}

/** The history without image runs. `null` (not loaded yet) stays `null`, so the screen can show its skeleton. */
export function videoRuns<T extends TileRun>(items: readonly T[] | null): T[] | null {
  return items === null ? null : items.filter(isVideoRun);
}

/** The file a tile plays: the Corrected video, else the Original; never an image or an unknown type. */
export function playableAsset(run: Pick<TileRun, "assets">): TileAsset | undefined {
  const videos = (run.assets ?? []).filter(a => (a.mime ?? "video/mp4").startsWith("video/"));
  return videos.find(a => a.role === "final") ?? videos.find(a => a.role === "raw");
}

export function tileKind(run: TileRun): TileKind {
  if (isActive(run.status) || run.status === "loading") return "pending";
  if (run.status === "done") return playableAsset(run) ? "done" : "unavailable";
  return "failed";
}

/** A CSS `aspect-ratio` from the format the run was asked for (H3: 9:16, 16:9 or 1:1; 9:16 when unknown). */
export function tileRatio(run: Pick<TileRun, "params_effective">): string {
  const m = /^(\d+):(\d+)$/.exec(String(run.params_effective?.aspect ?? ""));
  return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? `${m[1]} / ${m[2]}` : "9 / 16";
}

/** One line for a tile or a dialog title. */
export function tilePrompt(run: Pick<TileRun, "params_effective">): string {
  const p = String(run.params_effective?.prompt ?? "").trim();
  return p || "Untitled";
}

/** Whether the "dispatch is pending" action applies: a queued run whose dispatch was never acknowledged. */
export function needsDispatchRetry(run: Pick<TileRun, "status" | "dispatched">): boolean {
  return run.status === "queued" && run.dispatched === false;
}

/** Advanced params that are output formats, shown on the Video screen next to the simple ones (H3: resolution). */
export const VIDEO_FORMAT_KEYS = ["resolution"] as const;
export function videoFormatParams<P extends { key: string; tier?: string }>(manifest: { params: readonly P[] }): P[] {
  return manifest.params.filter(p => (VIDEO_FORMAT_KEYS as readonly string[]).includes(p.key) && p.tier !== "simple");
}
