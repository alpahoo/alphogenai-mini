import type { Metadata } from "next";
import { GalleryShowcasePage } from "@/components/gallery/gallery-showcase-page";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A curated showcase of AI videos made with AlphoGen.",
};

export default async function GalleryPage() {
  return <GalleryShowcasePage />;
}
