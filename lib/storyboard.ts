/**
 * Storyboard generator — splits a prompt into N cinematic scenes.
 *
 * Two steps:
 *  1. generateStoryboard() — deterministic structure (duration, scene count, engine)
 *  2. enrichStoryboardWithLLM() — replaces template prompts with distinct
 *     cinematographer-crafted scene descriptions via EvoLink LLM (DeepSeek)
 *
 * Single-scene jobs skip LLM (enhanced prompt already handles it).
 * Falls back silently to template prompts if LLM unavailable.
 */
import { type JobPlan, type EngineKey, PLAN_MAX_DURATION } from "./types";
import { callEvoLinkLLM } from "./evolink-client";

export interface StoryboardEntry {
  scene_index: number;
  prompt: string;
  engine: EngineKey;
  duration_sec: number;
}

const DEFAULT_CLIP_DURATION = 5.0;
const MIN_CLIP_DURATION = 3.0;
const MAX_CLIP_DURATION = 10.0;
const DEFAULT_ENGINE: EngineKey = "wan_i2v";

/** MVP hard caps — controls GPU cost regardless of plan duration math. */
export const MAX_SCENES: Record<JobPlan, number> = {
  free: 1,
  pro: 3,
  premium: 5,
};

const VALID_PLANS: ReadonlySet<string> = new Set<string>(["free", "pro", "premium"]);

/** Type-guard: returns true if value is a valid JobPlan. */
export function isValidPlan(value: unknown): value is JobPlan {
  return typeof value === "string" && VALID_PLANS.has(value);
}

/**
 * Generate a storyboard (array of scene entries) from a user prompt.
 *
 * - Single scene for free plan (5s max)
 * - Multiple scenes for pro/premium, each `clipDuration` seconds
 * - Hard-capped to MAX_SCENES[plan] regardless of duration math
 */
export function generateStoryboard(
  prompt: string,
  targetDuration: number = 5,
  plan: JobPlan = "free",
  clipDuration: number = DEFAULT_CLIP_DURATION
): StoryboardEntry[] {
  // Clamp target_duration to plan limit
  const maxDur = PLAN_MAX_DURATION[plan] ?? PLAN_MAX_DURATION.free;
  const td = Math.max(Math.min(targetDuration, maxDur), MIN_CLIP_DURATION);

  // Clamp clip duration
  const clipDur = Math.max(MIN_CLIP_DURATION, Math.min(clipDuration, MAX_CLIP_DURATION));

  // Calculate number of scenes, then hard-cap to plan limit
  const maxScenes = MAX_SCENES[plan] ?? 1;
  let numScenes = Math.min(
    Math.max(1, Math.ceil(td / clipDur)),
    maxScenes
  );

  // Free plan: always 1 scene
  let effectiveClipDur = clipDur;
  if (plan === "free") {
    numScenes = 1;
    effectiveClipDur = Math.min(td, DEFAULT_CLIP_DURATION);
  }

  const scenes: StoryboardEntry[] = [];
  let remaining = td;

  for (let i = 0; i < numScenes; i++) {
    const sceneDur = Math.min(effectiveClipDur, remaining);
    if (sceneDur < MIN_CLIP_DURATION && i > 0) {
      // Absorb remainder into previous scene
      if (scenes.length > 0) {
        scenes[scenes.length - 1].duration_sec = Math.round(
          (scenes[scenes.length - 1].duration_sec + sceneDur) * 10
        ) / 10;
      }
      break;
    }

    scenes.push({
      scene_index: i,
      prompt: scenePrompt(prompt, i, numScenes),
      engine: DEFAULT_ENGINE,
      duration_sec: Math.round(sceneDur * 10) / 10,
    });
    remaining -= sceneDur;
  }

  return scenes;
}

function scenePrompt(basePrompt: string, index: number, total: number): string {
  const trimmed = basePrompt.trim();
  if (total === 1) return trimmed;
  return `[Scene ${index + 1}/${total}] ${trimmed}`;
}

// ---------------------------------------------------------------------------
// LLM enrichment — distinct cinematic prompts per scene
// ---------------------------------------------------------------------------

const STORYBOARD_SYSTEM_PROMPT = `You are a cinematographer writing AI video generation prompts for a multi-scene short film.

Given a video concept and the number of scenes, write distinct cinematic prompts — one per scene — that together form a coherent visual story.

Return ONLY a valid JSON array of exactly N strings:
["scene 1 prompt", "scene 2 prompt", ...]

Rules:
- Each scene covers ~5 seconds of footage — describe ONE specific visual moment
- Use DIFFERENT camera angles per scene (e.g. wide establishing → medium → close-up)
- Create a clear visual arc: Establish → Develop → Climax (or Build → Peak → Resolution)
- Each prompt must be self-contained and work as a standalone video generation prompt
- Always include: main subject + action, camera angle, lighting mood, atmosphere
- Max 200 characters per scene prompt
- Write in English
- Output ONLY the JSON array — no explanation, no markdown`;

/**
 * Enrich a storyboard's scene prompts using EvoLink LLM.
 * Only applies to multi-scene storyboards (≥ 2 scenes).
 * Falls back silently to template prompts on any error.
 */
export async function enrichStoryboardWithLLM(
  entries: StoryboardEntry[],
  basePrompt: string
): Promise<StoryboardEntry[]> {
  // Single scene: enhanced prompt is already good, no need for LLM
  if (entries.length <= 1) return entries;

  // Skip if no API key configured
  if (!process.env.EVOLINK_API_KEY) return entries;

  try {
    const userMessage = JSON.stringify({
      concept: basePrompt,
      scenes: entries.length,
      seconds_per_scene: entries[0]?.duration_sec ?? 5,
    });

    const raw = await callEvoLinkLLM(STORYBOARD_SYSTEM_PROMPT, userMessage, "deepseek-chat");

    // Strip markdown code blocks if model added them
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const prompts = JSON.parse(cleaned) as unknown[];

    if (!Array.isArray(prompts) || prompts.length !== entries.length) {
      console.warn(`[storyboard-llm] Expected ${entries.length} prompts, got ${prompts.length ?? "non-array"}`);
      return entries;
    }

    const enriched = entries.map((entry, i) => ({
      ...entry,
      prompt: typeof prompts[i] === "string" && (prompts[i] as string).length > 5
        ? (prompts[i] as string)
        : entry.prompt,
    }));

    console.log(`[storyboard-llm] Enriched ${entries.length} scenes for: "${basePrompt.slice(0, 50)}"`);
    return enriched;
  } catch (e) {
    console.warn("[storyboard-llm] Failed (non-fatal), using template prompts:", e instanceof Error ? e.message : e);
    return entries;
  }
}
