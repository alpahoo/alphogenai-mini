/**
 * Social metadata generation — AI-crafted titles, hashtags, and
 * platform-specific descriptions via EvoLink LLM (DeepSeek).
 *
 * Falls back to keyword-template generation if LLM is unavailable.
 */

import { callEvoLinkLLM } from "./evolink-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocialMetadata {
  title: string;
  hashtags: string[];
  description_tiktok: string;
  description_youtube: string;
  description_instagram: string;
}

// ---------------------------------------------------------------------------
// LLM generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert social media content strategist for AI-generated videos.

Given a video prompt, generate platform-optimized metadata.

Return ONLY valid JSON — no explanation, no markdown, no code block:
{
  "title": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "description_tiktok": "...",
  "description_youtube": "...",
  "description_instagram": "..."
}

Rules:
- title: max 70 chars, catchy and intriguing, 1-2 relevant emojis, no surrounding quotes
- hashtags: 8-10 tags — always include #aivideo and #alphogenai, add niche topic tags relevant to the video content
- description_tiktok: max 150 chars, strong hook on first line, casual & punchy, 2-3 emojis, NO hashtags here
- description_youtube: 200-280 chars, SEO-friendly, descriptive, professional, mentions "AI-generated", no emojis
- description_instagram: 150-200 chars of storytelling + emojis, then hashtags on a new line
- Write in English unless the input is clearly in another language (then use that language)
- Each description must be unique and platform-appropriate — don't repeat`;

/**
 * Generate social media metadata for a video.
 * Async — calls EvoLink LLM (DeepSeek). Falls back to templates on error.
 */
export async function generateSocialMetadata(
  videoPrompt: string,
  engine?: string
): Promise<SocialMetadata> {
  // Strip internal [Scene X/Y] markers before sending to LLM
  const cleanPrompt = videoPrompt
    .replace(/\[Scene \d+\/\d+\]\s*/g, "")
    .trim();

  if (process.env.EVOLINK_API_KEY) {
    try {
      const raw = await callEvoLinkLLM(SYSTEM_PROMPT, cleanPrompt, "deepseek-chat");

      // Strip markdown code blocks if model wrapped it anyway
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      const parsed = JSON.parse(cleaned) as Partial<SocialMetadata>;

      if (
        parsed.title &&
        Array.isArray(parsed.hashtags) &&
        parsed.description_tiktok &&
        parsed.description_youtube &&
        parsed.description_instagram
      ) {
        return parsed as SocialMetadata;
      }
      console.warn("[social-metadata] LLM response missing fields, using template fallback");
    } catch (e) {
      console.warn("[social-metadata] LLM failed, using template fallback:", e instanceof Error ? e.message : e);
    }
  }

  return templateFallback(cleanPrompt, engine);
}

// ---------------------------------------------------------------------------
// Template fallback — works without any API key
// ---------------------------------------------------------------------------

const KEYWORD_MAP: Record<string, string[]> = {
  cinematic: ["cinematic", "film", "movie", "dramatic", "hollywood", "lens flare"],
  nature: ["ocean", "forest", "mountain", "sunset", "sky", "waves", "beach", "flower"],
  scifi: ["space", "astronaut", "mars", "alien", "futuristic", "cyberpunk", "robot"],
  action: ["chase", "fight", "explosion", "running", "race", "speed", "dynamic"],
  emotional: ["crying", "tears", "smile", "love", "sad", "happy", "joy", "wonder"],
  beauty: ["beautiful", "elegant", "stunning", "gorgeous", "luxury", "aesthetic"],
  food: ["cooking", "food", "restaurant", "chef", "recipe", "eating", "kitchen"],
  animal: ["cat", "dog", "bird", "animal", "pet", "puppy", "kitten", "wildlife"],
  fashion: ["fashion", "model", "dress", "style", "outfit", "runway"],
  tech: ["tech", "smartphone", "gadget", "digital", "product", "device"],
};

const BASE_HASHTAGS = ["#aivideo", "#alphogenai", "#aigeneratedvideo", "#aiart", "#fyp", "#trending"];

function templateFallback(prompt: string, engine?: string): SocialMetadata {
  const lower = prompt.toLowerCase();
  const matched = Object.entries(KEYWORD_MAP)
    .filter(([, kws]) => kws.some((k) => lower.includes(k)))
    .map(([cat]) => cat);

  const hashtags = [...BASE_HASHTAGS];
  if (matched.includes("cinematic")) hashtags.push("#cinematic", "#filmmaking");
  if (matched.includes("nature")) hashtags.push("#nature", "#aesthetic");
  if (matched.includes("scifi")) hashtags.push("#scifi", "#space", "#futuristic");
  if (matched.includes("action")) hashtags.push("#action", "#epic");
  if (matched.includes("animal")) hashtags.push("#cute", "#animals");
  if (matched.includes("food")) hashtags.push("#foodie", "#cooking");
  if (matched.includes("fashion")) hashtags.push("#fashion", "#style");
  if (matched.includes("tech")) hashtags.push("#tech", "#innovation");
  hashtags.push("#viral");
  const uniqueTags = [...new Set(hashtags)].slice(0, 12);

  const keyPhrase = prompt.split(/[,.;]/)[0]?.trim() || prompt;
  const short = keyPhrase.split(" ").slice(0, 10).join(" ");

  const emoji = matched.includes("scifi") ? "🚀"
    : matched.includes("nature") ? "🌿"
    : matched.includes("food") ? "🍳"
    : matched.includes("animal") ? "🐾"
    : "✨";

  return {
    title: `${short} ${emoji}`.slice(0, 70),
    hashtags: uniqueTags,
    description_tiktok: `Wait for it... 🤯\n${short}\n\nMade with AI ✨`,
    description_youtube: `AI-generated cinematic video: ${short}. Created with ${engine ?? "advanced AI models"} on AlphoGenAI — try it at alphogen.com`,
    description_instagram: `${short} ${emoji}\n\nGenerated with AI on AlphoGenAI 🎬\n\n${uniqueTags.slice(0, 10).join(" ")}`,
  };
}
