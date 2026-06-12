/**
 * Research Cinematic Planner (T-1109b) — pure, deterministic, no network.
 *
 * Layer 2 of the cinematic pipeline: the LLM (layer 1) emits best-effort
 * cinematic hints per scene; this helper validates them, fills gaps with
 * mode-specific deterministic defaults, applies a conservative asset policy,
 * and — critically — composes the cinematic detail INTO `prompt` (the only
 * per-scene field that reaches the video backend), bounded to 2000 chars.
 *
 * Canonical Director-facing fields (title/prompt/duration_sec) are preserved,
 * so the existing handoff and Director panel keep working unchanged.
 */

export type ResearchMode = 'news' | 'tutorial' | 'product' | 'competitor';

export interface CinematicScenePlan {
  // Canonical Director-facing (existing contract)
  title: string;
  prompt: string;
  duration_sec: number;
  // Additive cinematic metadata
  visual_intent: string;
  camera_shot: string;
  camera_motion: string;
  lighting: string;
  mood: string;
  onscreen_text: string | null;
  voiceover_line: string;
  reference_asset_hint: string | null;
  source_citation: string | null;
  risk_note: string | null;
}

export interface PlannerSource {
  title?: unknown;
  url?: unknown;
  source_type?: unknown;
  extracted_markdown?: unknown;
}

export interface PlannerAngle {
  title: string;
  hook: string;
  positioning: string | null;
}

export interface PlannerInput {
  topic: string;
  mode: string;
  language?: string;
  targetDurationSeconds?: number | null;
  angle: PlannerAngle;
  script?: string;
  scenes: unknown[];
  sources?: PlannerSource[];
}

// Controlled vocabularies — LLM values outside these fall back to mode defaults.
const SHOTS = ['wide', 'medium', 'close_up', 'over_shoulder', 'screen_capture', 'split_screen', 'insert', 'establishing'];
const MOTIONS = ['static', 'slow_push_in', 'pull_back', 'pan', 'tilt', 'handheld', 'dolly'];
const LIGHTINGS = ['soft_daylight', 'studio_key', 'low_key', 'clean_ui', 'high_key', 'golden_hour'];
const MOODS = ['neutral_analytical', 'authoritative', 'curious', 'energetic', 'trustworthy', 'tense'];

const PROMPT_MAX = 2000;
const SCENES_JSON_MAX = 102400; // research_storyboards.scenes_json CHAR_LENGTH cap
const VISUAL_MAX = 500;
const ONSCREEN_MAX = 120;
const VOICEOVER_MAX = 240;
const HINT_MAX = 200;

type ModeProfile = {
  shots: string[];
  firstShot: string;
  motion: string;
  lighting: string;
  mood: string;
  onscreen: 'citation' | 'step' | 'benefit' | 'benchmark';
};

const MODE_PROFILE: Record<ResearchMode, ModeProfile> = {
  news: {
    shots: ['medium', 'insert', 'medium'],
    firstShot: 'establishing',
    motion: 'slow_push_in',
    lighting: 'soft_daylight',
    mood: 'neutral_analytical',
    onscreen: 'citation',
  },
  tutorial: {
    shots: ['screen_capture', 'close_up', 'screen_capture'],
    firstShot: 'screen_capture',
    motion: 'static',
    lighting: 'clean_ui',
    mood: 'trustworthy',
    onscreen: 'step',
  },
  product: {
    shots: ['close_up', 'medium', 'insert'],
    firstShot: 'establishing',
    motion: 'slow_push_in',
    lighting: 'studio_key',
    mood: 'energetic',
    onscreen: 'benefit',
  },
  competitor: {
    shots: ['split_screen', 'medium', 'insert'],
    firstShot: 'split_screen',
    motion: 'static',
    lighting: 'high_key',
    mood: 'neutral_analytical',
    onscreen: 'benchmark',
  },
};

const ASSET_SOURCE_TYPES = ['youtube', 'product', 'official', 'media'];

function normalizeMode(mode: string): ResearchMode {
  return (['news', 'tutorial', 'product', 'competitor'] as const).includes(mode as ResearchMode)
    ? (mode as ResearchMode)
    : 'news';
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

function pickEnum(value: unknown, allowed: string[], fallback: string): string {
  const v = str(value).toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.includes(v) ? v : fallback;
}

function clampDuration(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(3, Math.min(10, Math.round(n)));
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function shotForPosition(profile: ModeProfile, index: number, total: number): string {
  if (index === 0) return profile.firstShot;
  if (index === total - 1 && total > 1) return 'medium';
  return profile.shots[index % profile.shots.length];
}

function humanShot(s: string): string {
  const map: Record<string, string> = {
    wide: 'wide shot',
    medium: 'medium shot',
    close_up: 'close-up shot',
    over_shoulder: 'over-the-shoulder shot',
    screen_capture: 'clean screen capture',
    split_screen: 'split-screen A/B composition',
    insert: 'insert detail shot',
    establishing: 'establishing shot',
  };
  return map[s] ?? 'medium shot';
}

function humanMotion(m: string): string {
  const map: Record<string, string> = {
    static: 'locked-off camera',
    slow_push_in: 'slow push-in',
    pull_back: 'slow pull-back',
    pan: 'measured pan',
    tilt: 'gentle tilt',
    handheld: 'subtle handheld',
    dolly: 'smooth dolly',
  };
  return map[m] ?? 'locked-off camera';
}

function humanLighting(l: string): string {
  const map: Record<string, string> = {
    soft_daylight: 'soft daylight',
    studio_key: 'studio key light',
    low_key: 'moody low-key',
    clean_ui: 'clean UI glow',
    high_key: 'bright high-key',
    golden_hour: 'warm golden-hour',
  };
  return map[l] ?? 'soft daylight';
}

function humanMood(m: string): string {
  return m.replace(/_/g, ' ');
}

/**
 * Build the asset policy result for a scene from the available sources.
 * Never invents asset ids; only references real source media descriptively.
 */
function assetForScene(
  usable: Array<{ title: string; url: string; type: string }>,
  index: number,
): { hint: string | null; citation: string | null } {
  if (usable.length === 0) return { hint: null, citation: null };
  const s = usable[index % usable.length];
  const domain = domainOf(s.url);
  const citation = s.title || domain;
  const hint = cap(
    `reference the ${s.type} source "${s.title || domain || 'source'}"${domain ? ` (${domain})` : ''}`,
    HINT_MAX,
  );
  return { hint, citation: citation ? cap(citation, HINT_MAX) : null };
}

function riskNoteFor(hint: string | null, text: string): string | null {
  if (hint) {
    return 'Verify usage rights for the referenced media before publishing; do not imply official endorsement.';
  }
  if (/try-?on|exact face|face swap|exact likeness/i.test(text)) {
    return 'Avoid claiming an exact face/try-on; no verified asset was provided.';
  }
  return null;
}

function onscreenFor(
  profile: ModeProfile,
  llmValue: unknown,
  index: number,
  citation: string | null,
): string | null {
  const llm = str(llmValue);
  if (llm) return cap(llm, ONSCREEN_MAX);
  switch (profile.onscreen) {
    case 'citation':
      return citation ? cap(`Source: ${citation}`, ONSCREEN_MAX) : null;
    case 'step':
      return `Step ${index + 1}`;
    case 'benchmark':
      return index === 0 ? 'A vs B' : null;
    case 'benefit':
    default:
      return null;
  }
}

function firstSentence(text: string): string {
  const m = text.trim().match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

/**
 * Enrich LLM/normalized scenes into Director-grade cinematic scene plans.
 * Pure & deterministic: identical inputs (LLM hints present OR absent) yield
 * identical output.
 */
export function planCinematicScenes(input: PlannerInput): CinematicScenePlan[] {
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];
  if (scenes.length === 0) return [];

  const mode = normalizeMode(input.mode);
  const profile = MODE_PROFILE[mode];

  const usable = (input.sources ?? [])
    .map((s) => ({ title: str(s.title), url: str(s.url), type: str(s.source_type) }))
    .filter((s) => ASSET_SOURCE_TYPES.includes(s.type) && /^https?:\/\//.test(s.url));

  const total = scenes.length;
  const plans: CinematicScenePlan[] = [];

  for (let i = 0; i < total; i++) {
    const raw = (scenes[i] && typeof scenes[i] === 'object' ? scenes[i] : {}) as Record<string, unknown>;

    const title = str(raw.title) || `Scene ${i + 1}`;
    const baseVisual = str(raw.visual_intent) || str(raw.prompt) || title;
    const visual_intent = cap(baseVisual, VISUAL_MAX);

    const camera_shot = pickEnum(raw.camera_shot, SHOTS, shotForPosition(profile, i, total));
    const camera_motion = pickEnum(raw.camera_motion, MOTIONS, profile.motion);
    const lighting = pickEnum(raw.lighting, LIGHTINGS, profile.lighting);
    const mood = pickEnum(raw.mood, MOODS, i === 0 ? 'curious' : profile.mood);

    const asset = assetForScene(usable, i);
    const onscreen_text = onscreenFor(profile, raw.onscreen_text, i, asset.citation);
    const risk_note = riskNoteFor(asset.hint, `${visual_intent} ${title}`);

    // Voice-over: prefer LLM line; else deterministic fallback from angle/script.
    const llmVoice = str(raw.voiceover_line);
    let voiceover_line: string;
    if (llmVoice) {
      voiceover_line = cap(llmVoice, VOICEOVER_MAX);
    } else if (i === 0 && input.angle.hook) {
      voiceover_line = cap(input.angle.hook, VOICEOVER_MAX);
    } else {
      const fromScript = str(input.script) ? firstSentence(str(input.script)) : '';
      voiceover_line = cap(fromScript || visual_intent || title, VOICEOVER_MAX);
    }

    // Compose the cinematic prompt — the only field that reaches the video backend.
    const descriptors = `${humanShot(camera_shot)}, ${humanMotion(camera_motion)}, ${humanLighting(lighting)} lighting, ${humanMood(mood)} mood`;
    let prompt = `${visual_intent} — ${descriptors}.`;
    if (asset.hint) {
      prompt += ` Reference: ${asset.hint}.`;
    }
    prompt = cap(prompt, PROMPT_MAX);

    plans.push({
      title: cap(title, 120),
      prompt,
      duration_sec: clampDuration(raw.duration_sec ?? raw.durationSec),
      visual_intent,
      camera_shot,
      camera_motion,
      lighting,
      mood,
      onscreen_text,
      voiceover_line,
      reference_asset_hint: asset.hint,
      source_citation: asset.citation,
      risk_note,
    });
  }

  // Enforce DB size cap: drop trailing scenes, then truncate prompts if needed.
  while (plans.length > 1 && JSON.stringify(plans).length > SCENES_JSON_MAX) {
    plans.pop();
  }
  if (plans.length === 1 && JSON.stringify(plans).length > SCENES_JSON_MAX) {
    plans[0].prompt = cap(plans[0].prompt, 1000);
    plans[0].visual_intent = cap(plans[0].visual_intent, 250);
  }

  return plans;
}
