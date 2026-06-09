"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Film,
  Lock,
  Play,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import {
  buildGalleryShowcase,
  getFeaturedGalleryItem,
  getVisibleGalleryCategories,
  type GalleryAccent,
  type GalleryItemRow,
  type GalleryShowcaseItem,
} from "@/lib/gallery-showcase";

const accentClasses: Record<GalleryAccent, string> = {
  avatar: "from-slate-950 via-indigo-900 to-violet-200",
  director: "from-neutral-950 via-sky-950 to-slate-200",
  product: "from-stone-900 via-emerald-900 to-cyan-200",
  social: "from-zinc-950 via-lime-950 to-lime-200",
  story: "from-zinc-950 via-slate-700 to-amber-200",
  ugc: "from-neutral-950 via-rose-900 to-orange-200",
};

function ShowcaseVisual({ item, large = false }: { item: GalleryShowcaseItem; large?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950">
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
      ) : item.mediaUrl ? (
        <video src={item.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      ) : (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${accentClasses[item.accent]}`} />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25" />
        </>
      )}
      <div className="absolute left-4 top-4 rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
        {item.category}
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="h-1.5 flex-1 rounded-full bg-white/24">
          <div className={large ? "h-full w-3/4 rounded-full bg-white" : "h-full w-2/3 rounded-full bg-white"} />
        </div>
        <span className="text-[11px] font-medium text-white/75">{item.durationSeconds ? `${item.durationSeconds}s` : "Preview"}</span>
      </div>
    </div>
  );
}

function GalleryLightbox({
  item,
  onClose,
}: {
  item: GalleryShowcaseItem;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/82 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-lightbox-title"
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-lg bg-[#f6f6f2] shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Curated preview
            </p>
            <h2 id="gallery-lightbox-title" className="truncate text-base font-semibold tracking-tight">
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:text-neutral-950"
            aria-label="Close gallery preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="aspect-video lg:aspect-auto lg:min-h-[520px]">
            <ShowcaseVisual item={item} large />
          </div>
          <aside className="flex flex-col justify-between gap-8 p-5 sm:p-7">
            <div>
              <div className="mb-4 inline-flex rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold text-white">
                {item.category}
              </div>
              <h3 className="text-3xl font-semibold leading-tight tracking-tight">{item.title}</h3>
              <p className="mt-4 text-sm leading-6 text-neutral-600">{item.detail}</p>
              <dl className="mt-7 grid gap-3 text-sm">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <dt className="text-neutral-500">Public source</dt>
                  <dd className="font-medium">Admin curated</dd>
                </div>
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <dt className="text-neutral-500">Model</dt>
                  <dd className="font-medium">{item.displayModel ?? "Selected later"}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <dt className="text-neutral-500">Reuse</dt>
                  <dd className="font-medium">Safe fallback</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <Link
                href={item.createHref}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Create similar
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-xs leading-5 text-neutral-500">
                Until a safe source job is attached, this starts a fresh Director flow instead of reusing private data.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function GalleryShowcasePage({ rows }: { rows?: GalleryItemRow[] | null }) {
  const showcaseItems = buildGalleryShowcase(rows);
  const featuredItem = getFeaturedGalleryItem(showcaseItems);
  const categories = getVisibleGalleryCategories(showcaseItems);
  const hasPublishedItems = Boolean(rows?.some((row) => row.status === "published"));
  const [previewItem, setPreviewItem] = useState<GalleryShowcaseItem | null>(null);

  return (
    <div className="min-h-screen bg-[#f6f6f2] text-neutral-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-950 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          AlphoGen
        </Link>
        <nav className="hidden items-center gap-7 text-xs font-medium text-neutral-600 sm:flex">
          <Link href="/about" className="hover:text-neutral-950">
            About
          </Link>
          <Link href="/technology" className="hover:text-neutral-950">
            Technology
          </Link>
          <Link href="/pricing" className="hover:text-neutral-950">
            Pricing
          </Link>
        </nav>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-md bg-[#635bff] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5148f0]"
        >
          Create your own
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-5 pb-12 pt-8 sm:px-8 lg:pt-14">
          <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700">
                <Lock className="h-3.5 w-3.5" />
                Curated by AlphoGen
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight text-neutral-950 sm:text-6xl lg:text-7xl">
                Gallery, curated before it goes public.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-neutral-600">
                Only videos and images approved from the admin showcase will appear here.
                Private generations stay private by default.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Start creating
                  <WandSparkles className="h-4 w-4" />
                </Link>
                <Link
                  href="/technology"
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white/70 px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white"
                >
                  See the workflow
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setPreviewItem(featuredItem)}
                className="block w-full overflow-hidden rounded-lg bg-neutral-950 text-left shadow-2xl shadow-neutral-950/20 transition hover:-translate-y-0.5 hover:shadow-neutral-950/30"
                aria-label={`Preview ${featuredItem.title}`}
              >
                <div className="relative aspect-[16/10]">
                  <div className="absolute inset-0">
                    <ShowcaseVisual item={featuredItem} large />
                  </div>
                  <div className="absolute inset-x-0 top-0 hidden items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70 sm:flex">
                    <span>Featured slot</span>
                    <span>{hasPublishedItems ? "Admin selected" : "Awaiting curation"}</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-medium backdrop-blur">
                      <Film className="h-3.5 w-3.5" />
                      {hasPublishedItems ? "Curated preview" : "Showcase pending"}
                    </div>
                    <h2 className="max-w-[16rem] text-3xl font-semibold tracking-tight sm:max-w-md">
                      {featuredItem.title}
                    </h2>
                    <p className="mt-2 max-w-[15rem] text-sm leading-6 text-white/72 sm:max-w-sm">
                      {featuredItem.detail}
                    </p>
                  </div>
                  <span className="absolute bottom-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-950 shadow-lg">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="border-y border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-6 sm:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
                Showcase filters
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Categories are ready for curated gallery items.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category, index) => (
                <button
                  key={category}
                  type="button"
                  className={
                    index === 0
                      ? "rounded-full bg-neutral-950 px-4 py-2 text-xs font-semibold text-white"
                      : "rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600"
                  }
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#635bff]">
                {hasPublishedItems ? "Published by admin" : "Coming from admin curation"}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                {hasPublishedItems ? "Selected examples, cleared for public view." : "Curated examples, not private job history."}
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-neutral-600">
              {hasPublishedItems
                ? "Every item below comes from the gallery manager. Private generations are never inferred from job history."
                : "These slots show the final layout. Published media will appear only after an admin approves items in the gallery manager."}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {showcaseItems.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => setPreviewItem(slot)}
                className="group overflow-hidden rounded-lg border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-neutral-950/10"
              >
                <div className="relative aspect-video overflow-hidden bg-neutral-950">
                  <ShowcaseVisual item={slot} />
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold tracking-tight">{slot.title}</h3>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-neutral-600">
                    {slot.detail}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-12 overflow-hidden rounded-lg bg-neutral-950 px-6 py-10 text-center text-white sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">
              Privacy-first showcase
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Choose what the world sees. Keep every other generation private.
            </h2>
            <Link
              href="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100"
            >
              Create your own
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {previewItem ? <GalleryLightbox item={previewItem} onClose={() => setPreviewItem(null)} /> : null}
    </div>
  );
}
