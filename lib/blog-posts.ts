/**
 * Blog content registry.
 *
 * Posts are defined as data here (not MDX) — the content tree is small enough
 * that a typed module is simpler than a content pipeline. Each post has:
 *   - slug:     URL segment under /blog/[slug]
 *   - title:    page title + h1
 *   - excerpt:  shown on the index card and used in OG description
 *   - date:     ISO yyyy-mm-dd, formatted at render time
 *   - category: short label, used as a tag chip
 *   - readTime: rough estimate, shown next to date
 *   - gradient: tailwind gradient classes for the cover block (no images yet)
 *   - body:     ordered list of paragraphs / headings rendered on the post page
 *
 * Order in POSTS = display order on /blog (newest first).
 */
export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO yyyy-mm-dd
  category: string;
  readTime: string;
  gradient: string;
  coverWord: string;
  body: BlogBlock[];
};

export const POSTS: BlogPost[] = [
  {
    slug: "multi-scene-chaining",
    title: "Multi-scene chaining: producing coherent multi-shot AI videos",
    excerpt:
      "How AlphoGen stitches independent generations into a single fluid story by re-using the last frame of each scene as the seed of the next.",
    date: "2026-04-26",
    category: "Engineering",
    readTime: "4 min read",
    gradient: "from-indigo-500/40 via-purple-500/30 to-fuchsia-500/30",
    coverWord: "Chain",
    body: [
      {
        type: "p",
        text: "One of the hardest problems in AI video is continuity. A single text-to-video model can produce a beautiful 5-second clip, but the moment you ask for a 15-second story across three different shots, things fall apart: the character changes face, the lighting jumps, the props disappear. We just shipped a fix for that — multi-scene chaining is now live in AlphoGen.",
      },
      { type: "h2", text: "The trick: last frame as seed" },
      {
        type: "p",
        text: "When a user describes a multi-scene video, we generate scene 0 from text. As soon as it finishes, we extract its final frame and feed it as the first frame of scene 1's image-to-video generation. Scene 1 finishes, we extract its last frame, feed it to scene 2. The chain continues until the story is complete. The visual identity of characters, lighting, and props carries through naturally.",
      },
      { type: "h2", text: "Why this is non-trivial" },
      {
        type: "p",
        text: "The naive version breaks at scale. You need atomic state transitions so two workers don't claim the same scene, race-safe last-frame extraction, and graceful retries when one engine returns a 4xx without losing the scenes that already rendered. Our pipeline runs on Modal with a small state machine and idempotent claim semantics — if a scene fails on attempt 3, we retry just that scene without throwing away the earlier work.",
      },
      { type: "h2", text: "What's next" },
      {
        type: "p",
        text: "We're rolling out the same chaining approach across all our supported engines (Wan 2.6, Seedance 2.0, Hailuo, Kling) and exposing per-scene controls so creators can pin a character reference image at the start and let it propagate. Reference-driven multi-scene is the next milestone.",
      },
    ],
  },
  {
    slug: "gpu-native-pipeline",
    title: "Inside AlphoGen: our Modal-based GPU-native video pipeline",
    excerpt:
      "A look at how we orchestrate Wan 2.6, Seedance, and other generative video models behind a single API — and why we picked Modal over a managed inference platform.",
    date: "2026-04-20",
    category: "Architecture",
    readTime: "6 min read",
    gradient: "from-cyan-500/40 via-blue-500/30 to-indigo-500/30",
    coverWord: "Stack",
    body: [
      {
        type: "p",
        text: "AlphoGen is built on three core pieces of infrastructure: Modal for elastic GPU compute, Supabase for application data, and Cloudflare R2 for global asset delivery. None of these choices are accidental — each one comes from a constraint we hit early and refused to negotiate on.",
      },
      { type: "h2", text: "Modal for compute" },
      {
        type: "p",
        text: "Generative video is bursty. A single user can trigger an H100 for 2 minutes, then we sit idle for an hour. Reserved instances are wasteful; managed inference platforms charge a premium and lock you into their model catalog. Modal lets us write Python functions, decorate them with the GPU we need, and pay strictly for the seconds we use. We can also chain multiple steps — text-to-video, audio sync, format export — inside the same function call without touching infrastructure.",
      },
      { type: "h2", text: "Supabase for data" },
      {
        type: "p",
        text: "Postgres with Row-Level Security gives us the right primitives for a multi-tenant creator app. Each user only sees their own jobs; the realtime channel pushes job-status updates to the browser without us writing a polling layer. We use the JS client on the edge and the service-role client on the server for admin operations.",
      },
      { type: "h2", text: "R2 for assets" },
      {
        type: "p",
        text: "Generated videos are large and read globally. Cloudflare R2 gives us S3-compatible storage with zero egress fees, which is the right shape for a content platform. We sign upload URLs server-side and serve the final assets via a custom domain on the Cloudflare CDN.",
      },
      { type: "h2", text: "The orchestration layer" },
      {
        type: "p",
        text: "On top of those primitives, we built a small unified API — EvoLink — that abstracts every supported generative video engine behind a single shape. The same job specification can run on Wan 2.6, Seedance 2.0, Hailuo, or Kling, and our router picks the right one based on quality, latency, and price for the user's plan.",
      },
      {
        type: "p",
        text: "It's not a flashy stack, but it's a pragmatic one. Each piece is replaceable. Each piece earns its place. That's the bar.",
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
