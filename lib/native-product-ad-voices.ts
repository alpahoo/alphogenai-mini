export const NATIVE_PRODUCT_AD_VOICES = [
  { id: "antoni", label: "Bright presenter", description: "Warm and energetic" },
  { id: "bella", label: "Calm presenter", description: "Soft and reassuring" },
  { id: "rachel", label: "Natural presenter", description: "Warm and conversational" },
  { id: "adam", label: "Studio presenter", description: "Deep and confident" },
] as const;

export type NativeProductAdVoiceId =
  (typeof NATIVE_PRODUCT_AD_VOICES)[number]["id"];

export const DEFAULT_NATIVE_PRODUCT_AD_VOICE: NativeProductAdVoiceId = "antoni";

export function isNativeProductAdVoice(
  value: unknown,
): value is NativeProductAdVoiceId {
  return (
    typeof value === "string"
    && NATIVE_PRODUCT_AD_VOICES.some((voice) => voice.id === value)
  );
}
