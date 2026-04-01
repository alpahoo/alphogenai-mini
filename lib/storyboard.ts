/**
 * Phase 2 — Storyboard generator (TypeScript mirror of workers/storyboard_generator.py)
 *
 * Splits a user prompt into N scenes based on target_duration.
 * Pure logic, deterministic, no LLM.
 */
import { type JobPlan, type EngineKey, PLAN_MAX_DURATION } from "./types";

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

/**
 * Generate a storyboard (array of scene entries) from a user prompt.
 *
 * - Single scene for free plan (5s max)
 * - Multiple scenes for pro/premium, each `clipDuration` seconds
 */
export function generateStoryboard(
  prompt: string,
  targetDuration: number = 5,
  plan: JobPlan = "free",
  clipDuration: number = DEFAULT_CLIP_DURATION
): StoryboardEntry[] {
  // Clamp target_duration to plan limit
  const maxDur = PLAN_MAX_DURATION[plan] ?? PLAN_MAX_DURATION.free;
  let td = Math.max(Math.min(targetDuration, maxDur), MIN_CLIP_DURATION);

  // Clamp clip duration
  const clipDur = Math.max(MIN_CLIP_DURATION, Math.min(clipDuration, MAX_CLIP_DURATION));

  // Calculate number of scenes
  let numScenes = Math.max(1, Math.ceil(td / clipDur));

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
