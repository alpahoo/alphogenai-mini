"use client";

// Guided URL entry.
// Product pages use the validated Product Ad pipeline and open the standard job
// result. Tutorial/news links keep the advanced Research handoff.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  FileText,
  Film,
  GraduationCap,
  Image as ImageIcon,
  Link2,
  Loader2,
  Newspaper,
  PlayCircle,
  Search,
  ShoppingBag,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type UrlMode = "product" | "tutorial" | "news";

// Simple intent choice. Each maps to a Research mode + a sensible auto-topic so the
// user only has to paste a URL. Duration defaults to 30s (kept off the first screen).
const MODES: Record<UrlMode, { label: string; desc: string; Icon: LucideIcon; topic: string; duration: number }> = {
  product: {
    label: "Product",
    desc: "Page → promo",
    Icon: ShoppingBag,
    topic:
      "Create a short product video from this page: a strong hook, the key benefits, and a clear call to action.",
    duration: 30,
  },
  tutorial: {
    label: "Tutorial",
    desc: "Docs → how-to",
    Icon: GraduationCap,
    topic:
      "Turn this page into a short tutorial: a quick intro, the key steps, limits, and a final action.",
    duration: 60,
  },
  news: {
    label: "News",
    desc: "Article → recap",
    Icon: Newspaper,
    topic:
      "Summarize this page as a short news explainer: what changed, why it matters, and what's next.",
    duration: 30,
  },
};

// Example sources — clicking one fills the URL field and picks a fitting intent.
const EXAMPLES: { label: string; hint: string; url: string; mode: UrlMode; visual: string }[] = [
  {
    label: "Product page",
    hint: "A landing/product page",
    url: "https://www.apple.com/airpods-pro/",
    mode: "product",
    visual: "linear-gradient(135deg, #eafff4, #fff 55%, #f7d8ff)",
  },
  {
    label: "Article",
    hint: "A blog post or news article",
    url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
    mode: "news",
    visual: "linear-gradient(135deg, #fff7db, #f9fbff 55%, #83e8ff)",
  },
  {
    label: "Docs page",
    hint: "Documentation or a guide",
    url: "https://nextjs.org/docs/app/getting-started",
    mode: "tutorial",
    visual: "linear-gradient(135deg, #f5f7ff, #fff 55%, #cdf4ff)",
  },
];

// Guided loading steps shown while the plan is being created. These mirror what
// the Research API does behind the scenes (one POST /api/research/jobs, then the
// plan opens) — purely informative so the wait feels guided, not a blank spinner.
const RESEARCH_LOADING_STEPS: { label: string; Icon: LucideIcon }[] = [
  { label: "Analyze URL", Icon: Search },
  { label: "Collect media", Icon: ImageIcon },
  { label: "Write script", Icon: FileText },
  { label: "Open plan", Icon: PlayCircle },
];

const PRODUCT_LOADING_STEPS: { label: string; Icon: LucideIcon }[] = [
  { label: "Analyze product", Icon: Search },
  { label: "Build ad", Icon: Sparkles },
  { label: "Start video render", Icon: Film },
  { label: "Open result", Icon: PlayCircle },
];

// Meaningful example thumbnail (a tiny page mock per source type) over the soft
// tint — replaces the abstract gradient so each example reads as what it is.
function ExampleThumb({ mode, visual }: { mode: UrlMode; visual: string }) {
  return (
    <div className="relative h-20 w-full" style={{ background: visual }}>
      <svg viewBox="0 0 200 80" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {mode === "product" && (
          <g transform="translate(36 10)">
            <rect x="0" y="0" width="128" height="60" rx="7" fill="#fff" stroke="#9ed8b8" strokeWidth="2" />
            <rect x="10" y="10" width="44" height="40" rx="5" fill="#d8f5e6" />
            <rect x="24" y="22" width="16" height="16" rx="4" fill="#8fdcb4" />
            <rect x="64" y="12" width="52" height="7" rx="3.5" fill="#a9d8c1" />
            <rect x="64" y="25" width="52" height="5" rx="2.5" fill="#d6ece1" />
            <rect x="64" y="40" width="34" height="10" rx="5" fill="#34c98a" />
          </g>
        )}
        {mode === "news" && (
          <g transform="translate(36 10)">
            <rect x="0" y="0" width="128" height="60" rx="7" fill="#fff" stroke="#9cc7ea" strokeWidth="2" />
            <rect x="12" y="10" width="80" height="8" rx="4" fill="#8fb8e0" />
            <rect x="12" y="24" width="104" height="5" rx="2.5" fill="#cfe0f2" />
            <rect x="12" y="34" width="104" height="5" rx="2.5" fill="#cfe0f2" />
            <rect x="12" y="44" width="72" height="5" rx="2.5" fill="#cfe0f2" />
          </g>
        )}
        {mode === "tutorial" && (
          <g transform="translate(36 10)">
            <rect x="0" y="0" width="128" height="60" rx="7" fill="#fff" stroke="#a8cdea" strokeWidth="2" />
            <rect x="0" y="0" width="38" height="60" rx="7" fill="#eef4fb" />
            <rect x="8" y="12" width="22" height="5" rx="2.5" fill="#bcd4ee" />
            <rect x="8" y="22" width="22" height="5" rx="2.5" fill="#d6e3f2" />
            <rect x="8" y="32" width="22" height="5" rx="2.5" fill="#d6e3f2" />
            <rect x="50" y="12" width="66" height="6" rx="3" fill="#9fc2e8" />
            <rect x="50" y="26" width="66" height="5" rx="2.5" fill="#cfe0f2" />
            <rect x="50" y="36" width="50" height="5" rx="2.5" fill="#cfe0f2" />
          </g>
        )}
      </svg>
    </div>
  );
}

function isValidHttpUrl(value: string) {
  return /^https?:\/\/\S+\.\S+/.test(value.trim());
}

export default function UrlToVideo() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<UrlMode>("product");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = mode === "product" ? PRODUCT_LOADING_STEPS : RESEARCH_LOADING_STEPS;

  // Advance the guided loading steps while the plan is being created. The real
  // work is a single POST then a navigation, so we pace the first steps and let
  // createVideo() jump to the final "Open plan" step right before it routes.
  useEffect(() => {
    if (!creating) {
      setLoadingStep(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingStep((s) => (s < 2 ? s + 1 : s));
    }, 850);
    return () => clearInterval(id);
  }, [creating]);

  function tryExample(example?: (typeof EXAMPLES)[number]) {
    const pick = example ?? EXAMPLES[0];
    setUrl(pick.url);
    setMode(pick.mode);
    setError(null);
  }

  async function createVideo() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError("Paste a URL to continue, or upload product media manually.");
      return;
    }
    if (!isValidHttpUrl(cleanUrl)) {
      setError("Enter a valid link starting with http:// or https://");
      return;
    }

    setCreating(true);
    setStatus(mode === "product" ? "Creating your product ad…" : "Creating your video plan…");
    setError(null);
    let navigating = false;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login");
        return;
      }

      if (mode === "product") {
        const res = await fetch("/api/admin/experiments/url-to-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "submit",
            url: cleanUrl,
            style: "Discovery",
            format: "portrait",
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error("Product Ad generation is currently available in the private beta.");
          }
          if (res.status === 429) {
            throw new Error("The Product Ad beta reached its daily generation limit. Try again tomorrow.");
          }
          throw new Error("Could not start your Product Ad. Please try again.");
        }

        setStatus("Opening your video result…");
        setLoadingStep(3);
        navigating = true;
        router.push(`/jobs/${json.jobId}`);
        return;
      }

      const meta = MODES[mode];
      const res = await fetch("/api/research/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          topic: meta.topic,
          input_url: cleanUrl,
          mode,
          language: "en-US",
          target_duration_seconds: meta.duration,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not start your video.");

      setStatus("Opening your video plan…");
      setLoadingStep(3);
      navigating = true;
      router.push(`/research/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start your video.");
      setStatus(null);
    } finally {
      if (!navigating) setCreating(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
          <Link2 className="h-3.5 w-3.5" />
          URL to Video
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
          {mode === "product" ? "Turn a product page into an ad" : "Turn any link into a video"}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-neutral-500">
          {mode === "product"
            ? "Paste a product URL. AlphoGen turns it into a finished vertical video ad."
            : "Paste an article or docs link. AlphoGen researches it and builds a ready-to-edit video plan."}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="mt-8 w-full"
      >
        {/* Intent chips */}
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          {(Object.keys(MODES) as UrlMode[]).map((key) => {
            const meta = MODES[key];
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={active}
                title={meta.desc}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                <meta.Icon className="h-4 w-4" />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* URL field + primary CTA */}
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 px-3">
            <Link2 className="h-5 w-5 shrink-0 text-neutral-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) createVideo();
              }}
              placeholder="https://your-product-page.com"
              inputMode="url"
              autoFocus
              className="w-full bg-transparent py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>
          <button
            onClick={createVideo}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-80"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? "Working…" : mode === "product" ? "Create product ad" : "Create video"}
          </button>
        </div>

        {/* Try example + manual upload */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            onClick={() => tryExample()}
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            Try example
          </button>
          <span className="text-neutral-300">·</span>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="font-semibold text-neutral-600 hover:text-neutral-900"
          >
            No URL? Upload product media manually
          </button>
        </div>

        {error && (
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
            {error}
          </p>
        )}
        {status && (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-900" />
            {status}
          </div>
        )}
      </motion.div>

      {/* Example thumbnails */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.14 }}
        className="mt-10 w-full"
      >
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          Or start from an example
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => tryExample(ex)}
              className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <ExampleThumb mode={ex.mode} visual={ex.visual} />
              <div className="p-3">
                <p className="text-sm font-semibold text-neutral-900">{ex.label}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{ex.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Advanced escape hatch */}
      <div className="mt-10 flex items-center gap-1.5 text-xs text-neutral-400">
        <Film className="h-3.5 w-3.5" />
        Need sources, watchlists, or fine control?
        <Link href="/research" className="font-semibold text-neutral-600 hover:text-neutral-900">
          Open Research Studio
        </Link>
      </div>

      {/* Manual upload modal — routes to the existing Product / UGC studio (real media upload). */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upload product media"
          onClick={() => setUploadOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-neutral-100 p-2">
                  <Upload className="h-5 w-5 text-neutral-700" />
                </span>
                <h2 className="text-lg font-bold text-neutral-900">Upload product media</h2>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-500">
              No URL? Build from your own media instead. The Product / UGC studio lets you upload
              product photos and clips, then guides you to a finished video.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <Link
                href="/create/product"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Open Product studio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided loading overlay for the selected workflow. */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Creating your video plan"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
          >
            <p className="text-center text-sm font-bold text-neutral-900">
              {mode === "product" ? "Creating your product ad" : "Building your video plan"}
            </p>
            <p className="mt-1 text-center text-xs text-neutral-500">
              {mode === "product"
                ? "We are turning the product page into a finished vertical ad."
                : "This usually takes a few seconds."}
            </p>
            <ol className="mt-5 space-y-2.5">
              {loadingSteps.map((step, i) => {
                const done = i < loadingStep;
                const active = i === loadingStep;
                return (
                  <li
                    key={step.label}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      active
                        ? "border-blue-300 bg-blue-50"
                        : done
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-neutral-200 bg-white"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        done
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "bg-blue-600 text-white"
                            : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      {done ? (
                        <Check className="h-4 w-4" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <step.Icon className="h-4 w-4" />
                      )}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        active ? "text-blue-800" : done ? "text-emerald-700" : "text-neutral-500"
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        </div>
      )}
    </div>
  );
}
