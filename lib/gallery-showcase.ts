import { cleanModelName } from "@/lib/engine-intentions";

export type GalleryCategory =
  | "All"
  | "Cinematic"
  | "UGC"
  | "Product"
  | "Avatar"
  | "Story"
  | "Social";

export type GalleryAccent = "story" | "product" | "ugc" | "avatar" | "social" | "director";

export type GalleryShowcaseItem = {
  id: string;
  title: string;
  category: Exclude<GalleryCategory, "All">;
  detail: string;
  accent: GalleryAccent;
  createHref: string;
  featured?: boolean;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  displayModel?: string | null;
};

export type GalleryItemRow = {
  id: string;
  source_job_id?: string | null;
  status?: "draft" | "published" | "hidden" | string | null;
  title?: string | null;
  subtitle?: string | null;
  category?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  display_model?: string | null;
  featured?: boolean | null;
  sort_order?: number | null;
};

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "All",
  "Cinematic",
  "UGC",
  "Product",
  "Avatar",
  "Story",
];

const CREATE_FALLBACK_HREF = "/create/story";

export const PLACEHOLDER_SHOWCASE_ITEMS: GalleryShowcaseItem[] = [
  {
    id: "story-placeholder",
    title: "Cinematic story",
    category: "Story",
    detail: "Character-led scenes with directed camera motion.",
    accent: "story",
    createHref: CREATE_FALLBACK_HREF,
    featured: true,
  },
  {
    id: "product-placeholder",
    title: "Product demo",
    category: "Product",
    detail: "Reference-led product shots built for social launch.",
    accent: "product",
    createHref: CREATE_FALLBACK_HREF,
  },
  {
    id: "ugc-placeholder",
    title: "UGC creator ad",
    category: "UGC",
    detail: "Creator-style hooks, demos, and CTA-ready cuts.",
    accent: "ugc",
    createHref: CREATE_FALLBACK_HREF,
  },
  {
    id: "avatar-placeholder",
    title: "Avatar presenter",
    category: "Avatar",
    detail: "Presenter workflows for scripted launches.",
    accent: "avatar",
    createHref: CREATE_FALLBACK_HREF,
  },
  {
    id: "social-placeholder",
    title: "Social cutdown",
    category: "Social",
    detail: "Vertical formats prepared for TikTok and Reels.",
    accent: "social",
    createHref: CREATE_FALLBACK_HREF,
  },
  {
    id: "director-placeholder",
    title: "Director concept",
    category: "Cinematic",
    detail: "Multi-scene planning before generation.",
    accent: "director",
    createHref: CREATE_FALLBACK_HREF,
  },
];

const CATEGORY_ALIASES: Record<string, GalleryShowcaseItem["category"]> = {
  avatar: "Avatar",
  cinematic: "Cinematic",
  product: "Product",
  social: "Social",
  story: "Story",
  ugc: "UGC",
};

const CATEGORY_ACCENTS: Record<GalleryShowcaseItem["category"], GalleryAccent> = {
  Avatar: "avatar",
  Cinematic: "director",
  Product: "product",
  Social: "social",
  Story: "story",
  UGC: "ugc",
};

function cleanText(value: string | null | undefined, fallback: string, max = 120): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : fallback;
}

export function getGalleryCreateHref(sourceJobId?: string | null): string {
  return sourceJobId ? `/create/story?reference_job_id=${encodeURIComponent(sourceJobId)}` : CREATE_FALLBACK_HREF;
}

export function normalizeGalleryCategory(value: string | null | undefined): GalleryShowcaseItem["category"] {
  const key = value?.trim().toLowerCase();
  return key && CATEGORY_ALIASES[key] ? CATEGORY_ALIASES[key] : "Cinematic";
}

export function toGalleryShowcaseItem(row: GalleryItemRow): GalleryShowcaseItem | null {
  if (row.status !== "published") {
    return null;
  }

  const category = normalizeGalleryCategory(row.category);

  return {
    id: row.id,
    title: cleanText(row.title, "Curated AlphoGen video", 80),
    category,
    detail: cleanText(row.subtitle, "A curated generation selected for the public showcase.", 140),
    accent: CATEGORY_ACCENTS[category],
    createHref: getGalleryCreateHref(row.source_job_id),
    featured: Boolean(row.featured),
    mediaUrl: row.media_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    durationSeconds: row.duration_seconds ?? null,
    displayModel: row.display_model ? cleanModelName(row.display_model) : null,
  };
}

export function buildGalleryShowcase(rows: GalleryItemRow[] | null | undefined): GalleryShowcaseItem[] {
  const published = (rows ?? [])
    .map(toGalleryShowcaseItem)
    .filter((item): item is GalleryShowcaseItem => Boolean(item));

  return published.length > 0 ? published : PLACEHOLDER_SHOWCASE_ITEMS;
}

export function getFeaturedGalleryItem(items: GalleryShowcaseItem[]): GalleryShowcaseItem {
  return items.find((item) => item.featured) ?? items[0] ?? PLACEHOLDER_SHOWCASE_ITEMS[0];
}

export function getVisibleGalleryCategories(items: GalleryShowcaseItem[]): GalleryCategory[] {
  const present = new Set(items.map((item) => item.category));
  const visible = GALLERY_CATEGORIES.filter((category) => category === "All" || present.has(category));
  return visible.length > 1 ? visible : GALLERY_CATEGORIES;
}
