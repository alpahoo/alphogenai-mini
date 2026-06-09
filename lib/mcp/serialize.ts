/**
 * AlphoGen MCP — provider-neutral job serialization (T-901c).
 *
 * Single place that decides what a job looks like to an MCP caller. It strips
 * every raw engine key / provider name / internal field so the confidentiality
 * boundary can't drift per-tool.
 */
import { cleanModelName } from "@/lib/engine-intentions";
import { getEngineDisplayName } from "@/lib/types";
import type { PublicJob } from "@/lib/mcp/types";

/** Minimal shape we read from the `jobs` row (superset-tolerant). */
export interface JobRow {
  id: string;
  status?: string | null;
  current_stage?: string | null;
  prompt?: string | null;
  engine_used?: string | null;
  aspect_ratio?: string | null;
  target_duration_seconds?: number | null;
  storyboard?: unknown[] | null;
  output_url_final?: string | null;
  video_url?: string | null;
  social_exports?: Record<string, string> | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Scrub provider/aggregator names from a free-text string (e.g. error messages).
 * Reuses the same word list as `cleanModelName` so there is one source of truth.
 */
export function scrubProviders(text: string): string {
  return cleanModelName(text);
}

/** Columns a tool should select for a provider-neutral projection. */
export const PUBLIC_JOB_COLUMNS =
  "id, status, current_stage, prompt, engine_used, aspect_ratio, target_duration_seconds, storyboard, output_url_final, video_url, social_exports, error_message, created_at, updated_at";

/** Map a raw job row to the provider-neutral {@link PublicJob}. */
export function toPublicJob(row: JobRow): PublicJob {
  const model = cleanModelName(getEngineDisplayName(row.engine_used ?? undefined));
  return {
    id: row.id,
    status: row.status ?? "unknown",
    stage: row.current_stage ?? null,
    prompt: row.prompt ?? "",
    model: model || "Video model",
    aspect_ratio: row.aspect_ratio ?? null,
    duration_seconds:
      typeof row.target_duration_seconds === "number"
        ? row.target_duration_seconds
        : 0,
    scene_count: Array.isArray(row.storyboard) ? row.storyboard.length : 0,
    output_url: row.output_url_final ?? row.video_url ?? null,
    social_exports: row.social_exports ?? null,
    error: row.error_message ? scrubProviders(row.error_message) || null : null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}
