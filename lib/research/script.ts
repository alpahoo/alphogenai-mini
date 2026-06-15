/**
 * Research script + storyboard helpers (pure, no network)
 * Parsing, validation, size-capping, scene normalization.
 */

export interface ScriptSection {
  label?: string;
  content?: string;
  duration_sec?: number;
}

export interface StoryboardScene {
  title: string;
  prompt: string;
  duration_sec: number;
}

export interface Subscores {
  hook_strength: number | null;
  source_coverage: number | null;
  clarity: number | null;
  originality: number | null;
  risk_disclosure: number | null;
  rhythm_fit: number | null;
  duration_fit: number | null;
}

export interface ParsedScript {
  script: string;
  sections: unknown[];
  subscores: Record<string, unknown>;
  scenes: unknown[];
}

// DB constraints (T-1101)
export const SCRIPT_MIN_CHARS = 50;
export const SCRIPT_MAX_CHARS = 10240; // ~10 KB
export const SECTIONS_MAX_CHARS = 5120; // ~5 KB
export const SCENES_MAX_CHARS = 102400; // 100 KB
export const SCENE_MIN_DURATION = 3;
export const SCENE_MAX_DURATION = 10;

const SUBSCORE_KEYS: (keyof Subscores)[] = [
  'hook_strength',
  'source_coverage',
  'clarity',
  'originality',
  'risk_disclosure',
  'rhythm_fit',
  'duration_fit',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Clamp a numeric score to [0, 1], rounded to 2 decimals. Null if not finite.
 */
export function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return round2(Math.max(0, Math.min(1, value)));
}

/**
 * Clamp a scene duration to integer [3, 10]. Defaults to 5 if invalid.
 */
export function clampSceneDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 5;
  }
  return Math.max(SCENE_MIN_DURATION, Math.min(SCENE_MAX_DURATION, Math.round(value)));
}

/**
 * Strip optional markdown code fences around a JSON payload.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * Parse the LLM response into a loose ParsedScript shape.
 * Returns null on invalid JSON or wrong top-level shape.
 */
export function parseScriptResponse(raw: string): ParsedScript | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.script !== 'string') {
    return null;
  }

  return {
    script: obj.script,
    sections: Array.isArray(obj.sections) ? obj.sections : [],
    subscores:
      obj.subscores && typeof obj.subscores === 'object' && !Array.isArray(obj.subscores)
        ? (obj.subscores as Record<string, unknown>)
        : {},
    scenes: Array.isArray(obj.scenes) ? obj.scenes : [],
  };
}

/**
 * Trim + enforce script size. Truncates above SCRIPT_MAX_CHARS at a clean
 * boundary; returns null if below SCRIPT_MIN_CHARS after processing.
 */
export function validateAndTruncateScript(script: string): string | null {
  const trimmed = script.trim();

  if (trimmed.length < SCRIPT_MIN_CHARS) {
    return null;
  }

  if (trimmed.length <= SCRIPT_MAX_CHARS) {
    return trimmed;
  }

  const hardCut = trimmed.slice(0, SCRIPT_MAX_CHARS);
  const lastBreak = Math.max(hardCut.lastIndexOf('\n'), hardCut.lastIndexOf(' '));
  const cut = lastBreak >= SCRIPT_MIN_CHARS ? hardCut.slice(0, lastBreak) : hardCut;

  return cut.trim();
}

/**
 * Keep section objects and drop trailing ones until the serialized array fits
 * SECTIONS_MAX_CHARS. Returns null when nothing valid remains.
 */
export function normalizeSections(sections: unknown[]): ScriptSection[] | null {
  const cleaned = sections.filter(
    (s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s),
  );

  const result: ScriptSection[] = cleaned.map((s) => {
    const section: ScriptSection = {};
    if (typeof s.label === 'string') section.label = s.label;
    if (typeof s.content === 'string') section.content = s.content;
    if (typeof s.duration_sec === 'number') section.duration_sec = clampSceneDuration(s.duration_sec);
    return section;
  });

  while (result.length > 0 && JSON.stringify(result).length > SECTIONS_MAX_CHARS) {
    result.pop();
  }

  return result.length > 0 ? result : null;
}

/**
 * Normalize storyboard scenes to the Director-compatible shape.
 * - title from title|role, required non-empty
 * - prompt required non-empty
 * - duration_sec from duration_sec|durationSec, clamped [3,10]
 * Drops invalid scenes, then trailing scenes until under SCENES_MAX_CHARS.
 */
export function normalizeScenes(scenes: unknown[]): StoryboardScene[] {
  const result: StoryboardScene[] = [];

  for (const raw of scenes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const s = raw as Record<string, unknown>;

    const titleSource = typeof s.title === 'string' ? s.title : typeof s.role === 'string' ? s.role : '';
    const title = titleSource.trim();
    const prompt = typeof s.prompt === 'string' ? s.prompt.trim() : '';

    if (!title || !prompt) {
      continue;
    }

    const durationRaw = s.duration_sec ?? s.durationSec;
    result.push({
      title,
      prompt,
      duration_sec: clampSceneDuration(durationRaw),
    });
  }

  while (result.length > 1 && JSON.stringify(result).length > SCENES_MAX_CHARS) {
    result.pop();
  }

  return result;
}

/**
 * Normalize subscores object to the 7 known keys, clamped to [0,1] or null.
 */
export function normalizeSubscores(subscores: Record<string, unknown>): Subscores {
  const out = {} as Subscores;
  for (const key of SUBSCORE_KEYS) {
    out[key] = clampScore(subscores[key]);
  }
  return out;
}

/**
 * Compute overall quality_score as the mean of present subscores (clamped).
 * Returns null if no subscore is present.
 */
export function computeQualityScore(subscores: Record<string, unknown>): number | null {
  const values: number[] = [];
  for (const key of SUBSCORE_KEYS) {
    const clamped = clampScore(subscores[key]);
    if (clamped !== null) {
      values.push(clamped);
    }
  }
  if (values.length === 0) {
    return null;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return round2(mean);
}

/**
 * Build the pacing-guidance line for buildScriptPrompt: ties the suggested
 * scene count and total duration to the job's target_duration_seconds
 * (optional, 3-600s). Falls back to the previous flexible framing when unset.
 */
export function buildPacingGuidance(targetDurationSeconds?: number | null): string {
  if (!targetDurationSeconds || targetDurationSeconds <= 0) {
    return 'Pacing: no fixed duration was requested — aim for natural short-form pacing, typically 4-6 scenes.';
  }
  const minScenes = Math.max(1, Math.min(10, Math.ceil(targetDurationSeconds / 10)));
  const maxScenes = Math.max(minScenes, Math.min(10, Math.round(targetDurationSeconds / 4)));
  const sceneCountText = minScenes === maxScenes ? `${minScenes}` : `${minScenes}-${maxScenes}`;
  return `Pacing: the finished video should be about ${targetDurationSeconds} seconds long. Plan ${sceneCountText} scenes so the SUM of all "duration_sec" values is close to ${targetDurationSeconds} (within a couple of seconds).`;
}

/**
 * Build the LLM prompt from job + angle + extracted source excerpts.
 */
export function buildScriptPrompt(
  topic: string,
  mode: string,
  angle: { title: string; hook: string; positioning?: string | null },
  sourceSummaries: string[],
  targetDurationSeconds?: number | null,
): string {
  const sourceExcerpts = sourceSummaries
    .slice(0, 5)
    .map((s) => s.slice(0, 500))
    .join('\n---\n');

  const pacing = buildPacingGuidance(targetDurationSeconds);

  return `Topic: ${topic}
Content Mode: ${mode}

Selected Angle:
- Title: ${angle.title}
- Hook: ${angle.hook}
- Positioning: ${angle.positioning ?? 'n/a'}

Extracted Sources Summary:
${sourceExcerpts || '(no extracted sources available)'}

Produce a complete short-form video script for this angle, plus a cinematic storyboard.

${pacing}

Return ONLY a JSON object (no markdown, no code fences) with this shape:
{
  "script": "Full narration/script text (50-10000 chars).",
  "sections": [
    { "label": "Hook", "content": "...", "duration_sec": 4 }
  ],
  "subscores": {
    "hook_strength": 0.8, "source_coverage": 0.7, "clarity": 0.9,
    "originality": 0.6, "risk_disclosure": 0.5, "rhythm_fit": 0.7, "duration_fit": 0.8
  },
  "scenes": [
    {
      "title": "Hook shot",
      "prompt": "Concrete visual description of the shot.",
      "duration_sec": 5,
      "visual_intent": "What the viewer should concretely see.",
      "camera_shot": "establishing|wide|medium|close_up|over_shoulder|screen_capture|split_screen|insert",
      "camera_motion": "static|slow_push_in|pull_back|pan|tilt|handheld|dolly",
      "lighting": "soft_daylight|studio_key|low_key|clean_ui|high_key|golden_hour",
      "mood": "neutral_analytical|authoritative|curious|energetic|trustworthy|tense",
      "onscreen_text": "Optional caption, or null",
      "voiceover_line": "One spoken sentence for this scene.",
      "reference_asset_hint": "Optional: real provided/extracted source media to reference, or null",
      "source_citation": "Optional: source title/domain backing this scene, or null",
      "risk_note": "Optional: rights/clarity caveat, or null"
    }
  ]
}

Rules:
- Each scene needs a non-empty title and prompt, duration_sec between 3 and 10.
- For camera_shot/camera_motion/lighting/mood, pick exactly ONE value from the listed options.
- Each scene's "visual_intent" must depict a DIFFERENT concrete subject, action, or location than every other scene — do not reuse the same setting or subject across scenes unless showing a clear progression (e.g. before vs. after). Ground it in specifics from the sources above, not generic filler like "a person looking at a screen".
- Do not repeat the same "camera_shot" value in two consecutive scenes.
- Tailor cinematic choices to the Content Mode (news=reportage/citations; tutorial=screen capture/steps/zoom; product=product shots/benefit/demo; competitor=split-screen/neutral benchmark).
- Do not invent asset references, asset IDs, or face IDs, and never make "exact try-on"/"exact face" claims; reference_asset_hint may only describe real provided/extracted source media, else null.`;
}
