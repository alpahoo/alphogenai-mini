/**
 * Podcast voice resolution + provisional timing helpers (pure, no network).
 *
 * Used by POST /api/podcasts/[id]/tts (T-1131d). Network (TTS synthesis) lives in
 * lib/tts.ts; these stay unit-testable.
 */

export interface SpeakerLike {
  id: string;
  role: string; // "host" | "guest"
  voice_id?: string | null;
}

/** Default voices — distinct per role (names resolved by lib/tts.ts). */
export const DEFAULT_HOST_VOICE = "rachel";
export const DEFAULT_GUEST_VOICE = "adam";

/** Small silence between turns so cumulative timings don't butt up. */
export const INTER_SEGMENT_GAP_MS = 300;

/**
 * Resolve each speaker's concrete TTS voice. Honors `speaker.voice_id` when set,
 * else falls back to a role default. Guarantees host and guest end up with
 * DISTINCT voices: if both resolve to the same voice, the guest is nudged to the
 * other default so the two speakers never sound identical.
 */
export function resolveSpeakerVoices(speakers: SpeakerLike[]): Record<string, string> {
  const host = speakers.find((s) => s.role === "host");
  const guest = speakers.find((s) => s.role === "guest");

  let hostVoice = host?.voice_id?.trim() || DEFAULT_HOST_VOICE;
  let guestVoice = guest?.voice_id?.trim() || DEFAULT_GUEST_VOICE;

  if (hostVoice === guestVoice) {
    // Keep an explicitly-set voice; only move the side that fell back, else move guest.
    if (guest?.voice_id?.trim()) {
      hostVoice = hostVoice === DEFAULT_HOST_VOICE ? DEFAULT_GUEST_VOICE : DEFAULT_HOST_VOICE;
    } else {
      guestVoice = guestVoice === DEFAULT_GUEST_VOICE ? DEFAULT_HOST_VOICE : DEFAULT_GUEST_VOICE;
    }
  }

  const map: Record<string, string> = {};
  if (host) map[host.id] = hostVoice;
  if (guest) map[guest.id] = guestVoice;
  // Any extra speakers (not expected in V1) just take their own voice_id or host default.
  for (const s of speakers) {
    if (!map[s.id]) map[s.id] = s.voice_id?.trim() || DEFAULT_HOST_VOICE;
  }
  return map;
}

/**
 * Provisional per-segment timing from estimated durations (seconds). Cumulative
 * with a small inter-segment gap. These are placeholders until the render step
 * (T-1131e) probes the real audio length.
 */
export function estimateSegmentTimings(
  durationsSec: number[],
  gapMs: number = INTER_SEGMENT_GAP_MS,
): Array<{ start_ms: number; end_ms: number }> {
  const out: Array<{ start_ms: number; end_ms: number }> = [];
  let cursor = 0;
  for (const d of durationsSec) {
    const dur = Math.max(0, Math.round((Number.isFinite(d) ? d : 0) * 1000));
    const start = cursor;
    const end = start + dur;
    out.push({ start_ms: start, end_ms: end });
    cursor = end + gapMs;
  }
  return out;
}
