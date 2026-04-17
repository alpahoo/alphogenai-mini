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
import { TemplatePicker } from "@/components/create/template-picker";
import { ReferenceUpload, buildReferencePayload } from "@/components/create/reference-upload";
import type { PromptTemplate } from "@/lib/prompt-templates";
import type { JobPlan, EngineKey, ReferenceItem } from "@/lib/types";
import { ENGINE_DISPLAY_NAMES } from "@/lib/types";

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
  const [selectedEngine, setSelectedEngine] = useState<EngineKey | "auto">("auto");
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, ReferenceItem>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const handleTemplateSelect = (template: PromptTemplate) => {
    setPrompt(template.prompt);
    if (template.duration && plan !== "free") {
      setDuration(String(template.duration));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Image too large (max 10MB)");
      return;
    }

    // Preview
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadedImageUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setImagePreview(null);
      setUploadedImageUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const clearImage = () => {
    setUploadedImageUrl(null);
    setImagePreview(null);
  };

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
          ...(uploadedImageUrl && { image_url: uploadedImageUrl }),
          ...(Object.keys(references).length > 0 && { references: buildReferencePayload(references) }),
          ...(selectedEngine !== "auto" && { preferred_engine: selectedEngine }),
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
                className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground"
              >
                <span>Describe your video</span>
                <button
                  type="button"
                  onClick={() => setShowTemplates(true)}
                  className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Sparkles className="h-3 w-3" />
                  Templates
                </button>
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

            {/* ── Reference Image (I2V) ──────────────────────────── */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Reference image <span className="text-muted-foreground/50">(optional)</span>
              </p>
              {imagePreview ? (
                <div className="relative inline-block">
                  <img
                    src={imagePreview}
                    alt="Reference"
                    className="h-24 w-auto rounded-lg border border-border/40 object-cover"
                  />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive p-0.5 text-destructive-foreground hover:brightness-110"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className="flex h-20 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/40 bg-muted/10 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/20">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <span className="flex items-center gap-2">
                    <Film className="h-4 w-4" />
                    Drop an image or click to upload
                  </span>
                </label>
              )}
            </div>

            {/* ── Multi-Reference (V1) ──────────────────────────── */}
            <ReferenceUpload
              references={references}
              onChange={setReferences}
              locked={plan === "free"}
            />

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

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Model</p>
                    <div className="flex gap-2 flex-wrap">
                      {(
                        [
                          { key: "auto" as const, label: "Auto", desc: "Best for your plan" },
                          { key: "wan_i2v" as const, label: "Wan 2.2 I2V", desc: "GPU • up to 60s" },
                          { key: "seedance" as const, label: "Seedance 2.0", desc: "API • up to 15s", proOnly: true },
                        ] as const
                      ).map((opt) => {
                        const locked = opt.proOnly && plan === "free";
                        const active = selectedEngine === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            disabled={locked}
                            onClick={() => setSelectedEngine(opt.key)}
                            className={`relative rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all ${
                              active
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : locked
                                ? "border-border/20 bg-muted/10 text-muted-foreground/40 cursor-not-allowed"
                                : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                            }`}
                            title={locked ? "Pro/Premium only" : opt.desc}
                          >
                            <Cpu className="inline h-3 w-3 mr-1" />
                            {opt.label}
                            {locked && <Lock className="inline h-2.5 w-2.5 ml-1 opacity-50" />}
                          </button>
                        );
                      })}
                    </div>
                    {plan === "free" && (
                      <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                        Seedance requires <Link href="/pricing" className="text-primary hover:underline">Pro plan</Link>
                      </p>
                    )}
                  </div>
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
                <span className="font-medium text-foreground">{selectedEngine === "auto" ? "Auto" : ENGINE_DISPLAY_NAMES[selectedEngine] ?? selectedEngine}</span>
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

      {/* Prompt templates modal */}
      <TemplatePicker
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}
