"use client";

// T-1130a — Guided Creation Hub.
// A visual, Jogg-like entry point: the user picks an outcome and AlphoGen hides the
// technical complexity behind a guided flow. Story / Cinematic stays the featured,
// first card (core product). UI/navigation only — reuses existing routes, no new
// DB/route/pipeline. Detailed per-flow screens are T-1130b/c/d.

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

type ToolStatus = "live" | "soon";

interface Tool {
  id: string;
  title: string;
  description: string;
  badge: string;
  /** CSS gradient for the mini visual block (mirrors the validated mockup). */
  visual: string;
  href?: string;
  status: ToolStatus;
  featured?: boolean;
  /** Optional secondary badge, e.g. "Low cost". */
  tag?: string;
}

const TOOLS: Tool[] = [
  {
    id: "story",
    title: "Story / Cinematic",
    description: "Plan scenes with the Director. Describe a scene or sequence, add references, then generate.",
    badge: "Core",
    visual: "linear-gradient(135deg, #090b13, #283c79 48%, #e7b66a)",
    href: "/create/story",
    status: "live",
    featured: true,
  },
  {
    id: "url",
    title: "URL to Video",
    description: "Turn a product page, article, or docs page into a guided video. Research works behind the scenes.",
    badge: "URL",
    visual: "linear-gradient(135deg, #fff7db, #f9fbff 50%, #83e8ff)",
    href: "/create/url",
    status: "live",
  },
  {
    id: "avatar",
    title: "Avatar Video",
    description: "Choose an avatar, edit the script, pick a voice, then generate.",
    badge: "Avatar",
    visual: "linear-gradient(135deg, #ffe4ee, #d9c8ff, #fff)",
    href: "/create/avatar",
    status: "live",
  },
  {
    id: "podcast",
    title: "Podcast Video",
    description: "Two speakers, podcast layout, per-speaker dialogue, separate voices.",
    badge: "Podcast",
    visual: "linear-gradient(135deg, #10131a, #35405a 48%, #ffce7d)",
    status: "soon",
  },
  {
    id: "ugc",
    title: "Product / UGC",
    description: "Product + media + creator + social angle. Visual suggestions, explicit selection.",
    badge: "UGC",
    visual: "linear-gradient(135deg, #eafff4, #fff, #f7d8ff)",
    href: "/create/product",
    status: "live",
  },
  {
    id: "explainer",
    title: "Explainer",
    description: "Animated slides, voice-over, captions, branding. Cheaper and more deterministic.",
    badge: "Explainer",
    visual: "linear-gradient(135deg, #f5f7ff, #fff, #cdf4ff)",
    href: "/research",
    status: "live",
    tag: "Low cost",
  },
];

function CardInner({ tool }: { tool: Tool }) {
  const featured = tool.featured;
  return (
    <>
      <div
        className="h-32 rounded-2xl border border-white/50 shadow-inner"
        style={{ background: tool.visual }}
      />
      <div className="mt-4 flex flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${
              featured ? "bg-cyan-400/15 text-cyan-200" : "bg-blue-500/10 text-blue-700"
            }`}
          >
            {tool.badge}
          </span>
          {tool.tag && (
            <span className="inline-flex w-fit rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-emerald-600">
              {tool.tag}
            </span>
          )}
          {tool.status === "soon" && (
            <span className="inline-flex w-fit rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-neutral-500">
              Soon
            </span>
          )}
        </div>
        <h3 className={`text-lg font-bold tracking-tight ${featured ? "text-white" : "text-neutral-900"}`}>
          {tool.title}
        </h3>
        <p className={`mt-1.5 text-sm leading-relaxed ${featured ? "text-white/70" : "text-neutral-500"}`}>
          {tool.description}
        </p>
        {tool.status === "live" && (
          <span
            className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${
              featured ? "text-cyan-300" : "text-blue-600"
            } opacity-0 transition-opacity group-hover:opacity-100`}
          >
            Get started <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </>
  );
}

export default function CreateHub() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900">Create a video</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-neutral-500">
          Pick what you want to make. AlphoGen guides you through the rest — the Director, sources,
          voices and rendering stay behind a simple flow.
        </p>
      </motion.div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool, i) => {
          const base =
            "group flex min-h-[260px] flex-col rounded-2xl border p-5 transition-all duration-200";
          const skin = tool.featured
            ? "border-neutral-900 bg-neutral-900 shadow-xl"
            : "border-neutral-200 bg-white shadow-sm";
          const interactive =
            tool.status === "live"
              ? "hover:-translate-y-1 hover:shadow-lg hover:border-blue-300"
              : "cursor-not-allowed opacity-60";

          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.06 + i * 0.05 }}
            >
              {tool.status === "live" && tool.href ? (
                <Link href={tool.href} className={`${base} ${skin} ${interactive}`}>
                  <CardInner tool={tool} />
                </Link>
              ) : (
                <div className={`${base} ${skin} ${interactive}`} aria-disabled>
                  <CardInner tool={tool} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
