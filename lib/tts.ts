/**
 * Text-to-Speech (TTS) utility — supports ElevenLabs and OpenAI TTS.
 *
 * Automatically picks the available provider based on env vars:
 *   - ELEVENLABS_API_KEY → ElevenLabs (highest quality, multilingual)
 *   - OPENAI_API_KEY     → OpenAI TTS-1-HD (fallback)
 *
 * Usage:
 *   const audioBuffer = await generateVoiceover("Hello world");
 *   // Upload audioBuffer to R2/storage
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TTSOptions {
  /** The text to convert to speech */
  text: string;
  /** Voice ID or name (provider-specific) */
  voice?: string;
  /** Speech speed multiplier (0.5-2.0, default 1.0) */
  speed?: number;
  /** Output format */
  format?: "mp3" | "wav";
}

export interface TTSResult {
  /** Audio data as ArrayBuffer */
  audio: ArrayBuffer;
  /** Provider used */
  provider: "elevenlabs" | "openai";
  /** Duration estimate in seconds (if available) */
  duration_estimate?: number;
  /** Content type */
  content_type: string;
}

// ---------------------------------------------------------------------------
// ElevenLabs voices (popular defaults)
// ---------------------------------------------------------------------------
const ELEVENLABS_VOICES: Record<string, string> = {
  rachel: "21m00Tcm4TlvDq8ikWAM",   // Calm, warm female
  adam: "pNInz6obpgDQGcFmaJgB",       // Deep, authoritative male
  antoni: "ErXwobaYiN019PkySvjV",     // Warm, friendly male
  bella: "EXAVITQu4vr4xnSDxMaL",     // Soft, gentle female
  domi: "AZnzlk1XvdvUeBnXmlld",      // Strong, clear female
  josh: "TxGEqnHWrfWFTfGW9XjX",      // Deep, serious male
};

const DEFAULT_ELEVENLABS_VOICE = ELEVENLABS_VOICES.rachel;

// ---------------------------------------------------------------------------
// OpenAI TTS voices
// ---------------------------------------------------------------------------
const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = (typeof OPENAI_VOICES)[number];
const DEFAULT_OPENAI_VOICE: OpenAIVoice = "nova";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------
export function getAvailableTTSProvider(): "elevenlabs" | "openai" | null {
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function isTTSAvailable(): boolean {
  return getAvailableTTSProvider() !== null;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------
export async function generateVoiceover(options: TTSOptions): Promise<TTSResult> {
  const provider = getAvailableTTSProvider();

  if (!provider) {
    throw new Error(
      "No TTS provider configured. Set ELEVENLABS_API_KEY or OPENAI_API_KEY."
    );
  }

  if (provider === "elevenlabs") {
    return generateElevenLabs(options);
  }

  return generateOpenAI(options);
}

// ---------------------------------------------------------------------------
// ElevenLabs implementation
// ---------------------------------------------------------------------------
async function generateElevenLabs(options: TTSOptions): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const voiceId =
    (options.voice && ELEVENLABS_VOICES[options.voice]) ||
    options.voice ||
    DEFAULT_ELEVENLABS_VOICE;

  const outputFormat = options.format === "wav" ? "pcm_22050" : "mp3_44100_128";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: options.format === "wav" ? "audio/wav" : "audio/mpeg",
      },
      body: JSON.stringify({
        text: options.text.slice(0, 5000),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
        output_format: outputFormat,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("[tts/elevenlabs] Error:", res.status, errText);
    throw new Error(`ElevenLabs TTS failed: ${res.status}`);
  }

  const audio = await res.arrayBuffer();

  // Rough duration estimate: ~150 words per minute, average word = 5 chars
  const wordCount = options.text.split(/\s+/).length;
  const durationEstimate = (wordCount / 150) * 60;

  return {
    audio,
    provider: "elevenlabs",
    duration_estimate: Math.round(durationEstimate),
    content_type: options.format === "wav" ? "audio/wav" : "audio/mpeg",
  };
}

// ---------------------------------------------------------------------------
// OpenAI TTS implementation
// ---------------------------------------------------------------------------
async function generateOpenAI(options: TTSOptions): Promise<TTSResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const voice: OpenAIVoice =
    (options.voice && OPENAI_VOICES.includes(options.voice as OpenAIVoice)
      ? (options.voice as OpenAIVoice)
      : DEFAULT_OPENAI_VOICE);

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: options.text.slice(0, 4096),
      voice,
      response_format: options.format === "wav" ? "wav" : "mp3",
      speed: options.speed ?? 1.0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[tts/openai] Error:", res.status, errText);
    throw new Error(`OpenAI TTS failed: ${res.status}`);
  }

  const audio = await res.arrayBuffer();

  const wordCount = options.text.split(/\s+/).length;
  const durationEstimate = (wordCount / 150) * 60;

  return {
    audio,
    provider: "openai",
    duration_estimate: Math.round(durationEstimate),
    content_type: options.format === "wav" ? "audio/wav" : "audio/mpeg",
  };
}
