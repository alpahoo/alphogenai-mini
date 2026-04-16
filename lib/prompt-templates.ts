/**
 * Prompt template library — pre-built prompts organized by category.
 * Helps users get started with proven, well-structured prompts.
 */

export interface PromptTemplate {
  id: string;
  category: string;
  title: string;
  prompt: string;
  duration?: number; // suggested duration in seconds
  emoji: string;
}

export const PROMPT_CATEGORIES = [
  { id: "cinematic", label: "Cinematic", emoji: "🎬" },
  { id: "nature", label: "Nature", emoji: "🌿" },
  { id: "product", label: "Product", emoji: "📦" },
  { id: "social", label: "Social Media", emoji: "📱" },
  { id: "abstract", label: "Abstract", emoji: "✨" },
  { id: "story", label: "Story", emoji: "📖" },
] as const;

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Cinematic
  {
    id: "cin-1",
    category: "cinematic",
    title: "Slow Motion Hero Shot",
    prompt:
      "Cinematic slow motion shot of a hero walking through a smoke-filled corridor, dramatic lighting, anamorphic lens flares, ultra realistic, shallow depth of field",
    duration: 5,
    emoji: "🦸",
  },
  {
    id: "cin-2",
    category: "cinematic",
    title: "Aerial City Sweep",
    prompt:
      "Sweeping aerial drone shot over a futuristic neon-lit city at night, cyberpunk atmosphere, rain glistening on streets, cinematic color grading",
    duration: 5,
    emoji: "🏙️",
  },
  {
    id: "cin-3",
    category: "cinematic",
    title: "Car Chase Scene",
    prompt:
      "Fast-paced car chase scene through narrow streets, motion blur, sparks flying, cinematic Hollywood-style action sequence",
    duration: 5,
    emoji: "🏎️",
  },

  // Nature
  {
    id: "nat-1",
    category: "nature",
    title: "Ocean Waves at Sunset",
    prompt:
      "Powerful ocean waves crashing against rocky cliffs at golden hour sunset, slow motion, hyper realistic, dramatic sky with orange and purple hues",
    duration: 5,
    emoji: "🌊",
  },
  {
    id: "nat-2",
    category: "nature",
    title: "Forest in Morning Mist",
    prompt:
      "Mystical ancient forest covered in morning mist, sunlight streaming through tall trees, dewdrops on leaves, peaceful and ethereal",
    duration: 5,
    emoji: "🌲",
  },
  {
    id: "nat-3",
    category: "nature",
    title: "Hummingbird Macro",
    prompt:
      "Macro shot of a hummingbird hovering near a vibrant red flower, wings beating in slow motion, ultra realistic detail",
    duration: 5,
    emoji: "🐦",
  },

  // Product
  {
    id: "prod-1",
    category: "product",
    title: "Luxury Watch Reveal",
    prompt:
      "Elegant rotating shot of a luxury wristwatch on a black velvet surface, dramatic spotlight, premium product photography style, ultra detailed",
    duration: 5,
    emoji: "⌚",
  },
  {
    id: "prod-2",
    category: "product",
    title: "Cosmetics Splash",
    prompt:
      "Cosmetic bottle bathed in liquid splash, slow motion droplets, clean white background, professional product commercial style",
    duration: 5,
    emoji: "💄",
  },
  {
    id: "prod-3",
    category: "product",
    title: "Tech Gadget Showcase",
    prompt:
      "Sleek modern smartphone rotating on a minimalist platform, soft ambient lighting, premium tech advertisement aesthetic",
    duration: 5,
    emoji: "📱",
  },

  // Social Media
  {
    id: "soc-1",
    category: "social",
    title: "Cooking ASMR",
    prompt:
      "Close-up of a chef pouring honey over fresh pancakes, golden syrup cascading slowly, mouth-watering food photography",
    duration: 5,
    emoji: "🥞",
  },
  {
    id: "soc-2",
    category: "social",
    title: "Fashion Editorial",
    prompt:
      "Stylish model in flowing dress walking through a sunlit field of wildflowers, slow motion, fashion editorial vibe, vibrant colors",
    duration: 5,
    emoji: "👗",
  },
  {
    id: "soc-3",
    category: "social",
    title: "Pet Reaction",
    prompt:
      "Adorable golden retriever puppy tilting its head curiously at the camera, soft natural lighting, ultra realistic",
    duration: 5,
    emoji: "🐶",
  },

  // Abstract
  {
    id: "abs-1",
    category: "abstract",
    title: "Liquid Metal Flow",
    prompt:
      "Mesmerizing flow of liquid mercury forming abstract shapes, iridescent reflections, dark background, hypnotic motion",
    duration: 5,
    emoji: "💧",
  },
  {
    id: "abs-2",
    category: "abstract",
    title: "Cosmic Nebula",
    prompt:
      "Vibrant cosmic nebula swirling with purple, blue and pink colors, deep space aesthetic, stars twinkling, ethereal beauty",
    duration: 5,
    emoji: "🌌",
  },
  {
    id: "abs-3",
    category: "abstract",
    title: "Geometric Morphing",
    prompt:
      "Abstract geometric shapes morphing fluidly, vibrant gradient colors, modern motion design, smooth transitions",
    duration: 5,
    emoji: "🔷",
  },

  // Story
  {
    id: "sto-1",
    category: "story",
    title: "Lost Astronaut",
    prompt:
      "[HOOK] A lone astronaut discovers a glowing artifact on Mars [ACTION] Slowly approaches, reaches out [EMOTION] Wonder and awe [STYLE] cinematic, ultra realistic [CAMERA] slow dolly-in",
    duration: 15,
    emoji: "🚀",
  },
  {
    id: "sto-2",
    category: "story",
    title: "Magical Discovery",
    prompt:
      "[HOOK] A child opens an ancient book in a dusty library [ACTION] Glowing pages reveal magical creatures [EMOTION] Pure wonder and joy [STYLE] cinematic, fairytale [CAMERA] close-up to wide shot",
    duration: 15,
    emoji: "📚",
  },
  {
    id: "sto-3",
    category: "story",
    title: "Race Against Time",
    prompt:
      "[HOOK] A detective examines clues on a rainy street [ACTION] Suddenly notices a key detail and rushes off [EMOTION] Tension and urgency [STYLE] noir cinematic [CAMERA] dynamic handheld",
    duration: 15,
    emoji: "🕵️",
  },
];

export function getTemplatesByCategory(categoryId: string): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.category === categoryId);
}
