/**
 * Podcast voice catalog (pure, no network) — T-1132b Voice Lab.
 *
 * A curated set of podcast-friendly voices with product-facing metadata. Each
 * `id` maps to a concrete voice key understood by lib/tts.ts (ElevenLabs named
 * voice or OpenAI voice). The catalog is the single source of truth for the
 * Host/Guest pickers and the preview route.
 *
 * Provider display is HYBRID: the UI leads with `label`/`tone` (product-facing)
 * while `provider` remains internal routing metadata. Adding Google/Gemini,
 * Kokoro, etc. later = append rows here (+ a lib/tts branch), no UI rewrite.
 */

export type VoiceProvider = "elevenlabs" | "openai";

export interface PodcastVoice {
  /** Maps to a lib/tts voice key (ElevenLabs named voice or OpenAI voice). */
  id: string;
  /** Product-facing label (not a provider name). */
  label: string;
  /** Internal provider id. Never expose it as a product choice. */
  provider: VoiceProvider;
  gender: "female" | "male" | "neutral";
  tone: string;
  /** "multilingual" for ElevenLabs eleven_multilingual_v2, else a BCP-47-ish hint. */
  language: string;
  useCase: string;
}

export const PODCAST_VOICES: PodcastVoice[] = [
  // ElevenLabs (eleven_multilingual_v2)
  { id: "rachel", label: "Natural", provider: "elevenlabs", gender: "female", tone: "Warm", language: "multilingual", useCase: "Friendly host" },
  { id: "adam", label: "Studio HD", provider: "elevenlabs", gender: "male", tone: "Authoritative", language: "multilingual", useCase: "Confident guest" },
  { id: "antoni", label: "Energetic", provider: "elevenlabs", gender: "male", tone: "Upbeat", language: "multilingual", useCase: "Casual host" },
  { id: "bella", label: "Calm", provider: "elevenlabs", gender: "female", tone: "Soft", language: "multilingual", useCase: "Reflective guest" },
  { id: "domi", label: "Energetic", provider: "elevenlabs", gender: "female", tone: "Strong", language: "multilingual", useCase: "Lively host" },
  { id: "josh", label: "Narrative", provider: "elevenlabs", gender: "male", tone: "Deep", language: "multilingual", useCase: "Documentary guest" },
  // OpenAI (tts-1-hd)
  { id: "nova", label: "Natural", provider: "openai", gender: "female", tone: "Bright", language: "en-US", useCase: "News host" },
  { id: "onyx", label: "Narrative", provider: "openai", gender: "male", tone: "Deep", language: "en-US", useCase: "Documentary" },
  { id: "shimmer", label: "Calm", provider: "openai", gender: "female", tone: "Gentle", language: "en-US", useCase: "Reflective" },
  { id: "echo", label: "Studio HD", provider: "openai", gender: "male", tone: "Even", language: "en-US", useCase: "Balanced host" },
];

export const DEFAULT_HOST_VOICE = "rachel";
export const DEFAULT_GUEST_VOICE = "adam";

/** A short, fixed sample line used by the preview route (kept generic + brand-free). */
export const VOICE_PREVIEW_TEXT =
  "Hey, this is how this voice sounds in your podcast. Let's get into today's topic.";

export const isPodcastVoice = (v: unknown): v is string =>
  typeof v === "string" && PODCAST_VOICES.some((x) => x.id === v);

export const getPodcastVoice = (id: string): PodcastVoice | undefined =>
  PODCAST_VOICES.find((x) => x.id === id);
