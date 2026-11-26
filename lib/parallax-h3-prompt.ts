/**
 * Rewrites a Shorts idea into MiniMax H3's prompt format before admission.
 *
 * Same rules as the Studio assistant's H3 guidance (lib/studio/agent/guidance.ts): one English paragraph
 * in a fixed order ending with "Soundscape:", dialogue kept in its own language, nothing important in the
 * first half second (the 0.4 s audio advance trims it). Uses the existing EvoLink LLM (DeepSeek, as the
 * jobs prompt enhancer) and always falls back to the idea itself: a rewrite never blocks a Short.
 *
 * The rewrite only proposes text. The admin admission route still screens the final prompt and the
 * server binder stays the authority on every parameter.
 */
import { callEvoLinkLLM } from "./evolink-client";

/** H3 template limit (manifest `prompt.maxLength`). */
export const H3_PROMPT_MAX = 2000;
/** Ideas at least this long are taken as written: the author already wrote a full prompt. */
const KEEP_AS_WRITTEN_FROM = 600;

export function h3SystemPrompt(seconds: number): string {
  const maxWords = Math.max(0, Math.floor((seconds - 1.5) * 2.5));
  return [
    "You write prompts for MiniMax H3, a text-to-video model with native audio. The video is vertical (9:16), " +
      `${seconds} seconds long, one continuous shot.`,
    "Turn the user's idea into ONE English paragraph, in this order: subject and action; setting; camera movement and lens; " +
      "lighting and mood; texture details; then a final sentence starting with \"Soundscape:\" (ambient sound, effects, music).",
    "Rules:",
    "- Keep the user's subject and intent exactly. Do not add brands, logos, readable text, real people or celebrities.",
    "- Write in English, even if the idea is in French. Exception: spoken dialogue or on-screen text the user gave keeps its language, word for word, in quotes.",
    `- Dialogue is optional. If there is some, at most ${maxWords} words in total, and say who speaks and in which language.`,
    "- Nothing important in the first half second: no speech and no key sound at the very start.",
    "- Frame for a vertical screen: subject centred, readable on a phone.",
    "- Keep it under 700 characters. Output only the paragraph: no title, no quotes around it, no explanation.",
  ].join("\n");
}

export type H3PromptResult = { prompt: string; rewritten: boolean };

/** True when the idea already follows the H3 format or is long enough to be used as written. */
export function keepAsWritten(idea: string): boolean {
  return idea.length >= KEEP_AS_WRITTEN_FROM || /\bSoundscape\s*:/i.test(idea);
}

/** Cleans the model output; returns null when it is not a usable H3 paragraph. */
export function cleanRewrite(raw: string): string | null {
  let text = raw.trim().replace(/^```[a-z]*\s*|\s*```$/gi, "").trim();
  text = text.replace(/^(?:prompt|output)\s*:\s*/i, "").trim();
  if (/^["“«][\s\S]*["”»]$/.test(text)) text = text.slice(1, -1).trim();
  text = text.replace(/\s*\n+\s*/g, " ");
  if (text.length < 40 || text.length > H3_PROMPT_MAX) return null;
  if (!/\bSoundscape\s*:/i.test(text)) return null;
  return text;
}

export async function rewriteH3Prompt(idea: string, seconds: number,
  call: typeof callEvoLinkLLM = callEvoLinkLLM): Promise<H3PromptResult> {
  const trimmed = idea.trim();
  if (keepAsWritten(trimmed) || !process.env.EVOLINK_API_KEY) return { prompt: trimmed, rewritten: false };
  try {
    const cleaned = cleanRewrite(await call(h3SystemPrompt(seconds), trimmed));
    return cleaned ? { prompt: cleaned, rewritten: true } : { prompt: trimmed, rewritten: false };
  } catch (e) {
    console.warn("[h3-prompt] rewrite failed (non-fatal):", e instanceof Error ? e.message : e);
    return { prompt: trimmed, rewritten: false };
  }
}
