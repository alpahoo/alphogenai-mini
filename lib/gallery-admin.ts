/**
 * Admin Gallery Manager — pure validation + projection helpers (T-1003).
 *
 * Security/confidentiality rules baked in here (single source of truth):
 *   - Only a whitelist of writable fields is accepted; id/created_at/created_by/
 *     updated_at can never be set from a request body.
 *   - `display_model` is always scrubbed of provider/aggregator names.
 *   - Publishing from a job NEVER copies the raw private prompt — `public_prompt`
 *     defaults to null and must be written editorially by an admin.
 *   - `published_at` is derived from `status`, not trusted from input.
 *
 * The DB stores lowercase `category` keys that map to the public projection
 * (lib/gallery-showcase.ts CATEGORY_ALIASES).
 */
import { cleanModelName } from "@/lib/engine-intentions";
import { getEngineDisplayName } from "@/lib/types";

export const GALLERY_STATUSES = ["draft", "published", "hidden"] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];

export const GALLERY_MEDIA_TYPES = ["video", "image"] as const;
export type GalleryMediaType = (typeof GALLERY_MEDIA_TYPES)[number];

/** Lowercase category keys aligned with gallery-showcase CATEGORY_ALIASES. */
export const GALLERY_DB_CATEGORIES = [
  "cinematic",
  "ugc",
  "product",
  "avatar",
  "story",
  "social",
] as const;
export type GalleryDbCategory = (typeof GALLERY_DB_CATEGORIES)[number];

export interface GalleryWriteValues {
  source_job_id?: string | null;
  media_type?: GalleryMediaType;
  status?: GalleryStatus;
  title?: string;
  subtitle?: string | null;
  public_prompt?: string | null;
  category?: GalleryDbCategory;
  media_url?: string;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  aspect_ratio?: string | null;
  duration_seconds?: number | null;
  display_model?: string | null;
  sort_order?: number;
  featured?: boolean;
  published_at?: string | null;
}

export type NormalizeResult =
  | { ok: true; values: GalleryWriteValues }
  | { ok: false; error: string };

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Clean a model label for public display; empty → null. Never leaks providers. */
function cleanDisplayModel(v: unknown): string | null {
  const s = typeof v === "string" ? cleanModelName(v).trim() : "";
  return s ? s.slice(0, 80) : null;
}

/**
 * Validate + normalize a gallery write body into a safe column set.
 *
 * @param mode "create" requires title + media_url; "update" treats every field
 *             as optional (only provided keys are returned).
 */
export function normalizeGalleryWrite(
  body: unknown,
  mode: "create" | "update",
): NormalizeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  const values: GalleryWriteValues = {};

  // title -----------------------------------------------------------------
  if (has("title") || mode === "create") {
    const title = str(b.title, 120);
    if (!title) return { ok: false, error: "title is required" };
    values.title = title;
  }

  // media_url -------------------------------------------------------------
  if (has("media_url") || mode === "create") {
    const url = str(b.media_url, 2048);
    if (!url) return { ok: false, error: "media_url is required" };
    values.media_url = url;
  }

  // media_type ------------------------------------------------------------
  if (has("media_type")) {
    if (!(GALLERY_MEDIA_TYPES as readonly unknown[]).includes(b.media_type)) {
      return { ok: false, error: `media_type must be one of: ${GALLERY_MEDIA_TYPES.join(", ")}` };
    }
    values.media_type = b.media_type as GalleryMediaType;
  } else if (mode === "create") {
    values.media_type = "video";
  }

  // category --------------------------------------------------------------
  if (has("category")) {
    const cat = typeof b.category === "string" ? b.category.trim().toLowerCase() : "";
    if (!(GALLERY_DB_CATEGORIES as readonly string[]).includes(cat)) {
      return { ok: false, error: `category must be one of: ${GALLERY_DB_CATEGORIES.join(", ")}` };
    }
    values.category = cat as GalleryDbCategory;
  } else if (mode === "create") {
    values.category = "cinematic";
  }

  // status (+ derived published_at) ---------------------------------------
  if (has("status")) {
    if (!(GALLERY_STATUSES as readonly unknown[]).includes(b.status)) {
      return { ok: false, error: `status must be one of: ${GALLERY_STATUSES.join(", ")}` };
    }
    const status = b.status as GalleryStatus;
    values.status = status;
    values.published_at = status === "published" ? new Date().toISOString() : null;
  } else if (mode === "create") {
    values.status = "draft";
    values.published_at = null;
  }

  // optional text / nullable fields ---------------------------------------
  if (has("subtitle")) values.subtitle = str(b.subtitle, 200);
  if (has("public_prompt")) values.public_prompt = str(b.public_prompt, 2000);
  if (has("thumbnail_url")) values.thumbnail_url = str(b.thumbnail_url, 2048);
  if (has("poster_url")) values.poster_url = str(b.poster_url, 2048);
  if (has("aspect_ratio")) values.aspect_ratio = str(b.aspect_ratio, 16);
  if (has("display_model")) values.display_model = cleanDisplayModel(b.display_model);
  if (has("source_job_id")) values.source_job_id = str(b.source_job_id, 64);

  // numbers / booleans ----------------------------------------------------
  if (has("duration_seconds")) {
    const n = Number(b.duration_seconds);
    values.duration_seconds = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if (has("sort_order")) {
    const n = Number(b.sort_order);
    values.sort_order = Number.isFinite(n) ? Math.round(n) : 0;
  } else if (mode === "create") {
    values.sort_order = 0;
  }
  if (has("featured")) {
    values.featured = b.featured === true || b.featured === "true";
  } else if (mode === "create") {
    values.featured = false;
  }

  return { ok: true, values };
}

/** Minimal job shape needed to seed a gallery draft. */
export interface JobForGalleryDraft {
  id: string;
  output_url_final?: string | null;
  video_url?: string | null;
  engine_used?: string | null;
  aspect_ratio?: string | null;
  target_duration_seconds?: number | null;
  status?: string | null;
}

/**
 * Build a safe DRAFT gallery item from a finished job. Crucially:
 *   - status = 'draft' (never auto-published),
 *   - public_prompt = null (the raw private prompt is NEVER copied),
 *   - display_model scrubbed of provider names.
 */
export function galleryDraftFromJob(
  job: JobForGalleryDraft,
): NormalizeResult {
  const media_url = job.output_url_final ?? job.video_url ?? null;
  if (!media_url) {
    return { ok: false, error: "Job has no finished media to add to the gallery" };
  }
  return {
    ok: true,
    values: {
      source_job_id: job.id,
      media_type: "video",
      status: "draft",
      title: "Untitled gallery item",
      subtitle: null,
      public_prompt: null, // editorial — never the raw private prompt
      category: "cinematic",
      media_url,
      aspect_ratio: job.aspect_ratio ?? null,
      duration_seconds:
        typeof job.target_duration_seconds === "number"
          ? Math.round(job.target_duration_seconds)
          : null,
      display_model: cleanDisplayModel(getEngineDisplayName(job.engine_used ?? undefined)),
      sort_order: 0,
      featured: false,
      published_at: null,
    },
  };
}
