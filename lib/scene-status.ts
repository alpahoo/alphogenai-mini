/**
 * Scene runtime helpers (T-301) — pure, client-safe (no server-only imports).
 *
 * - `sceneStatusMeta`: status → { label, tone } (provider-neutral labels).
 * - `supportsSingleSceneRegen`: whether `POST /api/jobs/[id]/scenes/[i]` can
 *   regenerate a single scene for this engine. That route only handles EvoLink /
 *   Bailian engines, so this is a conservative default-deny allow-list (mirrors
 *   EVOLINK_ENGINES + BAILIAN_ENGINES keys) — kept here to avoid importing the
 *   server-only clients into client components.
 */

export type SceneTone = "done" | "failed" | "active" | "skipped" | "pending";

export interface SceneStatusMeta {
  label: string;
  tone: SceneTone;
}

export function sceneStatusMeta(status: string): SceneStatusMeta {
  switch (status) {
    case "done":
      return { label: "Complete", tone: "done" };
    case "failed":
      return { label: "Failed", tone: "failed" };
    case "generating":
      return { label: "Generating...", tone: "active" };
    case "encoding":
      return { label: "Encoding...", tone: "active" };
    case "uploading":
      return { label: "Uploading...", tone: "active" };
    case "skipped":
      return { label: "Skipped", tone: "skipped" };
    default:
      return { label: "Queued", tone: "pending" };
  }
}

/**
 * Engines for which a single scene can be regenerated via
 * `POST /api/jobs/[id]/scenes/[sceneIndex]` (EvoLink + Bailian routes only).
 * Conservative default-deny: a new/unknown engine returns false until added.
 */
const SINGLE_SCENE_REGEN_ENGINES: ReadonlySet<string> = new Set([
  // EvoLink-routed
  "evolink",
  "evolink_fast",
  "hailuo",
  "hailuo_fast",
  "happy_horse_10",
  "kling_o3",
  "kling_v3",
  "sora_2",
  "wan_26",
  "wan_27",
  // Bailian-routed
  "wan_26_bailian",
  "wan_27_bailian",
]);

export function supportsSingleSceneRegen(engineKey: string | null | undefined): boolean {
  return !!engineKey && SINGLE_SCENE_REGEN_ENGINES.has(engineKey);
}
