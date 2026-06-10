export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: string;
  coverWord: string;
  body: BlogBlock[];
};

export const POSTS: BlogPost[] = [
  {
    slug: "multi-scene-chaining",
    title: "Multi-scene chaining: producing coherent multi-shot AI videos",
    excerpt:
      "How AlphoGen keeps a story moving across scenes by carrying visual context forward instead of treating every clip as a disconnected prompt.",
    date: "2026-04-26",
    category: "Engineering",
    readTime: "4 min read",
    coverWord: "Chain",
    body: [
      {
        type: "p",
        text: "One of the hardest problems in AI video is continuity. A single prompt can produce a beautiful short clip, but the moment you ask for a longer story across multiple shots, things can drift: the character changes face, the lighting jumps, the props disappear. Multi-scene chaining is one way AlphoGen keeps the creative thread intact.",
      },
      { type: "h2", text: "The trick: carry context forward" },
      {
        type: "p",
        text: "When a user describes a multi-scene video, each scene is treated as part of a production rather than a standalone output. The final visual state of one scene can inform the next, helping characters, locations, lighting, and composition feel connected.",
      },
      { type: "h2", text: "Why this is non-trivial" },
      {
        type: "p",
        text: "The naive version breaks at scale. You need atomic state transitions so two workers do not claim the same scene, race-safe frame handling, and graceful retries when a model returns an error without losing the scenes that already rendered.",
      },
      { type: "h2", text: "What comes next" },
      {
        type: "p",
        text: "The same approach can power richer controls: pinning a character reference, preserving an opening frame, or giving each scene its own direction while still feeling like one production. Reference-driven multi-scene control is the next milestone.",
      },
    ],
  },
  {
    slug: "gpu-native-pipeline",
    title: "Inside AlphoGen: the production pipeline behind AI video",
    excerpt:
      "A look at how AlphoGen turns one creative brief into a validated, multi-step generation pipeline behind a single product surface.",
    date: "2026-04-20",
    category: "Architecture",
    readTime: "6 min read",
    coverWord: "Stack",
    body: [
      {
        type: "p",
        text: "AlphoGen is built around a few core constraints: video generation is expensive, user assets must stay private, and creators need feedback before they spend a generation. The technical architecture follows from those constraints.",
      },
      { type: "h2", text: "Elastic compute for bursty generation" },
      {
        type: "p",
        text: "Generative video is bursty. A single user can trigger a heavy job for a short window, then sit idle while reviewing the result. The system needs to scale up quickly, chain several processing steps, and avoid paying for idle capacity.",
      },
      { type: "h2", text: "A database shaped around ownership" },
      {
        type: "p",
        text: "A multi-tenant creator app needs strong ownership boundaries. Each user should only see their own jobs, references, saved looks, and generated media unless something has been deliberately curated for the public gallery.",
      },
      { type: "h2", text: "Asset storage as a production layer" },
      {
        type: "p",
        text: "Generated videos and reference images are large, reusable, and sensitive. Uploads are signed, outputs are attached to their owner, and public media is served only through explicit showcase flows.",
      },
      { type: "h2", text: "The orchestration layer" },
      {
        type: "p",
        text: "On top of those primitives, AlphoGen exposes one product contract: a creative brief becomes a validated job. The routing details stay private while the user sees clear capabilities, readiness, cost, and output state.",
      },
      {
        type: "p",
        text: "The goal is not a flashy stack. It is a system where each layer earns its place, protects user data, and keeps the creative workflow moving.",
      },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function formatPostDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
