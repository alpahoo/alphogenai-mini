"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";

const EXAMPLE_PROMPTS = [
  "A creator introduces a skincare product in a bright apartment, natural handheld camera.",
  "A cinematic night scene in Paris with a father protecting his children.",
  "A product demo showing texture, packaging, and a close-up result shot.",
  "A fashion creator shows a jacket in three social-ready scenes.",
];

export default function GeneratePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgraded, setUpgraded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      setUpgraded(true);
      window.history.replaceState({}, "", "/generate");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Prompt must be at least 3 characters");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.upgrade) {
          setShowUpgrade(true);
        }
        throw new Error(data.error || "Failed to create job");
      }

      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <Link
            href="/create/story"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Open Director
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-700">
            <Wand2 className="h-4 w-4 text-[#5f5bf6]" />
            Quick generation
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[0.96] tracking-tight sm:text-6xl">
            Start fast, or move into the full Director Console.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-neutral-600">
            This quick path still creates a job directly. For references,
            scenes, UGC, and readiness scoring, use the full create workspace.
          </p>
          <div className="mt-8 rounded-[28px] bg-neutral-950 p-6 text-white">
            <Clapperboard className="h-7 w-7 text-[#baff3b]" />
            <p className="mt-5 text-2xl font-semibold">
              Director Console is the recommended workflow.
            </p>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Plan scenes, attach assets, review readiness, then generate with
              more control.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm sm:p-8"
        >
          <label
            htmlFor="prompt"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500"
          >
            Production brief
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video you want to create..."
            className="mt-4 h-48 w-full resize-none rounded-[24px] border border-black/10 bg-[#f8f7f3] p-5 text-base leading-7 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
            disabled={loading}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                disabled={loading}
                className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-600 transition hover:border-neutral-950 hover:text-neutral-950 disabled:opacity-50"
              >
                {example.length > 52 ? `${example.slice(0, 52)}...` : example}
              </button>
            ))}
          </div>

          {upgraded && (
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
              <Sparkles className="h-4 w-4" />
              Welcome to Pro. Longer multi-scene workflows are available.
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
              {showUpgrade && (
                <Link
                  href="/pricing"
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  <Sparkles className="h-4 w-4" />
                  View plans
                </Link>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 py-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating job
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate now
                </>
              )}
            </button>
            <Link
              href="/create/story"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-6 py-4 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100"
            >
              Director Console
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
