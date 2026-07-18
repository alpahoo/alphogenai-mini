"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  Clapperboard,
  Film,
  Images,
  Layers3,
  Lock,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  PremiumEyebrow,
  PremiumMediaFrame,
  PremiumMetricStrip,
  PremiumSectionHeader,
  PremiumWorkflowCard,
} from "@/components/premium/premium-marketing";

const directorScenes = [
  {
    title: "Hook",
    body: "Open with the product in motion, tight framing, natural creator energy.",
    tone: "Ready",
  },
  {
    title: "Proof",
    body: "Show texture, result, and before/after rhythm without losing the same look.",
    tone: "Grounded",
  },
  {
    title: "CTA",
    body: "Finish in vertical format with captions and a clean social cut.",
    tone: "9:16",
  },
];

const workflowCards = [
  {
    icon: WandSparkles,
    title: "Plan before you generate",
    body: "Turn one prompt into editable scenes with duration, motion, references, and readiness signals.",
    accent: "violet" as const,
  },
  {
    icon: Images,
    title: "Direct with assets",
    body: "Bring verified faces, product shots, outfits, saved looks, and reference frames into the same brief.",
    accent: "green" as const,
  },
  {
    icon: Clapperboard,
    title: "Finish like a studio",
    body: "Export social formats, reuse a generation as reference, save looks, and keep the next cut moving.",
    accent: "amber" as const,
  },
];

const examples = [
  ["UGC product ad", "Product + outfit + creator angle", "bg-rose-950"],
  ["Cinematic story", "Scene-led camera direction", "bg-slate-950"],
  ["Avatar presenter", "Scripted launch message", "bg-indigo-950"],
  ["Social cutdown", "TikTok/Reels ready", "bg-lime-950"],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f6f2] text-neutral-950">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div>
          <PremiumEyebrow icon={Sparkles}>Product video ads, from a URL</PremiumEyebrow>
          <h1 className="mt-7 max-w-4xl text-6xl font-semibold leading-[0.92] tracking-tight text-neutral-950 sm:text-7xl lg:text-8xl">
            Turn your product URL into a video ad.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg">
            Paste a product link and get a ready-to-post video ad — script, visuals,
            captions and your brand, done for you. No editing, no prompts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/create/url"
              className="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Create a product ad
              <WandSparkles className="h-4 w-4" />
            </Link>
            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white/70 px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white"
            >
              Browse the gallery
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-xs font-medium text-neutral-500">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              Private by default
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-3.5 w-3.5" />
              Curated publishing
            </span>
          </div>
        </div>

        <PremiumMediaFrame label="Director console" meta="Preview before generate">
          <div className="grid min-h-[560px] grid-rows-[1fr_auto] bg-[radial-gradient(circle_at_20%_15%,rgba(99,91,255,0.26),transparent_30%),linear-gradient(135deg,#06070a,#131820_58%,#d7c673)]">
            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_0.74fr]">
              <div className="flex flex-col justify-between rounded-md border border-white/10 bg-black/26 p-5 backdrop-blur">
                <div>
                  <div className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75">
                    Story Video
                  </div>
                  <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
                    Product demo with same creator, cinematic hand-held motion.
                  </h2>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-white/62">
                    Director builds a shot plan before the generation runs, so the user can adjust the story instead of guessing.
                  </p>
                </div>
                <div className="mt-8 h-1.5 rounded-full bg-white/20">
                  <div className="h-full w-4/5 rounded-full bg-white" />
                </div>
              </div>

              <div className="space-y-3">
                {directorScenes.map((scene, index) => (
                  <div key={scene.title} className="rounded-md border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-xs text-neutral-950">
                          {index + 1}
                        </span>
                        {scene.title}
                      </div>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">
                        {scene.tone}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-white/58">{scene.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid border-t border-white/10 bg-black/22 p-5 sm:grid-cols-3">
              {[
                ["References", "Face · Product · Style"],
                ["Quality", "Prompt · Cost · Social"],
                ["Output", "Gallery · Studio · Social"],
              ].map(([label, value]) => (
                <div key={label} className="border-white/10 py-3 sm:border-r sm:px-4 sm:last:border-r-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/42">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </PremiumMediaFrame>
      </section>

      <section className="border-y border-neutral-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-5 sm:grid-cols-4 sm:px-8">
          {[
            ["Director", "Editable plan"],
            ["UGC Studio", "Product-ready"],
            ["Gallery", "Admin curated"],
            ["Social Pack", "Export-ready"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-md border border-neutral-200 bg-[#f6f6f2] px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</span>
              <span className="text-sm font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <PremiumSectionHeader
          eyebrow="Workflow"
          title="One workspace for the whole video loop."
          body="AlphoGen is built around direction: prepare the brief, generate the sequence, then reuse the result as the next creative input."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {workflowCards.map((card) => (
            <PremiumWorkflowCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="bg-neutral-950 px-5 py-20 text-white sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
          <div>
            <PremiumSectionHeader
              eyebrow="UGC + product"
              title="Turn a product, outfit, and creator identity into a shoot plan."
              body="Build UGC scenes with product references, style references, verified faces or saved looks, then send the edited plan through the normal generation path."
              tone="dark"
            />
            <div className="mt-8">
              <PremiumMetricStrip
                metrics={[
                  { label: "Inputs", value: "4", detail: "Product, style, creator, platform" },
                  { label: "Scenes", value: "5-6", detail: "Hook, demo, proof, CTA" },
                  { label: "Formats", value: "3", detail: "TikTok, feed, landscape" },
                ]}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {examples.map(([title, body, bg]) => (
              <div key={title} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]">
                <div className={`aspect-[16/10] ${bg} relative`}>
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:36px_36px] opacity-25" />
                  <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-950">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/55">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <PremiumMediaFrame label="Post-generation studio" meta="Reuse · Export · Publish">
            <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr_0.8fr]">
              <div className="aspect-video rounded-md bg-[linear-gradient(135deg,#0b1020,#253449_52%,#f0b86b)]" />
              <div className="space-y-3">
                {[
                  ["Use as reference", "Start the next video from this one"],
                  ["Social pack", "TikTok, Instagram, YouTube variants"],
                  ["Save look", "Reuse the same character direction"],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-md border border-white/10 bg-white/[0.07] p-4">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </PremiumMediaFrame>

          <div>
            <PremiumEyebrow icon={Layers3}>From output to next input</PremiumEyebrow>
            <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Every finished video can become a reusable production asset.
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-600">
              Save a look, duplicate a faithful setup, use a still as reference, or publish
              only selected work into the curated public gallery.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/create/story"
                className="inline-flex items-center gap-2 rounded-md bg-[#635bff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5148f0]"
              >
                Start directing
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/gallery"
                className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
              >
                See curated work
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-white px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          <PremiumWorkflowCard
            icon={Box}
            title="Product and outfit references"
            body="Attach what matters to the brief without promising exact try-on where the model cannot guarantee it."
            accent="green"
          />
          <PremiumWorkflowCard
            icon={Film}
            title="Curated public gallery"
            body="Nothing appears publicly until an admin explicitly publishes it from the gallery manager."
            accent="blue"
          />
          <PremiumWorkflowCard
            icon={Lock}
            title="Confidential model routing"
            body="Users see capabilities and public model names, not provider or aggregator internals."
            accent="rose"
          />
        </div>
      </section>
    </main>
  );
}
