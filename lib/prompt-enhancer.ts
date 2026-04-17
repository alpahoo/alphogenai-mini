/**
 * Prompt Enhancement — transforms a short user prompt into a rich
 * cinematic video generation prompt using EvoLink LLM (DeepSeek).
 *
 * Called transparently in POST /api/jobs before sending to Seedance/Kling/Wan.
 * Always falls back to the original prompt if EvoLink is unavailable.
 *
 * Cost: ~$0.0001 per call (DeepSeek Chat, ~100 tokens in + 80 out)
 * Latency: ~1-2s
 */

import { callEvoLinkLLM } from "./evolink-client";

const SYSTEM_PROMPT = `You are an expert at writing video generation prompts for AI models like Seedance, Kling, and Wan.

Your task: transform the user's input into a vivid, cinematic video prompt.

Rules:
- Preserve the user's core subject and intent exactly
- Add: camera angle, lighting mood, visual atmosphere, cinematic style
- Use professional cinematography terms (shallow depth of field, golden hour, rack focus, etc.)
- Always write the output in English, regardless of input language
- Output ONLY the enhanced prompt — no explanations, no quotes, no preamble
- Keep it concise: 2-4 sentences max, under 300 characters
- Make it dynamic: describe movement, action, atmosphere

Examples:
Input: "a cat jumping"
Output: A sleek tabby cat leaps gracefully between rooftops at dusk, slow-motion close-up, warm golden light catching its fur mid-flight, cinematic shallow depth of field.

Input: "astronaut on mars"
Output: Lone astronaut walks slowly across the rust-red Martian surface, low-angle dramatic shot, dust swirling around boots, Earth a pale blue dot on the horizon, cinematic widescreen.

Input: "une forêt enchantée"
Output: Sunlight filters through an ancient misty forest, bioluminescent mushrooms glow softly on the ground, slow dolly push through towering oaks, dreamlike and ethereal atmosphere.`;

/**
 * Enhance a user prompt for video generation.
 * Silently falls back to original on any error.
 */
export async function enhancePrompt(userPrompt: string): Promise<string> {
  // Skip enhancement for very detailed prompts (user already knows what they want)
  if (userPrompt.length > 300) {
    return userPrompt;
  }

  // Skip if no API key configured
  if (!process.env.EVOLINK_API_KEY) {
    return userPrompt;
  }

  try {
    const enhanced = await callEvoLinkLLM(SYSTEM_PROMPT, userPrompt);

    // Sanity check: enhanced should be non-empty and not longer than 500 chars
    if (!enhanced || enhanced.length < 10) {
      console.warn("[prompt-enhancer] LLM returned suspiciously short output, using original");
      return userPrompt;
    }

    console.log(`[prompt-enhancer] "${userPrompt.slice(0, 50)}" → "${enhanced.slice(0, 80)}..."`);
    return enhanced;
  } catch (e) {
    // Non-fatal — video generation must never be blocked by enhancement failure
    console.warn("[prompt-enhancer] Failed (non-fatal), using original prompt:", e instanceof Error ? e.message : e);
    return userPrompt;
  }
}
