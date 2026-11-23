/**
 * Remix adaptation contract.
 *
 * The source interaction is adapted from nickvasilescu/parallax at
 * a98671e3c47fdb12c42789aee821268aa8f23f6c (MIT). Parallax's wan-3 model
 * registry is intentionally not copied: AlphoGen routes through its existing
 * authenticated `/api/jobs` engine policy and quota checks.
 */

export const PARALLAX_REMIX_SOURCE =
  "nickvasilescu/parallax@a98671e3c47fdb12c42789aee821268aa8f23f6c" as const;

export const REMIX_PROMPT_FALLBACK =
  "Bring the picture to life with gentle, natural motion." as const;

export const REMIX_MODES = [
  { id: "standard", label: "Standard", hint: "Natural motion and a short, focused brief." },
  { id: "pro", label: "Pro", hint: "More detailed motion direction; server plan gates still apply." },
] as const;

export type RemixMode = (typeof REMIX_MODES)[number]["id"];

export function normalizeRemixPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized.slice(0, 2000) : REMIX_PROMPT_FALLBACK;
}

