"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Wand2,
  Loader2,
  Sparkles,
  Lock,
  Clock,
  ChevronDown,
  Monitor,
  Smartphone,
  Square,
  Type,
  Music,
  Cpu,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SegmentedControl } from "@/components/create/segmented-control";
import { ComingSoonSection } from "@/components/create/coming-soon-section";
import type { JobPlan } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mode config
// ---------------------------------------------------------------------------
const MODE_CONFIG: Record<string, { title: string; subtitle: string; placeholder: string }> = {
  story: {
    title: "Story Video",
    subtitle: "Describe a narrative scene. AI will bring it to life.",
    placeholder: "A lone astronaut discovers a glowing artifact on the surface of Mars at sunset...",
  },
  product: {
    title: "Product Video",
    subtitle: "Describe your product or concept for a short showcase.",
    placeholder: "A sleek wireless headphone floating in mid-air with soft studio lighting and particle effects...",
  },
  social: {
    title: "Social Clip",
    subtitle: "Create a punchy clip optimized for social platforms.",
    placeholder: "Satisfying top-down shot of colorful smoothie being poured into a glass with fresh fruits around it...",
  },
};

const DURATION_OPTIONS = [
  { value: "5", label: "5s" },
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
];

const EXAMPLE_PROMPTS = [
  "A rocket launching into a starry night sky with smoke trails",
  "Ocean waves crashing on a tropical beach at sunset",
  "A futuristic city with flying cars and neon lights",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CreateModePage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode } = use(params);
  const router = useRouter();

  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.story;

  // User plan
  const [plan, setPlan] = useState<JobPlan>("free");
  const [planLoaded, setPlanLoaded] = useState(false);

  // Form state
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch user plan from profiles
  useEffect(() => {
    async function fetchPlan() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", user.id)
            .single();

          if (profile?.plan === "pro" || profile?.plan === "premium") {
            setPlan(profile.plan as JobPlan);
          }
        }
      } catch {
        // Default to free on error
      } finally {
        setPlanLoaded(true);
      }
    }
    fetchPlan();
  }, []);

  // Build duration options based on plan
  const durationOptions = DURATION_OPTIONS.map((opt) => {
    const isFree = plan === "free";
    const isLocked = isFree && opt.value !== "5";
    return {
      ...opt,
      disabled: isLocked,
      locked: isLocked,
      hint: isLocked ? "Upgrade to Pro" : undefined,
    };
  });

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Prompt must be at least 3 characters");
      return;
    }

    setError(null);
    setShowUpgrade(false);
    setLoading(true);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          target_duration_seconds: parseInt(duration, 10),
        }),
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
    <div className="min-h-screen px-4 py-12 relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl">
        <Link
          href="/create"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {config.title}
            </h1>
            <p className="mt-1 text-muted-foreground">{config.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ---------------------------------------------------------- */}
            {/* Section 1: Prompt */}
            {/* ---------------------------------------------------------- */}
            <div className="rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
              <label
                htmlFor="prompt"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                Describe your video
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={config.placeholder}
                className="h-32 w-full resize-none rounded-xl border border-border bg-background/50 p-4 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={loading}
                maxLength={500}
              />

              {/* Quick prompts */}
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    disabled={loading}
                    className="rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    {example.length > 40
                      ? example.slice(0, 40) + "..."
                      : example}
                  </button>
                ))}
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Section 2: Duration (main conversion lever) */}
            {/* ---------------------------------------------------------- */}
            <div className="rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Duration</span>
                </div>
                {plan === "free" && (
                  <Link
                    href="/pricing"
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <Lock className="h-3 w-3" />
                    Unlock longer videos
                  </Link>
                )}
              </div>
              {planLoaded && (
                <SegmentedControl
                  options={durationOptions}
                  value={duration}
                  onChange={setDuration}
                  className="w-full"
                />
              )}
              {plan === "free" && duration === "5" && (
                <p className="mt-2 text-xs text-muted-foreground/60">
                  Free plan: 5-second single-scene clip. Upgrade to Pro for up
                  to 60s multi-scene videos.
                </p>
              )}
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Section 3: Advanced settings (collapsed) */}
            {/* ---------------------------------------------------------- */}
            <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between p-6 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>Advanced settings</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    showAdvanced ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showAdvanced && (
                <div className="border-t border-border/50 p-6 space-y-6">
                  {/* Format — coming soon */}
                  <ComingSoonSection label="Format">
                    <div className="flex gap-3">
                      {[
                        { icon: Monitor, label: "Landscape" },
                        { icon: Smartphone, label: "Portrait" },
                        { icon: Square, label: "Square" },
                      ].map((f) => (
                        <div
                          key={f.label}
                          className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs"
                        >
                          <f.icon className="h-3 w-3" />
                          {f.label}
                        </div>
                      ))}
                    </div>
                  </ComingSoonSection>

                  {/* Captions — coming soon */}
                  <ComingSoonSection label="Captions">
                    <div className="flex gap-3">
                      {["None", "Auto"].map((v) => (
                        <div
                          key={v}
                          className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs"
                        >
                          <Type className="inline h-3 w-3 mr-1" />
                          {v}
                        </div>
                      ))}
                    </div>
                  </ComingSoonSection>

                  {/* Music — coming soon */}
                  <ComingSoonSection label="Background music">
                    <div className="flex gap-3">
                      {["None", "Auto"].map((v) => (
                        <div
                          key={v}
                          className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs"
                        >
                          <Music className="inline h-3 w-3 mr-1" />
                          {v}
                        </div>
                      ))}
                    </div>
                  </ComingSoonSection>

                  {/* Model — coming soon (partially) */}
                  <ComingSoonSection label="Model">
                    <div className="flex gap-3">
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium">
                        <Cpu className="inline h-3 w-3 mr-1" />
                        Wan 2.2 I2V
                      </div>
                      <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs">
                        <Cpu className="inline h-3 w-3 mr-1" />
                        Seedance 2.0
                      </div>
                    </div>
                  </ComingSoonSection>
                </div>
              )}
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Feedback banners */}
            {/* ---------------------------------------------------------- */}
            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
                {showUpgrade && (
                  <Link
                    href="/pricing"
                    className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
                  >
                    <Sparkles className="h-4 w-4" />
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            )}

            {/* ---------------------------------------------------------- */}
            {/* Generate CTA */}
            {/* ---------------------------------------------------------- */}
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating video...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate Video
                </>
              )}
            </button>

            {/* Plan badge */}
            {planLoaded && (
              <p className="text-center text-xs text-muted-foreground/60">
                {plan === "pro" ? (
                  <>
                    <Sparkles className="inline h-3 w-3 mr-1 text-primary" />
                    Pro plan — up to 60s, 3 scenes, unlimited generations
                  </>
                ) : (
                  <>
                    Free plan — 5s single clip, 1 per day.{" "}
                    <Link
                      href="/pricing"
                      className="text-primary hover:underline"
                    >
                      Upgrade
                    </Link>
                  </>
                )}
              </p>
            )}
          </form>
        </motion.div>
      </div>
    </div>
  );
}
