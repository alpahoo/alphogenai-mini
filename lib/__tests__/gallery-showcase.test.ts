import { describe, expect, it } from "vitest";
import {
  buildGalleryShowcase,
  getFeaturedGalleryItem,
  getGalleryCreateHref,
  getVisibleGalleryCategories,
  normalizeGalleryCategory,
  PLACEHOLDER_SHOWCASE_ITEMS,
  toGalleryShowcaseItem,
} from "@/lib/gallery-showcase";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

function publicText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe("gallery showcase helpers", () => {
  it("falls back to privacy-first placeholders when no published rows exist", () => {
    const items = buildGalleryShowcase([
      { id: "draft-1", status: "draft", title: "Internal test" },
      { id: "hidden-1", status: "hidden", title: "Hidden test" },
    ]);

    expect(items).toEqual(PLACEHOLDER_SHOWCASE_ITEMS);
  });

  it("keeps only explicitly published gallery rows", () => {
    const items = buildGalleryShowcase([
      { id: "draft-1", status: "draft", title: "Private job" },
      {
        id: "published-1",
        status: "published",
        title: "Paris product demo",
        subtitle: "Curated product launch clip.",
        category: "product",
        featured: true,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "published-1",
      title: "Paris product demo",
      category: "Product",
      createHref: "/create/story",
      featured: true,
    });
  });

  it("builds safe create-similar links only when a public source job is attached", () => {
    expect(getGalleryCreateHref(null)).toBe("/create/story");
    expect(getGalleryCreateHref("job 123")).toBe("/create/story?reference_job_id=job%20123");

    const item = toGalleryShowcaseItem({
      id: "with-source",
      source_job_id: "550e8400-e29b-41d4-a716-446655440000",
      status: "published",
      title: "Public source",
    });

    expect(item?.createHref).toBe("/create/story?reference_job_id=550e8400-e29b-41d4-a716-446655440000");
  });

  it("normalizes unknown categories to a safe cinematic category", () => {
    expect(normalizeGalleryCategory("ugc")).toBe("UGC");
    expect(normalizeGalleryCategory("PRODUCT")).toBe("Product");
    expect(normalizeGalleryCategory("private-experiment")).toBe("Cinematic");
  });

  it("selects a featured item when present", () => {
    const items = buildGalleryShowcase([
      { id: "first", status: "published", title: "First", category: "story" },
      { id: "featured", status: "published", title: "Featured", category: "ugc", featured: true },
    ]);

    expect(getFeaturedGalleryItem(items).id).toBe("featured");
  });

  it("derives visible categories from curated items", () => {
    const items = buildGalleryShowcase([
      { id: "story", status: "published", title: "Story", category: "story" },
      { id: "ugc", status: "published", title: "UGC", category: "ugc" },
    ]);

    expect(getVisibleGalleryCategories(items)).toEqual(["All", "UGC", "Story"]);
  });

  it("scrubs provider names from public model labels", () => {
    const item = toGalleryShowcaseItem({
      id: "provider-row",
      status: "published",
      title: "Avatar presenter",
      category: "avatar",
      display_model: "Avatar IV (HeyGen)",
    });

    expect(item?.displayModel).toBe("Avatar IV");
    expect(FORBIDDEN_RE.test(publicText(item)), publicText(item)).toBe(false);
  });

  it("keeps placeholder copy provider-neutral", () => {
    expect(FORBIDDEN_RE.test(publicText(PLACEHOLDER_SHOWCASE_ITEMS))).toBe(false);
  });
});
