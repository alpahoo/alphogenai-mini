/**
 * Testable core of the Jogg poller (used by /api/cron/jogg-poll).
 *
 * Kept dependency-injected (no Next/Supabase imports) so the persistence
 * contract can be unit-tested without network or DB:
 *   - `done`/`failed` are only reported AFTER a successful DB write;
 *   - a failed DB write reports `error` (never a false `done`), leaves the job
 *     recoverable (untouched → picked up by the next cron run);
 *   - throwing dependencies (Jogg poll / download) surface as `error`.
 */
import type { JoggVideoResult } from "@/lib/jogg-client";

export interface JoggJobRow {
  id: string;
  external_task_id: string | null;
  app_state: Record<string, unknown> | null;
}

/** Result of a DB write — mirrors supabase-js `{ error }`. */
export interface WriteResult {
  error: unknown | null;
}

export interface SettleDeps {
  getProductVideo: (videoId: string) => Promise<JoggVideoResult>;
  download: (sourceUrl: string, destKey: string) => Promise<string>;
  updateJob: (jobId: string, patch: Record<string, unknown>) => Promise<WriteResult>;
  now?: () => string;
}

export type SettleOutcome = "done" | "failed" | "pending" | "error";

export interface PublicPollSummary {
  done: number;
  failed: number;
  pending: number;
  errors: number;
}

/** Keep the public cron response compatible with its historical `errors` key. */
export function toPublicPollSummary(
  tally: Record<SettleOutcome, number>,
): PublicPollSummary {
  return {
    done: tally.done,
    failed: tally.failed,
    pending: tally.pending,
    errors: tally.error,
  };
}

function nowIso(deps: SettleDeps): string {
  return deps.now ? deps.now() : new Date().toISOString();
}

export function donePatch(
  r2Url: string,
  prevState: Record<string, unknown> | null,
  sourceVideoUrl: string,
  ts: string,
): Record<string, unknown> {
  return {
    status: "done",
    current_stage: "done",
    final_url: r2Url,
    video_url: r2Url,
    error_message: null,
    updated_at: ts,
    app_state: { ...(prevState || {}), source_video_url: sourceVideoUrl },
  };
}

export function failedPatch(message: string, ts: string): Record<string, unknown> {
  return {
    status: "failed",
    current_stage: "failed",
    error_message: String(message).slice(0, 500),
    updated_at: ts,
  };
}

/**
 * Advance a single Jogg job. Returns the OUTCOME only after any DB write has
 * been confirmed. Never mutates on a failed write.
 */
export async function settleJoggJob(job: JoggJobRow, deps: SettleDeps): Promise<SettleOutcome> {
  const ts = nowIso(deps);
  const videoId = job.external_task_id;

  if (!videoId) {
    const { error } = await deps.updateJob(
      job.id,
      failedPatch("missing external_task_id (product_video_id)", ts),
    );
    return error ? "error" : "failed";
  }

  const result = await deps.getProductVideo(videoId); // may throw → caller catches → "error"

  if (result.status === "completed" && result.videoUrl) {
    const r2Url = await deps.download(result.videoUrl, `url-to-video/${job.id}.mp4`);
    const { error } = await deps.updateJob(
      job.id,
      donePatch(r2Url, job.app_state, result.videoUrl, ts),
    );
    return error ? "error" : "done";
  }

  if (result.status === "failed") {
    const { error } = await deps.updateJob(
      job.id,
      failedPatch(result.error || "Jogg generation failed", ts),
    );
    return error ? "error" : "failed";
  }

  return "pending";
}
