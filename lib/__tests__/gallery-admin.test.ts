import { describe, expect, it } from "vitest";
import {
  normalizeGalleryWrite,
  galleryDraftFromJob,
} from "@/lib/gallery-admin";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

describe("normalizeGalleryWrite — create", () => {
  it("requires a title", () => {
    const r = normalizeGalleryWrite({ media_url: "https://cdn/x.mp4" }, "create");
    expect(r).toEqual({ ok: false, error: "title is required" });
  });

  it("requires a media_url", () => {
    const r = normalizeGalleryWrite({ title: "Hero clip" }, "create");
    expect(r).toEqual({ ok: false, error: "media_url is required" });
  });

  it("applies privacy-safe defaults", () => {
    const r = normalizeGalleryWrite({ title: "Hero clip", media_url: "https://cdn/x.mp4" }, "create");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toMatchObject({
      title: "Hero clip",
      media_url: "https://cdn/x.mp4",
      media_type: "video",
      category: "cinematic",
      status: "draft",
      sort_order: 0,
      featured: false,
      published_at: null,
    });
  });

  it("sets published_at when created as published", () => {
    const r = normalizeGalleryWrite({ title: "T", media_url: "u", status: "published" }, "create");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values.status).toBe("published");
    expect(typeof r.values.published_at).toBe("string");
  });

  it("rejects invalid enums", () => {
    expect(normalizeGalleryWrite({ title: "T", media_url: "u", status: "live" }, "create").ok).toBe(false);
    expect(normalizeGalleryWrite({ title: "T", media_url: "u", category: "nsfw" }, "create").ok).toBe(false);
    expect(normalizeGalleryWrite({ title: "T", media_url: "u", media_type: "gif" }, "create").ok).toBe(false);
  });

  it("scrubs provider names from display_model", () => {
    const r = normalizeGalleryWrite(
      { title: "T", media_url: "u", display_model: "Avatar IV (HeyGen)" },
      "create",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values.display_model).toBe("Avatar IV");
    expect(FORBIDDEN_RE.test(JSON.stringify(r.values))).toBe(false);
  });

  it("never accepts non-whitelisted/dangerous fields", () => {
    const r = normalizeGalleryWrite(
      { title: "T", media_url: "u", id: "evil", created_by: "someone", created_at: "2000", updated_at: "x" },
      "create",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).not.toHaveProperty("id");
    expect(r.values).not.toHaveProperty("created_by");
    expect(r.values).not.toHaveProperty("created_at");
    expect(r.values).not.toHaveProperty("updated_at");
  });

  it("normalizes category case", () => {
    const r = normalizeGalleryWrite({ title: "T", media_url: "u", category: "UGC" }, "create");
    expect(r.ok && r.values.category).toBe("ugc");
  });
});

describe("normalizeGalleryWrite — update (partial)", () => {
  it("returns only provided keys", () => {
    const r = normalizeGalleryWrite({ featured: true }, "update");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.values)).toEqual(["featured"]);
    expect(r.values.featured).toBe(true);
  });

  it("derives published_at from a status transition", () => {
    const pub = normalizeGalleryWrite({ status: "published" }, "update");
    expect(pub.ok && typeof pub.values.published_at).toBe("string");
    const hidden = normalizeGalleryWrite({ status: "hidden" }, "update");
    expect(hidden.ok && hidden.values.published_at).toBeNull();
  });

  it("trims empty optional text to null", () => {
    const r = normalizeGalleryWrite({ subtitle: "   ", public_prompt: "" }, "update");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values.subtitle).toBeNull();
    expect(r.values.public_prompt).toBeNull();
  });

  it("coerces numbers", () => {
    const r = normalizeGalleryWrite({ sort_order: "3", duration_seconds: 8.6 }, "update");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values.sort_order).toBe(3);
    expect(r.values.duration_seconds).toBe(9);
  });
});

describe("galleryDraftFromJob", () => {
  it("fails when the job has no finished media", () => {
    const r = galleryDraftFromJob({ id: "job-1", output_url_final: null, video_url: null });
    expect(r.ok).toBe(false);
  });

  it("builds a privacy-safe draft (no raw prompt, never published)", () => {
    const r = galleryDraftFromJob({
      id: "job-1",
      output_url_final: "https://cdn/final.mp4",
      engine_used: "seedance2_fast_byteplus",
      aspect_ratio: "9:16",
      target_duration_seconds: 12,
      status: "done",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toMatchObject({
      source_job_id: "job-1",
      status: "draft",
      public_prompt: null,
      media_url: "https://cdn/final.mp4",
      aspect_ratio: "9:16",
      duration_seconds: 12,
    });
    // provider-neutral model label, no raw engine key
    expect(r.values.display_model?.toLowerCase()).not.toContain("byteplus");
    expect(FORBIDDEN_RE.test(JSON.stringify(r.values))).toBe(false);
  });

  it("prefers output_url_final over video_url", () => {
    const r = galleryDraftFromJob({ id: "j", output_url_final: "https://a.mp4", video_url: "https://b.mp4" });
    expect(r.ok && r.values.media_url).toBe("https://a.mp4");
  });
});
