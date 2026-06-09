import type { Metadata } from "next";
import { GalleryShowcasePage } from "@/components/gallery/gallery-showcase-page";
import { createClient } from "@/lib/supabase/server";
import type { GalleryItemRow } from "@/lib/gallery-showcase";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A curated showcase of AI videos made with AlphoGen.",
};

export default async function GalleryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gallery_items")
    .select(
      "id, source_job_id, status, title, subtitle, category, media_url, thumbnail_url, duration_seconds, display_model, featured, sort_order",
    )
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });

  return <GalleryShowcasePage rows={(data ?? []) as GalleryItemRow[]} />;
}
