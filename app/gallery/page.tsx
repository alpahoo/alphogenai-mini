import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Film,
  Lock,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A curated showcase of AI videos made with AlphoGen.",
};

const categories = ["All", "Cinematic", "UGC", "Product", "Avatar", "Story"];

const showcaseSlots = [
  {
    title: "Cinematic story",
    category: "Story",
    detail: "Character-led scenes with directed camera motion.",
    accent: "from-zinc-950 via-slate-700 to-amber-200",
  },
  {
    title: "Product demo",
    category: "Product",
    detail: "Reference-led product shots built for social launch.",
    accent: "from-stone-900 via-emerald-900 to-cyan-200",
  },
  {
    title: "UGC creator ad",
    category: "UGC",
    detail: "Creator-style hooks, demos, and CTA-ready cuts.",
    accent: "from-neutral-950 via-rose-900 to-orange-200",
  },
  {
    title: "Avatar presenter",
    category: "Avatar",
    detail: "Presenter workflows for scripted launches.",
    accent: "from-slate-950 via-indigo-900 to-violet-200",
  },
  {
    title: "Social cutdown",
    category: "Social",
    detail: "Vertical formats prepared for TikTok and Reels.",
    accent: "from-zinc-950 via-lime-950 to-lime-200",
  },
  {
    title: "Director concept",
    category: "Cinematic",
    detail: "Multi-scene planning before generation.",
    accent: "from-neutral-950 via-sky-950 to-slate-200",
  },
];

export default async function GalleryPage() {
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
              <div className="overflow-hidden rounded-lg bg-neutral-950 shadow-2xl shadow-neutral-950/20">
                <div className="relative aspect-[16/10]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.28),transparent_26%),linear-gradient(125deg,#0b0b0a_0%,#18211c_34%,#6b6047_70%,#d9d0b2_100%)]" />
                  <div className="absolute inset-x-0 top-0 hidden items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70 sm:flex">
                    <span>Featured slot</span>
                    <span>Admin selected</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-medium backdrop-blur">
                      <Film className="h-3.5 w-3.5" />
                      Showcase pending
                    </div>
                    <h2 className="max-w-[16rem] text-3xl font-semibold tracking-tight sm:max-w-md">
                      Your public hero media will live here.
                    </h2>
                    <p className="mt-2 max-w-[15rem] text-sm leading-6 text-white/72 sm:max-w-sm">
                      A large editorial feature selected from the admin gallery, never from
                      raw job history.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="absolute bottom-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-950 shadow-lg"
                    aria-label="Preview featured gallery media"
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                </div>
              </div>
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
                Coming from admin curation
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Curated examples, not private job history.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-neutral-600">
              These slots show the final layout. Published media will appear only after
              the gallery manager and RLS-backed gallery table are connected.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {showcaseSlots.map((slot) => (
              <article
                key={slot.title}
                className="group overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-neutral-950/10"
              >
                <div className="relative aspect-video overflow-hidden bg-neutral-950">
                  <div className={`absolute inset-0 bg-gradient-to-br ${slot.accent}`} />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25" />
                  <div className="absolute left-4 top-4 rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                    {slot.category}
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                    <div className="h-1.5 flex-1 rounded-full bg-white/24">
                      <div className="h-full w-2/3 rounded-full bg-white" />
                    </div>
                    <span className="text-[11px] font-medium text-white/75">Preview</span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold tracking-tight">{slot.title}</h3>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-neutral-600">
                    {slot.detail}
                  </p>
                </div>
              </article>
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
    </div>
  );
}
