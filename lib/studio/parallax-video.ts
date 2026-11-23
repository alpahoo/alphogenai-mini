/**
 * Parallax Video adapter for the AlphoGen Studio.
 *
 * The frozen Parallax screens/components are reused as interaction guidance,
 * while identity, admission, jobs and private media remain AlphoGen-owned.
 * Keep the MIT notice in lib/cinema/LICENSE-parallax.txt with this adapter.
 */

export const PARALLAX_VIDEO_MODULE = {
  id: "parallax-video",
  source: "nickvasilescu/parallax",
  sourceCommit: "a98671e3c47fdb12c42789aee821268aa8f23f6c",
  license: "MIT",
  model: "minimax-h3",
  routes: {
    history: "/api/admin/comfy/history",
    run: "/api/admin/comfy/runs/:id",
    media: "/api/admin/comfy/media/:id",
  },
  output: "private-video",
} as const;

/** The Studio surfaces that make the complete no-provider recipe possible. */
export const PARALLAX_VIDEO_SURFACES = [
  "reference-library",
  "generation-preview",
  "run-history",
  "private-result",
] as const;

export function isParallaxVideoModel(modelSlug: string | null | undefined): boolean {
  return modelSlug === PARALLAX_VIDEO_MODULE.model;
}
