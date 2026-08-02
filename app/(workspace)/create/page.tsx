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
  /** Beginner-recommended starting point — shortest path to a finished video. */
  recommended?: boolean;
  /** Optional secondary badge, e.g. "Low cost". */
  tag?: string;
}

const TOOLS: Tool[] = [
  {
    id: "headshot",
    title: "Professional Headshots",
    description: "Upload a few photos and receive four consistent professional portraits.",
    badge: "New",
    visual: "linear-gradient(135deg, #e9f1ff, #ffffff 52%, #e8dcff)",
    href: "/create/headshot",
    status: "live",
  },
  {
    id: "amazon",
    title: "Amazon Product Pack",
    description: "Upload product photos and receive a hero, lifestyle image, feature card, and close-up.",
    badge: "New",
    visual: "linear-gradient(135deg, #eefbf4, #ffffff 52%, #d9f3ff)",
    href: "/create/amazon",
    status: "live",
    recommended: true,
  },
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
    title: "Product Ad",
    description: "New here? Start with this. Paste your product URL — get a ready-to-post video ad with script, visuals and captions.",
    badge: "Product Ad",
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
    href: "/create/podcast",
    status: "live",
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

// Business-meaningful mini-illustration per flow — shows the *outcome*, not an
// abstract gradient. Pure inline SVG (no new deps), drawn over the card's soft
// tint so each card reads at a glance.
function CardVisual({ tool }: { tool: Tool }) {
  const common = "h-32 w-full rounded-2xl border border-white/50 shadow-inner overflow-hidden";
  switch (tool.id) {
    case "headshot":
      return <div className={common} style={{ background: tool.visual }}><div className="grid h-full grid-cols-4 gap-2 p-4">{["Studio", "Executive", "Natural", "Creative"].map((label, index) => <div key={label} className="flex flex-col items-center justify-end border border-blue-100 bg-white p-2 shadow-sm"><div className={`mb-2 h-10 w-10 rounded-full ${["bg-slate-200", "bg-blue-100", "bg-amber-100", "bg-violet-100"][index]}`} /><span className="text-[9px] font-bold text-slate-600">{label}</span></div>)}</div></div>;
    case "amazon":
      return (
        <div className={common} style={{ background: tool.visual }}>
          <div className="grid h-full grid-cols-2 gap-2 p-4">
            {["Hero", "Lifestyle", "Features", "Detail"].map((label, index) => (
              <div key={label} className="flex items-end border border-emerald-200 bg-white p-2 shadow-sm">
                <span className="text-[10px] font-bold text-slate-600">{index + 1}. {label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "story": // director clapperboard + scene frames (dark featured card)
      return (
        <div className={common} style={{ background: tool.visual }}>
          <svg viewBox="0 0 220 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(26 30) rotate(-6)">
              <rect x="0" y="14" width="92" height="60" rx="6" fill="#0c1322" stroke="#e7b66a" strokeWidth="2" />
              <rect x="0" y="0" width="92" height="18" rx="4" fill="#101a2e" stroke="#e7b66a" strokeWidth="2" />
              <path d="M4 18 L18 0 M26 18 L40 0 M48 18 L62 0 M70 18 L84 0" stroke="#e7b66a" strokeWidth="2.5" />
            </g>
            <g transform="translate(128 22)">
              <rect x="0" y="0" width="66" height="40" rx="5" fill="#1b2746" stroke="#5b76c4" strokeWidth="2" />
              <rect x="0" y="48" width="66" height="40" rx="5" fill="#1b2746" stroke="#5b76c4" strokeWidth="2" />
              <polygon points="26,12 26,28 40,20" fill="#9fd3ff" />
              <polygon points="26,60 26,76 40,68" fill="#9fd3ff" />
            </g>
          </svg>
        </div>
      );
    case "url": // web page -> video output
      return (
        <div className={common} style={{ background: tool.visual }}>
          <svg viewBox="0 0 220 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(18 26)">
              <rect x="0" y="0" width="84" height="76" rx="7" fill="#fff" stroke="#7aa7d8" strokeWidth="2" />
              <rect x="0" y="0" width="84" height="16" rx="7" fill="#e8f1fb" />
              <circle cx="10" cy="8" r="2.4" fill="#7aa7d8" /><circle cx="18" cy="8" r="2.4" fill="#bcd4ee" /><circle cx="26" cy="8" r="2.4" fill="#bcd4ee" />
              <rect x="10" y="26" width="34" height="30" rx="4" fill="#cfe6ff" />
              <rect x="50" y="26" width="24" height="6" rx="3" fill="#9fc2e8" />
              <rect x="50" y="38" width="24" height="6" rx="3" fill="#cfe0f2" />
              <rect x="10" y="62" width="64" height="6" rx="3" fill="#cfe0f2" />
            </g>
            <path d="M108 64 H134" stroke="#2f6fb0" strokeWidth="3" strokeLinecap="round" />
            <path d="M130 58 L138 64 L130 70 Z" fill="#2f6fb0" />
            <g transform="translate(146 30)">
              <rect x="0" y="0" width="60" height="68" rx="7" fill="#0e2238" stroke="#83e8ff" strokeWidth="2" />
              <circle cx="30" cy="34" r="16" fill="#0a3050" />
              <polygon points="25,26 25,42 39,34" fill="#83e8ff" />
            </g>
          </svg>
        </div>
      );
    case "avatar": // talking head + voice waveform + script lines
      return (
        <div className={common} style={{ background: tool.visual }}>
          <svg viewBox="0 0 220 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(24 22)">
              <rect x="0" y="0" width="78" height="84" rx="8" fill="#fff" stroke="#c79ad8" strokeWidth="2" />
              <circle cx="39" cy="32" r="16" fill="#f0d8f6" />
              <path d="M16 76 a23 18 0 0 1 46 0 Z" fill="#f0d8f6" />
            </g>
            <g transform="translate(118 40)">
              <rect x="0" y="18" width="4" height="10" rx="2" fill="#a86fc4" />
              <rect x="9" y="10" width="4" height="26" rx="2" fill="#a86fc4" />
              <rect x="18" y="2" width="4" height="42" rx="2" fill="#a86fc4" />
              <rect x="27" y="12" width="4" height="22" rx="2" fill="#a86fc4" />
              <rect x="36" y="18" width="4" height="10" rx="2" fill="#a86fc4" />
            </g>
            <g transform="translate(118 78)">
              <rect x="0" y="0" width="78" height="6" rx="3" fill="#d9c2e6" />
              <rect x="0" y="12" width="58" height="6" rx="3" fill="#e7d6ef" />
            </g>
          </svg>
        </div>
      );
    case "ugc": // phone with product + social engagement
      return (
        <div className={common} style={{ background: tool.visual }}>
          <svg viewBox="0 0 220 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(78 14)">
              <rect x="0" y="0" width="64" height="100" rx="12" fill="#fff" stroke="#74c79a" strokeWidth="2" />
              <rect x="8" y="10" width="48" height="48" rx="6" fill="#d8f5e6" />
              <rect x="20" y="22" width="24" height="24" rx="5" fill="#8fdcb4" />
              <rect x="8" y="66" width="34" height="6" rx="3" fill="#bfe8d2" />
              <rect x="8" y="78" width="24" height="6" rx="3" fill="#d8efe2" />
              <path d="M50 74 c-3-4-9-2-9 3 c0 4 9 9 9 9 c0 0 9-5 9-9 c0-5-6-7-9-3 Z" fill="#ff6f91" />
            </g>
          </svg>
        </div>
      );
    case "explainer": // slide with bullets + caption bar
      return (
        <div className={common} style={{ background: tool.visual }}>
          <svg viewBox="0 0 220 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(34 22)">
              <rect x="0" y="0" width="152" height="70" rx="8" fill="#fff" stroke="#7fb0d8" strokeWidth="2" />
              <rect x="14" y="14" width="48" height="42" rx="6" fill="#cfe6ff" />
              <circle cx="38" cy="30" r="9" fill="#8fc2ee" />
              <rect x="76" y="16" width="62" height="7" rx="3.5" fill="#9fc2e8" />
              <rect x="76" y="30" width="62" height="6" rx="3" fill="#cfe0f2" />
              <rect x="76" y="42" width="44" height="6" rx="3" fill="#cfe0f2" />
            </g>
            <g transform="translate(34 98)">
              <rect x="0" y="0" width="152" height="16" rx="6" fill="#0e2238" />
              <rect x="10" y="6" width="86" height="4" rx="2" fill="#83e8ff" />
            </g>
          </svg>
        </div>
      );
    case "podcast": // two mics / two speakers
      return (
        <div className={`${common} relative`} style={{ background: tool.visual }}>
          <svg viewBox="0 0 220 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            {[58, 138].map((cx, idx) => (
              <g key={idx} transform={`translate(${cx} 30)`}>
                <rect x="-9" y="0" width="18" height="34" rx="9" fill="#ffce7d" opacity="0.85" />
                <path d="M-16 30 a16 16 0 0 0 32 0" fill="none" stroke="#ffce7d" strokeWidth="2.5" opacity="0.85" />
                <line x1="0" y1="46" x2="0" y2="58" stroke="#ffce7d" strokeWidth="2.5" opacity="0.85" />
                <line x1="-10" y1="58" x2="10" y2="58" stroke="#ffce7d" strokeWidth="2.5" opacity="0.85" />
              </g>
            ))}
          </svg>
          {tool.status === "soon" && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
              Coming soon
            </span>
          )}
        </div>
      );
    default:
      return <div className={common} style={{ background: tool.visual }} />;
  }
}

function CardInner({ tool }: { tool: Tool }) {
  const featured = tool.featured;
  return (
    <>
      <CardVisual tool={tool} />
      <div className="mt-4 flex flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2">
          {tool.recommended && (
            <span className="inline-flex w-fit items-center rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white">
              Start here
            </span>
          )}
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
            : tool.recommended
              ? "border-emerald-300 bg-white shadow-sm ring-2 ring-emerald-400/40"
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
