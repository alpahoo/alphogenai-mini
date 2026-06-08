/**
 * AI Director — pre-generation quality read-out (T-202).
 *
 * Pure function: turns the current plan + inputs into a friendly diagnostic
 * (character / prompt / model / social / cost / time). Reuses the real helpers
 * instead of inline heuristics:
 *   - content-policy `screenPrompt` for prompt clarity / risk;
 *   - byteplus-cost `estimateBytePlusCost` + `SEEDANCE_USD_PER_MTOKEN` for cost;
 *   - engine-intentions `faceCompat` / `uploadCompat` for model compatibility.
 *
 * Provider/aggregator names must never appear in any output label — only
 * models/capabilities (covered by the provider-leak guard test).
 */

import { screenPrompt } from "@/lib/content-policy";
import { estimateBytePlusCost, SEEDANCE_USD_PER_MTOKEN } from "@/lib/byteplus-cost";
import {
  faceCompat,
  uploadCompat,
  type AssetCompat,
  type CompatTone,
  type EngineCompatContext,
} from "@/lib/engine-intentions";

export type QualityTone = "good" | "medium" | "risky";

export interface QualityItem {
  label: string;
  tone: QualityTone;
}

export interface QualityReadout {
  character: QualityItem;
  prompt: QualityItem;
  model: QualityItem;
  social: QualityItem;
  costLabel: string;
  timeLabel: string;
}

export interface DirectorQualityInput {
  /** Original composer prompt — fallback for risk screening only. */
  prompt: string;
  /** Edited scenes. `prompt` (when present) is what's actually sent for that
   *  scene, so risk screening must use it; `durationSec` drives cost/time/social. */
  scenes: { durationSec: number; prompt?: string }[];
  hasFace: boolean;
  hasRawImage: boolean;
  engineCompat: EngineCompatContext;
  /** Selected engine key (internal id) or "auto". Display-only mapping. */
  selectedEngineKey: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
}

/** CompatTone (ok/warn/muted) → quality tone (good/medium/risky). */
function compatToQuality(tone: CompatTone): QualityTone {
  return tone === "ok" ? "good" : "medium";
}

function modelItem(input: DirectorQualityInput): QualityItem {
  const { engineCompat, hasFace, hasRawImage } = input;
  if (engineCompat.isAuto) return { label: "Auto OK", tone: "good" };
  if (hasFace) {
    const c: AssetCompat = faceCompat(engineCompat);
    return { label: c.tone === "ok" ? "OK" : c.label, tone: compatToQuality(c.tone) };
  }
  if (hasRawImage) {
    const c: AssetCompat = uploadCompat(engineCompat);
    return { label: c.tone === "ok" ? "OK" : c.label, tone: compatToQuality(c.tone) };
  }
  // No references → nothing to be incompatible with.
  return { label: "OK", tone: "good" };
}

function promptItem(prompt: string): QualityItem {
  const base = prompt.trim();
  const { blocked, findings } = screenPrompt(base);
  if (blocked) return { label: "Review prompt", tone: "risky" };
  if (findings.some((f) => f.level === "warn")) return { label: "Caution", tone: "medium" };
  if (base.length > 60) return { label: "Good", tone: "good" };
  if (base.length > 20) return { label: "Okay", tone: "medium" };
  return { label: "Thin", tone: "risky" };
}

function socialItem(aspectRatio: DirectorQualityInput["aspectRatio"], totalDur: number): QualityItem {
  if (aspectRatio === "9:16") {
    return totalDur > 180
      ? { label: "Long for TikTok", tone: "medium" }
      : { label: "TikTok / Reels OK", tone: "good" };
  }
  if (aspectRatio === "1:1") return { label: "Square / Feed", tone: "good" };
  return { label: "Landscape / YouTube", tone: "good" };
}

function isSeedanceKey(key: string): boolean {
  return (
    key in SEEDANCE_USD_PER_MTOKEN ||
    /seedance|byteplus|atlas/i.test(key)
  );
}

function costLabelFor(selectedEngineKey: string, totalDur: number): string {
  if (selectedEngineKey === "auto" || !isSeedanceKey(selectedEngineKey)) {
    return "Estimated after plan";
  }
  const res = /720|fast/i.test(selectedEngineKey) ? "720p" : "1080p";
  const usdPerMToken = SEEDANCE_USD_PER_MTOKEN[selectedEngineKey] ?? 2.4;
  const est = estimateBytePlusCost(res, totalDur, { usdPerMToken });
  return `~$${est.costUsd.toFixed(2)}`;
}

export function computeDirectorQuality(input: DirectorQualityInput): QualityReadout {
  const { prompt, scenes, hasFace, hasRawImage, aspectRatio, selectedEngineKey } = input;
  const n = Math.max(1, scenes.length);
  const totalDur = scenes.reduce((s, sc) => s + (sc.durationSec || 0), 0);

  // Risk screening must run on the text actually sent: the edited scene prompts
  // when present, otherwise the original composer prompt.
  const scenePrompts = scenes
    .map((sc) => sc.prompt?.trim())
    .filter((p): p is string => !!p);
  const screenText = scenePrompts.length > 0 ? scenePrompts.join("\n") : prompt;

  const character: QualityItem = hasFace
    ? { label: "High", tone: "good" }
    : hasRawImage
      ? { label: "Medium", tone: "medium" }
      : { label: "None", tone: "medium" };

  return {
    character,
    prompt: promptItem(screenText),
    model: modelItem(input),
    social: socialItem(aspectRatio, totalDur),
    costLabel: costLabelFor(selectedEngineKey, totalDur),
    timeLabel: `~${n}–${n * 2} min`,
  };
}
