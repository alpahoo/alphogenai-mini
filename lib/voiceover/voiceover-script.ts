/**
 * Research Voice-over Contract (T-1112) — pure, deterministic, no network.
 *
 * Turns a Research storyboard + script into the single narration string that
 * becomes a video job's `voiceover_text` (which the existing one-shot TTS in
 * GET /api/jobs/[id] then renders to `voiceover_url`).
 *
 * Canonical source = per-scene `voiceover_line` concatenated in scene order
 * (this is the same text the overlay captions use, so audio and on-screen text
 * stay aligned). Falls back to the full `script` prose when no usable per-scene
 * lines exist. Provider-agnostic: this module never names a TTS provider.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard cap on the produced narration. Matches the `voiceover_text` slice in
 * POST /api/jobs (jobs.voiceover_text is stored sliced to this length), so the
 * helper output never silently exceeds what the job will persist.
 */
export const VOICEOVER_MAX_CHARS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal scene shape — only the spoken line matters here. */
export interface VoiceoverScene {
  voiceover_line?: string | null;
}

export interface BuildVoiceoverInput {
  /** Storyboard scenes in display order (from research_storyboards.scenes_json). */
  scenes: VoiceoverScene[];
  /** Full narration prose (from research_scripts.script). Used as fallback. */
  script?: string | null;
}

export interface VoiceoverScript {
  /** The narration text to store as voiceover_text. "" when nothing usable. */
  text: string;
  /** Which source produced `text`. */
  source: "scenes" | "script" | "none";
  /** Count of non-empty per-scene voiceover lines found. */
  sceneLineCount: number;
  /** True when the text was truncated to VOICEOVER_MAX_CHARS. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collapse all whitespace runs to a single space and trim. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Truncate to `max` chars on a clean word boundary when possible. Returns the
 * (possibly shortened) string plus whether truncation happened.
 */
function capLength(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) {
    return { text: value, truncated: false };
  }
  const hardCut = value.slice(0, max);
  const lastSpace = hardCut.lastIndexOf(" ");
  // Only fall back to the word boundary if it keeps most of the budget,
  // otherwise a pathological no-space string would shrink to almost nothing.
  const cut = lastSpace > max * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return { text: cut.trim(), truncated: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Build the canonical narration string for a Research-backed video job.
 *
 * Deterministic and side-effect free. Never throws on malformed input — bad
 * scenes are skipped and the result degrades to script fallback or "".
 */
export function buildVoiceoverScript(input: BuildVoiceoverInput): VoiceoverScript {
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];

  const lines: string[] = [];
  for (const scene of scenes) {
    if (!scene || typeof scene !== "object") continue;
    const raw = scene.voiceover_line;
    if (typeof raw !== "string") continue;
    const line = normalizeWhitespace(raw);
    if (line.length > 0) {
      lines.push(line);
    }
  }

  if (lines.length > 0) {
    const joined = lines.join(" ");
    const { text, truncated } = capLength(joined, VOICEOVER_MAX_CHARS);
    return { text, source: "scenes", sceneLineCount: lines.length, truncated };
  }

  // Fallback: full script prose.
  const scriptText =
    typeof input.script === "string" ? normalizeWhitespace(input.script) : "";
  if (scriptText.length > 0) {
    const { text, truncated } = capLength(scriptText, VOICEOVER_MAX_CHARS);
    return { text, source: "script", sceneLineCount: 0, truncated };
  }

  return { text: "", source: "none", sceneLineCount: 0, truncated: false };
}
