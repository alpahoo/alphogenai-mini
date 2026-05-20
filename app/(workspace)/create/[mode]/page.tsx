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
  Mic,
  Volume2,
  Cpu,
  Film,
  Crown,
  Link2,
  ShoppingBag,
  Share2,
  ImagePlus,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SegmentedControl } from "@/components/create/segmented-control";
import { TemplatePicker } from "@/components/create/template-picker";
import { ReferenceUpload, buildReferencePayload } from "@/components/create/reference-upload";
import type { PromptTemplate } from "@/lib/prompt-templates";
import type { JobPlan, EngineKey, ReferenceItem } from "@/lib/types";
import { ENGINE_DISPLAY_NAMES, PLAN_MAX_DURATION, PLAN_MAX_SCENES } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mode config
// ---------------------------------------------------------------------------
const MODE_CONFIG: Record<
  string,
  { title: string; subtitle: string; placeholder: string; icon: typeof Film; iconBg: string; accentColor: string }
> = {
  story: {
    title: "Story Video",
    subtitle: "Describe a narrative scene. AI will bring it to life.",
    placeholder:
      "A lone astronaut discovers a glowing artifact on the surface of Mars at sunset...",
    icon: Film,
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    accentColor: "blue",
  },
  product: {
    title: "Product Video",
    subtitle: "Describe your product or concept for a short showcase.",
    placeholder:
      "A sleek wireless headphone floating in mid-air with soft studio lighting and particle effects...",
    icon: ShoppingBag,
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    accentColor: "emerald",
  },
  social: {
    title: "Social Clip",
    subtitle: "Create a punchy clip optimized for social platforms.",
    placeholder:
      "Satisfying top-down shot of colorful smoothie being poured into a glass with fresh fruits around it...",
    icon: Share2,
    iconBg: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    accentColor: "pink",
  },
};

const DURATION_OPTIONS = [
  { value: "5", label: "5s" },
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "120", label: "120s" },
];

const EXAMPLE_PROMPTS = [
  "A rocket launching into a starry night sky with smoke trails",
  "Ocean waves crashing on a tropical beach at sunset",
  "A futuristic city with flying cars and neon lights",
];

// ---------------------------------------------------------------------------
// Engine option type (from GET /api/engines)
// ---------------------------------------------------------------------------
interface EngineOption {
  key: string;
  label: string;
  desc: string;
  gate: "pro" | "premium" | null;
  supportsRefs: boolean;
  supportsI2v: boolean;
  maxDuration: number;
  minDuration: number | null;
  quality: string;
}

/** Hardcoded fallback if /api/engines fails or hasn't loaded yet. */
const FALLBACK_ENGINES: EngineOption[] = [
  { key: "wan_i2v",        label: "Wan 2.2 I2V",       desc: "GPU - up to 60s",                    gate: null,      supportsRefs: false, supportsI2v: true,  maxDuration: 60, minDuration: null, quality: "720p" },
  { key: "evolink",        label: "Seedance 2.0",      desc: "EvoLink - 720p - up to 15s",         gate: "pro",     supportsRefs: true,  supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "720p" },
  { key: "evolink_fast",   label: "Seedance 2.0 Fast", desc: "EvoLink - 720p - faster",            gate: "pro",     supportsRefs: true,  supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "720p" },
  { key: "wan_26",         label: "WAN 2.6",           desc: "EvoLink - 720p - no cold start",     gate: "pro",     supportsRefs: false, supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "720p" },
  { key: "wan_27",         label: "WAN 2.7",           desc: "EvoLink - 720p - latest WAN",        gate: "pro",     supportsRefs: false, supportsI2v: true,  maxDuration: 10, minDuration: null, quality: "720p" },
  { key: "kling_o3",       label: "Kling O3",          desc: "EvoLink - 1080p - up to 15s",        gate: "pro",     supportsRefs: true,  supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "1080p" },
  { key: "kling_v3",       label: "Kling 3.0",         desc: "EvoLink - 1080p - latest Kling",     gate: "pro",     supportsRefs: false, supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "1080p" },
  { key: "wan_26_bailian", label: "WAN 2.6 (Bailian)", desc: "Bailian Direct · 1080p · up to 15s",  gate: "pro",     supportsRefs: true,  supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "1080p" },
  { key: "happy_horse_10", label: "Happy Horse 1.0",   desc: "EvoLink - 720p - cinematic quality",  gate: "premium", supportsRefs: false, supportsI2v: true,  maxDuration: 15, minDuration: null, quality: "720p" },
  { key: "hailuo",         label: "Hailuo 2.3",        desc: "EvoLink - 1080p - 6-10s",            gate: "pro",     supportsRefs: false, supportsI2v: true,  maxDuration: 10, minDuration: 6,    quality: "1080p" },
  { key: "hailuo_fast",    label: "Hailuo 2.3 Fast",   desc: "EvoLink - 1080p - faster",           gate: "pro",     supportsRefs: false, supportsI2v: true,  maxDuration: 10, minDuration: 6,    quality: "1080p" },
  { key: "sora_2",         label: "Sora 2 Pro",        desc: "EvoLink - 1080p - up to 12s",        gate: "premium", supportsRefs: false, supportsI2v: false, maxDuration: 12, minDuration: null, quality: "1080p" },
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
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Format & captions
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [captionMode, setCaptionMode] = useState<"none" | "auto">("none");

  // Audio options
  const [audioMode, setAudioMode] = useState<"none" | "auto" | "custom">("auto");
  const [audioPrompt, setAudioPrompt] = useState("");
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");

  // Dynamic engine list (fetched from /api/engines, fallback to hardcoded)
  const [engineOptions, setEngineOptions] = useState<EngineOption[]>(FALLBACK_ENGINES);
  // Health status per engine: rate 0.0-1.0, -1 = unknown
  const [engineHealth, setEngineHealth] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/engines")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (Array.isArray(data.engines) && data.engines.length > 0) {
          setEngineOptions(data.engines);
        }
      })
      .catch(() => {
        /* keep fallback — silent fail */
      });

    // Fetch health data (non-blocking, best-effort)
    fetch("/api/engines/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Record<string, { rate: number }>) => {
        const rates: Record<string, number> = {};
        for (const [k, v] of Object.entries(data)) rates[k] = v.rate;
        setEngineHealth(rates);
      })
      .catch(() => { /* silent */ });
  }, []);
  const [showTemplates, setShowTemplates] = useState(false);
  // Multi-scene continuity: when ON, scene N+1 starts from the last frame
  // of scene N so characters & composition stay consistent across cuts.
  // Default ON; user can opt out in Advanced settings.
  const [multiSceneChain, setMultiSceneChain] = useState(true);

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
      if (!res.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Upload server error — please retry.");
      }
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

  // Loading elapsed timer — visual feedback while waiting for job creation + redirect
  useEffect(() => {
    if (!loading) { setLoadingElapsed(0); return; }
    const t = setInterval(() => setLoadingElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const planMaxDuration = PLAN_MAX_DURATION[plan] ?? 5;
  const durationOptions = DURATION_OPTIONS.map((opt) => {
    const dur = parseInt(opt.value, 10);
    const locked = dur > planMaxDuration;
    const hint = locked
      ? plan === "free"
        ? "Upgrade to Pro"
        : plan === "pro"
          ? "Upgrade to Premium"
          : undefined
      : undefined;
    return { ...opt, disabled: locked, locked, hint };
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
          audio_mode: audioMode,
          ...(audioMode === "custom" && audioPrompt.trim() && { audio_prompt: audioPrompt.trim() }),
          ...(voiceoverEnabled && voiceoverText.trim() && { voiceover_text: voiceoverText.trim() }),
          aspect_ratio: aspectRatio,
          caption_mode: captionMode,
          // Only send when explicitly disabled — backend defaults to ON
          ...(multiSceneChain === false && { multi_scene_chain: false }),
        }),
      });

      // Guard against non-JSON responses (Vercel error pages, timeouts, etc.)
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          res.status >= 500
            ? "Server error — please try again in a few seconds."
            : `Unexpected response (${res.status}). Please refresh and retry.`
        );
      }

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

  // Scene count estimate — matches backend logic in lib/storyboard.ts
  const dur = Math.min(parseInt(duration, 10), planMaxDuration);
  const planMaxScenes = PLAN_MAX_SCENES[plan] ?? 1;
  const sceneCount = plan === "free" ? 1 : Math.min(Math.ceil(dur / 5), planMaxScenes);

  // Loading overlay steps — shows progress while waiting for job creation + redirect
  const loadingSteps = [
    { label: "Validating prompt…", threshold: 0 },
    { label: "Building storyboard…", threshold: 3 },
    { label: `Splitting into ${sceneCount} scene${sceneCount > 1 ? "s" : ""}…`, threshold: 6 },
    { label: "Starting generation pipeline…", threshold: 10 },
    { label: "Redirecting to your project…", threshold: 15 },
  ];
  const currentLoadingStep = loadingSteps.reduce((acc, step) =>
    loadingElapsed >= step.threshold ? step : acc
  , loadingSteps[0]);
  // Smooth progress: 0-90% over ~30s, never reaches 100% until redirect
  const loadingProgress = Math.min(90, (loadingElapsed / 30) * 90);

  return (
    <div className="flex h-full relative">
      {/* ── Full-page loading overlay ─────────────────────────────── */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-6 max-w-sm w-full px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-1">Creating your video</h2>
              <p className="text-sm text-muted-foreground">{currentLoadingStep.label}</p>
            </div>
            {/* Progress bar */}
            <div className="w-full">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: `${loadingProgress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>{Math.round(loadingProgress)}%</span>
                <span className="tabular-nums">{loadingElapsed}s</span>
              </div>
            </div>
            {/* Steps indicator */}
            <div className="w-full space-y-1.5">
              {loadingSteps.map((step, i) => {
                const done = loadingElapsed >= (loadingSteps[i + 1]?.threshold ?? Infinity);
                const active = step === currentLoadingStep;
                return (
                  <div key={i} className={`flex items-center gap-2 text-xs transition-colors ${done ? "text-green-500" : active ? "text-foreground font-medium" : "text-muted-foreground/40"}`}>
                    {done ? (
                      <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-border/40" />
                    )}
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Form                                        */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <Link
          href="/create"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${config.iconBg}`}>
              <config.icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{config.title}</h1>
              <p className="mt-0.5 text-base text-muted-foreground">
                {config.subtitle}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {/* ── Prompt ─────────────────────────────────────────── */}
            <div>
              <label
                htmlFor="prompt"
                className="mb-2 flex items-center justify-between text-sm font-semibold text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Describe your video
                </span>
                <button
                  type="button"
                  onClick={() => setShowTemplates(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Templates
                </button>
              </label>
              <div className="relative">
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={config.placeholder}
                  className="h-36 w-full resize-none rounded-xl border border-border bg-card p-4 pb-8 text-base text-foreground shadow-sm placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  disabled={loading}
                  maxLength={2000}
                />
                <span className={`absolute bottom-2.5 right-3 text-xs tabular-nums ${prompt.length > 1800 ? "text-amber-500 font-medium" : "text-muted-foreground/40"}`}>
                  {prompt.length}/2000
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    disabled={loading}
                    className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-40"
                  >
                    {ex.length > 40 ? ex.slice(0, 40) + "..." : ex}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Reference Image (I2V) ──────────────────────────── */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-violet-500" />
                Reference image <span className="text-muted-foreground/50 font-normal text-xs">(optional)</span>
              </p>
              {imagePreview ? (
                <div className="relative inline-block">
                  <img
                    src={imagePreview}
                    alt="Reference"
                    className="h-28 w-auto rounded-xl border border-border/40 object-cover shadow-sm"
                  />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:brightness-110"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className="flex h-24 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border/50 bg-card/50 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <span className="flex items-center gap-2.5">
                    <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
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
              engineSupportsRefs={selectedEngine === "auto" || engineOptions.some((e) => e.key === selectedEngine && e.supportsRefs)}
            />

            {/* ── Duration ───────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-foreground">Duration</span>
                </div>
                {plan !== "premium" && (
                  <Link
                    href="/pricing"
                    className="flex items-center gap-1.5 text-xs font-medium text-primary/80 transition-colors hover:text-primary"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {plan === "free" ? "Unlock longer videos" : "Get up to 120s"}
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
              {plan !== "free" && (
                <p className="text-xs text-muted-foreground/60 mt-2">
                  Your {plan} plan supports up to {planMaxDuration}s ({Math.min(Math.ceil(planMaxDuration / 5), planMaxScenes)} scenes of 5s each).
                </p>
              )}
            </div>

            {/* ── Advanced ───────────────────────────────────────── */}
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/30"
              >
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground/60" />
                  Advanced settings
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
                />
              </button>

              {showAdvanced && (
                <div className="border-t border-border/40 px-5 py-5 space-y-5">
                  {/* Format (aspect ratio) */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-blue-500" />
                      Format
                    </p>
                    <div className="flex gap-2">
                      {(
                        [
                          { value: "16:9" as const, icon: Monitor, label: "Landscape", desc: "16:9 — YouTube, desktop" },
                          { value: "9:16" as const, icon: Smartphone, label: "Portrait", desc: "9:16 — TikTok, Reels, Shorts" },
                          { value: "1:1" as const, icon: Square, label: "Square", desc: "1:1 — Instagram, feed" },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setAspectRatio(f.value)}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            aspectRatio === f.value
                              ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                              : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                          }`}
                          title={f.desc}
                        >
                          <f.icon className="h-4 w-4" />
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                      {aspectRatio === "16:9" && "Best for YouTube and desktop viewing."}
                      {aspectRatio === "9:16" && "Optimized for TikTok, Instagram Reels and YouTube Shorts."}
                      {aspectRatio === "1:1" && "Ideal for Instagram feed posts and social media ads."}
                    </p>
                  </div>

                  {/* Captions */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
                      <Type className="h-4 w-4 text-orange-500" />
                      Captions
                    </p>
                    <div className="flex gap-2">
                      {(
                        [
                          { value: "none" as const, label: "None", desc: "No captions" },
                          { value: "auto" as const, label: "Auto", desc: "AI-generated subtitles from audio or prompt" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCaptionMode(opt.value)}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            captionMode === opt.value
                              ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                              : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                          }`}
                          title={opt.desc}
                        >
                          <Type className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {captionMode === "auto" && (
                      <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                        Subtitles will be burned into the video based on your voiceover or prompt text.
                      </p>
                    )}
                  </div>

                  {/* Background music / audio */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-emerald-500" />
                      Background Audio
                    </p>
                    <div className="flex gap-2 mb-2">
                      {(
                        [
                          { value: "none" as const, label: "None", desc: "No background audio" },
                          { value: "auto" as const, label: "Auto", desc: "AI-generated ambience matching your video" },
                          { value: "custom" as const, label: "Custom", desc: "Describe the audio you want" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAudioMode(opt.value)}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            audioMode === opt.value
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                              : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                          }`}
                          title={opt.desc}
                        >
                          <Music className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {audioMode === "custom" && (
                      <input
                        type="text"
                        value={audioPrompt}
                        onChange={(e) => setAudioPrompt(e.target.value)}
                        placeholder="e.g. calm piano music, epic orchestral, nature sounds..."
                        maxLength={200}
                        className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 mt-1"
                      />
                    )}
                  </div>

                  {/* Voice-over */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Mic className="h-4 w-4 text-sky-500" />
                        Voice-over
                      </p>
                      <button
                        type="button"
                        onClick={() => setVoiceoverEnabled(!voiceoverEnabled)}
                        className={`relative h-5 w-9 rounded-full transition-colors ${
                          voiceoverEnabled ? "bg-sky-500" : "bg-muted-foreground/30"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            voiceoverEnabled ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </div>
                    {voiceoverEnabled && (
                      <textarea
                        value={voiceoverText}
                        onChange={(e) => setVoiceoverText(e.target.value)}
                        placeholder="Enter the narration text for your video... (AI will generate the voice)"
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30 resize-none"
                      />
                    )}
                    {!voiceoverEnabled && (
                      <p className="text-[11px] text-muted-foreground/50">
                        Add AI-generated narration to your video. Requires Pro plan.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-indigo-500" />
                      Model
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {/* Auto option (always first) */}
                      <button
                        type="button"
                        onClick={() => setSelectedEngine("auto")}
                        className={`relative rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all ${
                          selectedEngine === "auto"
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                        }`}
                        title="Best model for your plan"
                      >
                        <Cpu className="inline h-3 w-3 mr-1" />
                        Auto
                      </button>
                      {/* Dynamic engine list from /api/engines (with fallback) */}
                      {engineOptions.map((opt) => {
                        const locked =
                          (opt.gate === "premium" && plan !== "premium") ||
                          (opt.gate === "pro" && plan === "free");
                        const active = selectedEngine === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            disabled={locked}
                            onClick={() => setSelectedEngine(opt.key as EngineKey)}
                            className={`relative rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all ${
                              active
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : locked
                                ? "border-border/20 bg-muted/10 text-muted-foreground/40 cursor-not-allowed"
                                : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                            }`}
                            title={
                              locked
                                ? `${opt.gate === "premium" ? "Premium" : "Pro"} only`
                                : opt.supportsRefs
                                ? `${opt.desc} · Supports character references`
                                : `${opt.desc} · Character references not supported`
                            }
                          >
                            <Cpu className="inline h-3 w-3 mr-1" />
                            {opt.label}
                            {opt.quality === "1080p" && !locked && (
                              <span className="ml-1 inline-flex rounded-sm bg-blue-500/15 px-1 py-px text-[8px] font-semibold text-blue-400 leading-tight align-middle">
                                HD
                              </span>
                            )}
                            {!locked && opt.supportsRefs && (
                              <span className="ml-1 inline-flex rounded-sm bg-emerald-500/15 px-1 py-px text-[8px] font-semibold text-emerald-400 leading-tight align-middle">
                                Refs
                              </span>
                            )}
                            {/* Health badge: green = >90%, yellow = >60%, red = <=60% */}
                            {!locked && engineHealth[opt.key] !== undefined && engineHealth[opt.key] !== -1 && (
                              <span
                                className={`ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                                  engineHealth[opt.key] >= 0.9
                                    ? "bg-green-400"
                                    : engineHealth[opt.key] >= 0.6
                                      ? "bg-amber-400"
                                      : "bg-red-400"
                                }`}
                                title={`${Math.round(engineHealth[opt.key] * 100)}% success rate (24h)`}
                              />
                            )}
                            {locked && <Lock className="inline h-2.5 w-2.5 ml-1 opacity-50" />}
                          </button>
                        );
                      })}
                    </div>
                    {plan === "free" && (
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Advanced models require <Link href="/pricing" className="text-primary font-medium hover:underline">Pro or Premium</Link>
                      </p>
                    )}
                  </div>

                  {/* ── Multi-scene continuity ──────────────────────── */}
                  {/* Only matters when the storyboard has ≥2 scenes. For Pro      */}
                  {/* (3 scenes max) & Premium (5 scenes max), this chains each   */}
                  {/* scene from the previous one's last frame — characters stay   */}
                  {/* visually consistent across cuts.                            */}
                  {plan !== "free" && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-teal-500" />
                        Multi-scene continuity
                      </p>
                      <button
                        type="button"
                        onClick={() => setMultiSceneChain((v) => !v)}
                        className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-xs font-medium transition-all ${
                          multiSceneChain
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                        }`}
                        title={
                          multiSceneChain
                            ? "Each scene starts from the previous scene's last frame"
                            : "Scenes generated independently (may look visually disconnected)"
                        }
                      >
                        <span className="flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          Chain scenes from last frame
                        </span>
                        <span
                          className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${
                            multiSceneChain ? "bg-primary" : "bg-muted-foreground/30"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${
                              multiSceneChain ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Recommended for story videos. Disable for stylistically
                        diverse cuts or when using Sora 2 (no I2V).
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Error / Upgrade ────────────────────────────────── */}
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

            {/* ── Generate CTA ───────────────────────────────────── */}
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating video...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
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
            <div className="w-full aspect-video rounded-xl border border-dashed border-border/50 bg-card/50 flex flex-col items-center justify-center gap-3">
              <Film className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/40">
                Your video will appear here
              </p>
            </div>
          </div>

          {/* Info card */}
          <div className="mt-6 rounded-xl border border-border/40 bg-card p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Generation details
            </h3>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Duration
                </span>
                <span className="font-semibold text-foreground">{duration}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-500" />
                  Format
                </span>
                <span className="font-semibold text-foreground">
                  {aspectRatio === "16:9" ? "Landscape" : aspectRatio === "9:16" ? "Portrait" : "Square"} ({aspectRatio})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-violet-500" />
                  Scenes
                </span>
                <span className="font-semibold text-foreground">
                  {sceneCount}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-indigo-500" />
                  Model
                </span>
                <span className="font-semibold text-foreground">{selectedEngine === "auto" ? "Auto" : ENGINE_DISPLAY_NAMES[selectedEngine] ?? selectedEngine}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-purple-500" />
                  Plan
                </span>
                <span className="font-semibold text-foreground capitalize">
                  {plan}
                </span>
              </div>
            </div>

            {plan === "free" && (
              <Link
                href="/pricing"
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110"
              >
                <Crown className="h-4 w-4" />
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
