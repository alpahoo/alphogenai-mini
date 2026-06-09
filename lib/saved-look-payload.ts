export type SavedLookReuseInput = {
  lookId?: unknown;
  scriptText?: unknown;
  voiceId?: unknown;
  lipsyncMode?: unknown;
};

export type SavedLookReusePayload = {
  prompt: string;
  preferred_engine: "heygen_avatar_shots";
  look_id: string;
  voice_id: string;
  script_text: string;
  lipsync_mode: "speed" | "precision";
  audio_mode: "none";
};

export type SavedLookReuseResult =
  | { ok: true; payload: SavedLookReusePayload }
  | { ok: false; error: string };

function trimmed(value: unknown, maxLength?: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return typeof maxLength === "number" ? text.slice(0, maxLength) : text;
}

export function buildSavedLookReusePayload(input: SavedLookReuseInput): SavedLookReuseResult {
  const lookId = trimmed(input.lookId);
  if (!lookId) return { ok: false, error: "Choose a saved Look." };

  const scriptText = trimmed(input.scriptText, 2000);
  if (!scriptText) return { ok: false, error: "Write the script for this Look." };

  const voiceId = trimmed(input.voiceId);
  if (!voiceId) return { ok: false, error: "Pick a voice for this Look." };

  const lipsyncMode = input.lipsyncMode === "precision" ? "precision" : "speed";

  return {
    ok: true,
    payload: {
      prompt: scriptText,
      preferred_engine: "heygen_avatar_shots",
      look_id: lookId,
      voice_id: voiceId,
      script_text: scriptText,
      lipsync_mode: lipsyncMode,
      audio_mode: "none",
    },
  };
}

