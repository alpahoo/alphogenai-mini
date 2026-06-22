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

// Internal provider / brand names that must never surface in user-facing copy.
const PROVIDER_BLOCKLIST = [
  "heygen", "byteplus", "atlascloud", "atlas cloud", "evolink", "bailian",
  "kie.ai", "kie ai", "elevenlabs", "eleven labs", "openai", "open ai",
  "anthropic", "claude", "gpt-4", "gpt4", "gpt", "litellm", "modal", "vercel",
  "supabase", "seedance", "runway", "pika", "sora", "kling", "wan", "ltx",
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
}): string {
  const { topic } = opts;
  const language = opts.language || "en-US";
  const hostName = (opts.hostName || "Host").trim();
  const guestName = (opts.guestName || "Guest").trim();

  return [
    `Write a short, natural two-person podcast dialogue about the following topic.`,
    ``,
    `TOPIC: ${topic}`,
    `LANGUAGE: ${language}`,
    `SPEAKERS: a host (${hostName}) and a guest (${guestName}).`,
    ``,
    `Rules:`,
    `- Produce between ${MIN_SEGMENTS} and ${MAX_SEGMENTS} dialogue turns.`,
    `- Alternate between the host and the guest; both must speak multiple times.`,
    `- Each turn is one or two short spoken sentences (conversational, not an essay).`,
    `- Keep each turn under ${SEGMENT_MAX_CHARS} characters.`,
    `- Do NOT mention any brand, company, vendor, model, or tool names.`,
    `- No stage directions, no markdown, no speaker labels inside the text.`,
    ``,
    `Return ONLY a valid JSON object, no markdown or code fences:`,
    `{ "segments": [ { "speaker_role": "host", "text": "..." }, { "speaker_role": "guest", "text": "..." } ] }`,
  ].join("\n");
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

function scrubProviderNames(text: string): string {
  let out = text;
  for (const name of PROVIDER_BLOCKLIST) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Normalize a raw segments array: keep only well-typed turns, trim/collapse
 * whitespace, scrub provider names, clamp length, drop empties. Order preserved.
 */
export function normalizePodcastSegments(raw: unknown[]): DialogueSegment[] {
  if (!Array.isArray(raw)) return [];
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

    let text = scrubProviderNames(textRaw.replace(/\s+/g, " ").trim());
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
  for (const s of segments) {
    if (s.speaker_role === "host") host++;
    else if (s.speaker_role === "guest") guest++;
    else return { ok: false, error: "Invalid speaker role in dialogue." };
    if (s.text.length < SEGMENT_MIN_CHARS || s.text.length > SEGMENT_MAX_CHARS) {
      return { ok: false, error: "A dialogue turn has an invalid length." };
    }
  }
  if (host < 2 || guest < 2) {
    return { ok: false, error: "Dialogue must alternate between both speakers." };
  }
  return { ok: true, segments };
}

/** Convenience: parse → normalize → validate in one pass. */
export function parseAndValidateDialogue(content: string): ValidationResult {
  const raw = parsePodcastDialogueResponse(content);
  if (!raw) return { ok: false, error: "Could not parse the dialogue response." };
  const normalized = normalizePodcastSegments(raw);
  return validatePodcastSegments(normalized);
}
