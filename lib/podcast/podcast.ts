/**
 * Shared podcast enums + small pure validators used by the API routes.
 * Mirrors the DB CHECK constraints in 20260622_create_podcast_schema.sql so the
 * route rejects bad input before it ever hits the database.
 */

export const SOURCE_MODES = ["generate", "upload"] as const;
export const LAYOUTS = ["two_shot", "split_screen", "talk_show"] as const;
export const ASPECT_RATIOS = ["16:9", "9:16"] as const;
export const PODCAST_STATUSES = ["draft", "scripting", "ready", "failed"] as const;
export const PODCAST_TARGET_DURATIONS = [30, 60, 120, 300] as const;
export const PODCAST_STYLES = ["casual", "news", "expert", "debate", "documentary"] as const;

export type SourceMode = (typeof SOURCE_MODES)[number];
export type Layout = (typeof LAYOUTS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type PodcastStatus = (typeof PODCAST_STATUSES)[number];
export type PodcastTargetDuration = (typeof PODCAST_TARGET_DURATIONS)[number];
export type PodcastStyle = (typeof PODCAST_STYLES)[number];

export const TITLE_MAX = 200;
export const TOPIC_MAX = 2000;

export const isSourceMode = (v: unknown): v is SourceMode =>
  typeof v === "string" && (SOURCE_MODES as readonly string[]).includes(v);
export const isLayout = (v: unknown): v is Layout =>
  typeof v === "string" && (LAYOUTS as readonly string[]).includes(v);
export const isAspectRatio = (v: unknown): v is AspectRatio =>
  typeof v === "string" && (ASPECT_RATIOS as readonly string[]).includes(v);
export const isPodcastTargetDuration = (v: unknown): v is PodcastTargetDuration =>
  typeof v === "number" && (PODCAST_TARGET_DURATIONS as readonly number[]).includes(v);
export const isPodcastStyle = (v: unknown): v is PodcastStyle =>
  typeof v === "string" && (PODCAST_STYLES as readonly string[]).includes(v);

export const isLanguage = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(v);

export const isHttpUrl = (v: unknown): v is string =>
  typeof v === "string" && /^https?:\/\//.test(v);

/** Default two-speaker cast created with every new podcast. */
export const DEFAULT_SPEAKERS = [
  { name: "Host", role: "host" as const, position: 0 },
  { name: "Guest", role: "guest" as const, position: 1 },
];
