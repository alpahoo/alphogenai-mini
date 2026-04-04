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
  Film,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SegmentedControl } from "@/components/create/segmented-control";
import { ComingSoonSection } from "@/components/create/coming-soon-section";
import type { JobPlan } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mode config
// ---------------------------------------------------------------------------
const MODE_CONFIG: Record<
  string,
  { title: string; subtitle: string; placeholder: string }
> = {
  story: {
    title: "Story Video",
    subtitle: "Describe a narrative scene. AI will bring it to life.",
    placeholder:
      "A lone astronaut discovers a glowing artifact on the surface of Mars at sunset...",
  },
  product: {
    title: "Product Video",
    subtitle: "Describe your product or concept for a short showcase.",
    placeholder:
      "A sleek wireless headphone floating in mid-air with soft studio lighting and particle effects...",
  },
  social: {
    title: "Social Clip",
    subtitle: "Create a punchy clip optimized for social platforms.",
    placeholder:
      "Satisfying top-down shot of colorful smoothie being poured into a glass with fresh fruits around it...",
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

  // Plan
  const [plan, setPlan] = useState<JobPlan>("free");
  const [planLoaded, setPlanLoaded] = useState(false);

  // Form
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        /* default free */
      } finally {
        setPlanLoaded(true);
      }
    }
    fetchPlan();
  }, []);

  const durationOptions = DURATION_OPTIONS.map((opt) => {
    const locked = plan === "free" && opt.value !== "5";
    return { ...opt, disabled: locked, locked, hint: locked ? "Upgrade to Pro" : undefined };
  });

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
        if (res.status === 429 && data.upgrade) setShowUpgrade(true);
        throw new Error(data.error || "Failed to create job");
      }
      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  // Scene count estimate
  const dur = parseInt(duration, 10);
  const sceneCount = plan === "free" ? 1 : Math.min(Math.ceil(dur / 5), 3);

  return (
    <div className="flex h-full">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Form                                        */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <Link
          href="/create"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl font-bold tracking-tight">{config.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {config.subtitle}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* ── Prompt ─────────────────────────────────────────── */}
            <div>
              <label
                htmlFor="prompt"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Describe your video
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={config.placeholder}
                className="h-28 w-full resize-none rounded-xl border border-border bg-background/50 p-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={loading}
                maxLength={500}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    disabled={loading}
                    className="rounded-md border border-border/40 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                  >
                    {ex.length > 35 ? ex.slice(0, 35) + "..." : ex}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Duration ───────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Duration</span>
                </div>
                {plan === "free" && (
                  <Link
                    href="/pricing"
                    className="flex items-center gap-1 text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
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
            </div>

            {/* ── Advanced ───────────────────────────────────────── */}
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Advanced settings
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
                />
              </button>

              {showAdvanced && (
                <div className="border-t border-border/40 px-4 py-4 space-y-5">
                  <ComingSoonSection label="Format">
                    <div className="flex gap-2">
                      {[
                        { icon: Monitor, label: "Landscape" },
                        { icon: Smartphone, label: "Portrait" },
                        { icon: Square, label: "Square" },
                      ].map((f) => (
                        <div
                          key={f.label}
                          className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1 text-[11px]"
                        >
                          <f.icon className="h-3 w-3" />
                          {f.label}
                        </div>
                      ))}
                    </div>
                  </ComingSoonSection>

                  <ComingSoonSection label="Captions">
                    <div className="flex gap-2">
                      {["None", "Auto"].map((v) => (
                        <div
                          key={v}
                          className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1 text-[11px]"
                        >
                          <Type className="h-3 w-3" />
                          {v}
                        </div>
                      ))}
                    </div>
                  </ComingSoonSection>

                  <ComingSoonSection label="Background music">
                    <div className="flex gap-2">
                      {["None", "Auto"].map((v) => (
                        <div
                          key={v}
                          className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1 text-[11px]"
                        >
                          <Music className="h-3 w-3" />
                          {v}
                        </div>
                      ))}
                    </div>
                  </ComingSoonSection>

                  <ComingSoonSection label="Model">
                    <div className="flex gap-2">
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium">
                        <Cpu className="inline h-3 w-3 mr-0.5" />
                        Wan 2.2 I2V
                      </div>
                      <div className="rounded-md border border-border/40 bg-muted/20 px-2.5 py-1 text-[11px]">
                        <Cpu className="inline h-3 w-3 mr-0.5" />
                        Seedance 2.0
                      </div>
                    </div>
                  </ComingSoonSection>
                </div>
              )}
            </div>

            {/* ── Error / Upgrade ────────────────────────────────── */}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
                {showUpgrade && (
                  <Link
                    href="/pricing"
                    className="mt-2 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            )}

            {/* ── Generate CTA ───────────────────────────────────── */}
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
          </form>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Preview / Info                             */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex w-80 flex-col border-l border-border/40 bg-muted/20 p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col h-full"
        >
          {/* Preview placeholder */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full aspect-video rounded-xl border border-dashed border-border/50 bg-card/50 flex flex-col items-center justify-center gap-2">
              <Film className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/40">
                Your video will appear here
              </p>
            </div>
          </div>

          {/* Info card */}
          <div className="mt-6 rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Generation details
            </h3>

            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Duration</span>
                <span className="font-medium text-foreground">{duration}s</span>
              </div>
              <div className="flex justify-between">
                <span>Scenes</span>
                <span className="font-medium text-foreground">
                  {sceneCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Model</span>
                <span className="font-medium text-foreground">Wan 2.2 I2V</span>
              </div>
              <div className="flex justify-between">
                <span>Plan</span>
                <span className="font-medium text-foreground capitalize">
                  {plan}
                </span>
              </div>
            </div>

            {plan === "free" && (
              <Link
                href="/pricing"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-2 text-[11px] font-semibold text-white transition-all hover:brightness-110"
              >
                <Crown className="h-3 w-3" />
                Upgrade for longer videos
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
