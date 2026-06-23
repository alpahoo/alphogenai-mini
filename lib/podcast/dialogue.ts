/**
 * Podcast dialogue helpers (pure, no network).
 *
 * Prompt building, robust JSON parsing, validation, normalization and
 * provider-name scrubbing for the multi-speaker dialogue generator (T-1131c).
 * Network is isolated in `dialogue-llm.ts` so these stay unit-testable.
 */

export type SpeakerRole = "host" | "guest";

export interface DialogueSegment {
  speaker_role: SpeakerRole;
  text: string;
}

export const MIN_SEGMENTS = 6;
export const MAX_SEGMENTS = 10;
export const SEGMENT_MIN_CHARS = 1;
export const SEGMENT_MAX_CHARS = 400; // DB cap is 600 — keep margin
export const MAX_CONSECUTIVE_TURNS = 2; // reject host,host,host… runs

// Internal AlphoGen infrastructure / white-label vendor names that should not
// leak into user-facing copy. This is deliberately NARROW: only the confidential
// vendors we hide from users (T-102b) plus our gateway — NOT public brands or
// models a podcast might legitimately discuss (OpenAI, Apple, Seedance, Kling,
// Wan, LTX, ElevenLabs, …). The scrub is also CONDITIONAL: a term that appears in
// the user's own topic is kept (a podcast about HeyGen must keep "HeyGen").
const INTERNAL_INFRA_NAMES = [
  "heygen", "byteplus", "atlascloud", "atlas cloud", "evolink",
  "bailian", "kie.ai", "kie ai", "litellm",
];

/**
 * Build the LLM prompt for a host/guest dialogue. The model must return STRICT
 * JSON: { "segments": [{ "speaker_role": "host"|"guest", "text": string }] }.
 */
export function buildPodcastDialoguePrompt(opts: {
  topic: string;
  language?: string;
  hostName?: string;
  guestName?: string;
  targetDurationSeconds?: number | null;
  style?: string | null;
  sourceUrl?: string | null;
}): string {
  const { topic } = opts;
  const language = opts.language || "en-US";
  const hostName = (opts.hostName || "Host").trim();
  const guestName = (opts.guestName || "Guest").trim();
  const targetDurationSeconds = opts.targetDurationSeconds || null;
  const style = (opts.style || "casual").trim().toLowerCase();
  const sourceUrl = (opts.sourceUrl || "").trim();

  const durationGuidance = targetDurationSeconds
    ? `TARGET DURATION: about ${targetDurationSeconds} seconds. Use ${targetDurationSeconds <= 60 ? "6-8 concise" : "8-10 richer"} turns. Short videos need punchy lines; longer videos need denser insight, not filler.`
    : `TARGET DURATION: short-form default. Use 6-8 concise turns.`;

  const styleGuidance: Record<string, string> = {
    casual: "STYLE: casual podcast. Warm, direct, lightly conversational, no hype; make it sound like two smart creators talking.",
    news: "STYLE: news briefing. Clear context, what changed, why it matters, concise evidence, no sensationalism.",
    expert: "STYLE: expert analysis. Practical insight, tradeoffs, concrete examples, confident but not salesy.",
    debate: "STYLE: balanced debate. The guest challenges assumptions, the host pushes for clarity, then they converge on a useful takeaway.",
    documentary: "STYLE: documentary explainer. Narrative opening, scene-setting, concrete progression, reflective ending.",
  };

  const qualityGuidance = [
    "QUALITY BAR:",
    "- The first host line must be a sharp hook or framing question, never a generic welcome.",
    "- The guest must have a distinct role: skeptical, practical, or explanatory; not just agreeing with the host.",
    "- Include concrete mechanisms, examples, or tradeoffs from the topic. Avoid vague filler such as 'this is interesting' unless followed by a specific point.",
    "- Do not invent specific brands, statistics, dates, product claims, or source facts that were not provided by the topic/source URL. If source details are unavailable, keep examples generic.",
    "- Build a mini arc: hook -> tension/question -> explanation -> concrete implication -> final takeaway.",
    "- The final turn must leave the viewer with a clear takeaway or next question, not a bland goodbye.",
  ];

  return [
    `Write a short, natural two-person podcast dialogue about the following topic.`,
    ``,
    `TOPIC: ${topic}`,
    sourceUrl ? `SOURCE URL: ${sourceUrl}` : null,
    `LANGUAGE: ${language}`,
    `SPEAKERS: a host (${hostName}) and a guest (${guestName}).`,
    durationGuidance,
    styleGuidance[style] || styleGuidance.casual,
    ``,
    ...qualityGuidance,
    ``,
    `Rules:`,
    `- Produce between ${MIN_SEGMENTS} and ${MAX_SEGMENTS} dialogue turns.`,
    `- Alternate between the host and the guest; both must speak multiple times.`,
    `- Each turn is one or two short spoken sentences (conversational, not an essay).`,
    `- Avoid robotic Q&A. Let the second speaker add tension, examples, or correction.`,
    `- Keep each turn under ${SEGMENT_MAX_CHARS} characters.`,
    `- Brands, products, companies and models that are part of the topic are fine to discuss naturally.`,
    `- Do NOT name AlphoGen's internal providers or infrastructure unless the topic explicitly asks about them.`,
    `- No stage directions, no markdown, no speaker labels inside the text.`,
    ``,
    `Return ONLY a valid JSON object, no markdown or code fences:`,
    `{ "segments": [ { "speaker_role": "host", "text": "..." }, { "speaker_role": "guest", "text": "..." } ] }`,
  ].filter(Boolean).join("\n");
}

/**
 * Robustly parse the LLM response into a raw segments array (or null).
 * Tolerates ```json fences, an enclosing { "segments": [...] } wrapper, or a
 * bare array, plus leading/trailing prose around a single JSON object.
 */
export function parsePodcastDialogueResponse(content: string): unknown[] | null {
  if (!content || typeof content !== "string") return null;

  let text = content.trim();
  // Strip code fences (```json ... ``` or ``` ... ```)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  let parsed = tryParse(text);

  // Fallback: extract the first {...} or [...] block from surrounding prose.
  if (parsed === undefined) {
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] ?? arrMatch?.[0];
    if (candidate) parsed = tryParse(candidate);
  }

  if (parsed === undefined || parsed === null) return null;

  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object") {
    const seg = (parsed as Record<string, unknown>).segments;
    if (Array.isArray(seg)) return seg;
  }
  return null;
}

/**
 * Remove internal infra/vendor names — but keep any that the user's own topic
 * explicitly covers (so a podcast about one of them isn't censored).
 */
function scrubInternalInfra(text: string, protectedHaystack: string): string {
  let out = text;
  for (const name of INTERNAL_INFRA_NAMES) {
    if (protectedHaystack.includes(name)) continue; // legitimately part of the topic
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export interface NormalizeOptions {
  /** The user's topic/source text — terms here are NOT scrubbed. */
  topic?: string;
}

/**
 * Normalize a raw segments array: keep only well-typed turns, trim/collapse
 * whitespace, scrub internal infra names (conditionally), clamp length, drop
 * empties. Order preserved.
 */
export function normalizePodcastSegments(
  raw: unknown[],
  opts: NormalizeOptions = {},
): DialogueSegment[] {
  if (!Array.isArray(raw)) return [];
  const protectedHaystack = (opts.topic || "").toLowerCase();
  const out: DialogueSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    // Accept a few common key spellings the model might emit.
    const roleRaw =
      rec.speaker_role ?? rec.role ?? rec.speaker ?? rec.speakerRole;
    const textRaw = rec.text ?? rec.line ?? rec.content;
    if (typeof roleRaw !== "string" || typeof textRaw !== "string") continue;

    const role = roleRaw.trim().toLowerCase();
    if (role !== "host" && role !== "guest") continue;

    let text = scrubInternalInfra(textRaw.replace(/\s+/g, " ").trim(), protectedHaystack);
    if (!text) continue;
    if (text.length > SEGMENT_MAX_CHARS) text = text.slice(0, SEGMENT_MAX_CHARS).trim();

    out.push({ speaker_role: role as SpeakerRole, text });
  }
  return out;
}

export type ValidationResult =
  | { ok: true; segments: DialogueSegment[] }
  | { ok: false; error: string };

/**
 * Validate normalized segments: count in [6,10], both roles present and each
 * speaks at least twice (not all-one-speaker), text within caps.
 */
export function validatePodcastSegments(segments: DialogueSegment[]): ValidationResult {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { ok: false, error: "No dialogue segments were produced." };
  }
  if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
    return {
      ok: false,
      error: `Dialogue must have between ${MIN_SEGMENTS} and ${MAX_SEGMENTS} turns (got ${segments.length}).`,
    };
  }
  let host = 0;
  let guest = 0;
  let run = 1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.speaker_role === "host") host++;
    else if (s.speaker_role === "guest") guest++;
    else return { ok: false, error: "Invalid speaker role in dialogue." };
    if (s.text.length < SEGMENT_MIN_CHARS || s.text.length > SEGMENT_MAX_CHARS) {
      return { ok: false, error: "A dialogue turn has an invalid length." };
    }
    // No more than 2 consecutive turns by the same speaker — catches
    // host,host,host,guest,guest,guest which the count check alone would pass.
    if (i > 0 && segments[i].speaker_role === segments[i - 1].speaker_role) {
      run++;
      if (run > MAX_CONSECUTIVE_TURNS) {
        return { ok: false, error: "Dialogue must alternate — too many turns in a row by one speaker." };
      }
    } else {
      run = 1;
    }
  }
  if (host < 2 || guest < 2) {
    return { ok: false, error: "Both the host and the guest must speak at least twice." };
  }
  return { ok: true, segments };
}

/** Convenience: parse → normalize → validate in one pass. */
export function parseAndValidateDialogue(
  content: string,
  opts: NormalizeOptions = {},
): ValidationResult {
  const raw = parsePodcastDialogueResponse(content);
  if (!raw) return { ok: false, error: "Could not parse the dialogue response." };
  const normalized = normalizePodcastSegments(raw, opts);
  return validatePodcastSegments(normalized);
}
