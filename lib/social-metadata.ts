/**
 * AI-powered social media metadata generator (V1 — template + keyword-based).
 *
 * Generates platform-optimized title, hashtags, and descriptions
 * from the video prompt. Uses keyword extraction + smart templates.
 *
 * V2 (future): will call Claude/GPT API for creative copy.
 */

export interface SocialMetadata {
  title: string;
  hashtags: string[];
  description_tiktok: string;
  description_youtube: string;
  description_instagram: string;
}

// Keyword categories for smart tagging
const KEYWORD_MAP: Record<string, string[]> = {
  cinematic: ["cinematic", "film", "movie", "dramatic", "hollywood", "anamorphic", "lens flare"],
  nature: ["ocean", "forest", "mountain", "sunset", "sunrise", "sky", "waves", "beach", "flower"],
  scifi: ["space", "astronaut", "mars", "alien", "futuristic", "cyberpunk", "robot", "sci-fi"],
  action: ["chase", "fight", "explosion", "running", "fast", "race", "speed", "dynamic"],
  emotional: ["crying", "tears", "smile", "love", "sad", "happy", "joy", "fear", "wonder"],
  beauty: ["beautiful", "elegant", "stunning", "gorgeous", "aesthetic", "luxury", "premium"],
  food: ["cooking", "food", "restaurant", "chef", "recipe", "eating", "delicious", "kitchen"],
  animal: ["cat", "dog", "bird", "animal", "pet", "puppy", "kitten", "wildlife"],
  fashion: ["fashion", "model", "dress", "style", "outfit", "designer", "runway"],
  tech: ["tech", "smartphone", "gadget", "digital", "product", "device", "innovation"],
};

const BASE_HASHTAGS = ["#aivideo", "#alphogenai", "#aigeneratedvideo", "#aiart"];

const TITLE_HOOKS = [
  "Watch this",
  "You won't believe",
  "This is incredible",
  "AI just created",
  "Must see",
  "Unreal",
  "Mind-blowing",
  "Epic",
  "Stunning",
  "POV:",
];

const TIKTOK_HOOKS = [
  "Wait for it... 🔥",
  "This is what AI can do now 🤯",
  "POV: AI generates this video ✨",
  "Watch until the end 👀",
  "AI magic is real 🪄",
];

/**
 * Generate social media metadata from a video prompt.
 */
export function generateSocialMetadata(prompt: string, engine?: string): SocialMetadata {
  const promptLower = prompt.toLowerCase();

  // Extract keywords + categories
  const matchedCategories: string[] = [];
  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => promptLower.includes(kw))) {
      matchedCategories.push(category);
    }
  }

  // Build hashtags
  const hashtags = [...BASE_HASHTAGS];
  if (matchedCategories.includes("cinematic")) hashtags.push("#cinematic", "#filmmaking");
  if (matchedCategories.includes("nature")) hashtags.push("#nature", "#beautiful", "#aesthetic");
  if (matchedCategories.includes("scifi")) hashtags.push("#scifi", "#space", "#futuristic");
  if (matchedCategories.includes("action")) hashtags.push("#action", "#epic", "#intense");
  if (matchedCategories.includes("emotional")) hashtags.push("#emotional", "#feelthis", "#touching");
  if (matchedCategories.includes("beauty")) hashtags.push("#aesthetic", "#luxury", "#stunning");
  if (matchedCategories.includes("food")) hashtags.push("#foodie", "#asmr", "#cooking");
  if (matchedCategories.includes("animal")) hashtags.push("#cute", "#animals", "#pet");
  if (matchedCategories.includes("fashion")) hashtags.push("#fashion", "#style", "#ootd");
  if (matchedCategories.includes("tech")) hashtags.push("#tech", "#gadget", "#innovation");
  hashtags.push("#viral", "#trending", "#foryou", "#fyp");

  // Deduplicate
  const uniqueHashtags = [...new Set(hashtags)].slice(0, 15);

  // Extract key phrase (first meaningful part of prompt, up to ~10 words)
  const cleanPrompt = prompt
    .replace(/\[.*?\]/g, "") // Remove [HOOK], [ACTION] etc.
    .replace(/\s+/g, " ")
    .trim();
  const keyPhrase = cleanPrompt.split(/[,.;]/).filter(Boolean)[0]?.trim() || cleanPrompt;
  const shortPhrase =
    keyPhrase.split(" ").length > 10
      ? keyPhrase.split(" ").slice(0, 10).join(" ") + "..."
      : keyPhrase;

  // Title (catchy)
  const hook = TITLE_HOOKS[Math.floor(Math.random() * TITLE_HOOKS.length)];
  const emoji = matchedCategories.includes("scifi")
    ? "🚀"
    : matchedCategories.includes("nature")
    ? "🌿"
    : matchedCategories.includes("food")
    ? "🍳"
    : matchedCategories.includes("animal")
    ? "🐾"
    : "✨";
  const title = `${hook} ${emoji} ${shortPhrase}`;

  // TikTok description (short, hook-driven)
  const tiktokHook = TIKTOK_HOOKS[Math.floor(Math.random() * TIKTOK_HOOKS.length)];
  const description_tiktok = `${tiktokHook}\n\n${shortPhrase}\n\nMade with AI by @AlphoGenAI\n\n${uniqueHashtags.slice(0, 10).join(" ")}`;

  // YouTube description (detailed, SEO-friendly)
  const description_youtube = `${shortPhrase}\n\nThis video was generated entirely by AI using ${engine ?? "advanced AI models"} on AlphoGenAI — the AI video creation platform.\n\n🔗 Try it yourself: https://alphogen.com\n\n---\n${uniqueHashtags.join(" ")}\n\n#Shorts`;

  // Instagram (clean, aesthetic)
  const description_instagram = `${shortPhrase} ${emoji}\n\nGenerated with AI ${emoji}\n\n${uniqueHashtags.slice(0, 12).join(" ")}\n\n—\nCreate yours at alphogen.com`;

  return {
    title,
    hashtags: uniqueHashtags,
    description_tiktok,
    description_youtube,
    description_instagram,
  };
}
