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
  User,
  X,
  Cpu,
  Film,
  Crown,
  Link2,
  ShoppingBag,
  Share2,
  ImagePlus,
  AlertTriangle,
  ExternalLink,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SegmentedControl } from "@/components/create/segmented-control";
import { estimateBytePlusCost, SEEDANCE_USD_PER_MTOKEN } from "@/lib/byteplus-cost";
import { TemplatePicker } from "@/components/create/template-picker";
import { ReferenceUpload, buildReferencePayload } from "@/components/create/reference-upload";
import { isAdminEmail } from "@/lib/flags";
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

interface HeyGenVoice {
  voiceId: string;
  name: string;
  language: string;
  gender: string;
  isCloned: boolean;
  previewUrl: string | null;
}

interface HeyGenAvatar {
  avatarId: string;
  name: string;
  gender: string;
  previewUrl: string | null;
}

interface BytePlusAsset {
  id: string;
  asset_id: string;
  group_id: string | null;
  name: string;
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
  // Scene count: "auto" = duration-based split, or a forced integer count.
  const [numScenes, setNumScenes] = useState<"auto" | number>("auto");
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

  // "Use my voice" — cloned HeyGen voice on the Story Video
  const [useMyVoice, setUseMyVoice] = useState(false);
  const [clonedVoices, setClonedVoices] = useState<HeyGenVoice[]>([]);
  const [clonedVoicesLoading, setClonedVoicesLoading] = useState(false);
  const [myVoiceId, setMyVoiceId] = useState("");
  const [voiceScript, setVoiceScript] = useState("");
  const [voiceMode, setVoiceMode] = useState<"lipsync" | "voiceover">("lipsync");
  const [voiceLipsyncMode, setVoiceLipsyncMode] = useState<"speed" | "precision">("speed");

  // HeyGen avatars (used when an Avatar Shots / Avatar IV model is selected —
  // billed on HeyGen credits, ~60x cheaper than EvoLink Seedance)
  const [heygenAvatars, setHeygenAvatars] = useState<HeyGenAvatar[]>([]);
  const [heygenAvatarsLoading, setHeygenAvatarsLoading] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");

  // True when a HeyGen avatar model is selected (needs an avatar + voice;
  // billed on HeyGen credits instead of EvoLink).
  const isHeyGenEngineSelected =
    selectedEngine === "heygen_avatar_iv" || selectedEngine === "heygen_avatar_shots";

  // BytePlus Seedance 2.0 supports reference-to-video (verified face assets).
  const isBytePlus2Selected =
    selectedEngine === "seedance2_byteplus" || selectedEngine === "seedance2_fast_byteplus";
  // BytePlus verified-face asset library
  const [byteplusAssets, setByteplusAssets] = useState<BytePlusAsset[]>([]);
  const [byteplusAssetsLoading, setByteplusAssetsLoading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [newAssetId, setNewAssetId] = useState("");
  const [newAssetName, setNewAssetName] = useState("");

  // Dynamic engine list (fetched from /api/engines, fallback to hardcoded)
  const [engineOptions, setEngineOptions] = useState<EngineOption[]>(FALLBACK_ENGINES);
  // Health status per engine: rate 0.0-1.0, -1 = unknown
  const [engineHealth, setEngineHealth] = useState<Record<string, number>>({});
  // Admin: email + provider credit balance + per-engine costs
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [adminCredits, setAdminCredits] = useState<{ remaining: number; status: string } | null>(null);
  const [engineCosts, setEngineCosts] = useState<Record<string, number>>({});

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

    // Get user email for admin check
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setUserEmail(user.email);
        // Admin: fetch credit balance
        if (isAdminEmail(user.email)) {
          fetch("/api/admin/credits")
            .then((r) => r.json())
            .then((data) => {
              const ev = data.providers?.evolink;
              if (ev && typeof ev.remaining === "number") {
                setAdminCredits({ remaining: ev.remaining, status: ev.status });
              }
              if (data.engineCosts) {
                setEngineCosts(data.engineCosts);
              }
            })
            .catch(() => {});
        }
      }
    });
  }, []);
  const [showTemplates, setShowTemplates] = useState(false);
  // Multi-scene continuity: when ON, scene N+1 starts from the last frame
  // of scene N so characters & composition stay consistent across cuts.
  // Default ON; user can opt out in Advanced settings.
  const [multiSceneChain, setMultiSceneChain] = useState(true);
  // Scene chaining strategy when continuity is ON:
  //  "continuity" → fluid motion, but image quality decays scene after scene
  //  "anchor"     → every scene re-anchors to scene 1's clean frame (stable quality)
  const [chainStrategy, setChainStrategy] = useState<"continuity" | "anchor">("continuity");

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

  // Lazy-load the user's HeyGen avatars + cloned voices the first time they're
  // needed ("Use my voice" enabled, or a HeyGen avatar model selected).
  useEffect(() => {
    const needed = useMyVoice || isHeyGenEngineSelected;
    if (!needed) return;
    if (clonedVoices.length > 0 || heygenAvatars.length > 0) return;
    if (clonedVoicesLoading || heygenAvatarsLoading) return;
    setClonedVoicesLoading(true);
    setHeygenAvatarsLoading(true);
    fetch("/api/heygen")
      .then((r) => r.json())
      .then((data) => {
        const voices: HeyGenVoice[] = Array.isArray(data.voices) ? data.voices : [];
        const cloned = voices.filter((v) => v.isCloned);
        setClonedVoices(cloned);
        if (cloned.length > 0 && !myVoiceId) setMyVoiceId(cloned[0].voiceId);
        const avatars: HeyGenAvatar[] = Array.isArray(data.avatars) ? data.avatars : [];
        setHeygenAvatars(avatars);
      })
      .catch(() => {})
      .finally(() => {
        setClonedVoicesLoading(false);
        setHeygenAvatarsLoading(false);
      });
  }, [
    useMyVoice,
    isHeyGenEngineSelected,
    clonedVoices.length,
    heygenAvatars.length,
    clonedVoicesLoading,
    heygenAvatarsLoading,
    myVoiceId,
  ]);

  // HeyGen avatar models require a voice (else the model invents speech) —
  // auto-enable "Use my voice" when one is selected.
  useEffect(() => {
    if (isHeyGenEngineSelected && !useMyVoice) setUseMyVoice(true);
  }, [isHeyGenEngineSelected, useMyVoice]);

  // Lazy-load the user's verified BytePlus face assets when a 2.0 engine is on.
  const loadByteplusAssets = () => {
    setByteplusAssetsLoading(true);
    fetch("/api/byteplus-assets")
      .then((r) => r.json())
      .then((data) => setByteplusAssets(Array.isArray(data.assets) ? data.assets : []))
      .catch(() => {})
      .finally(() => setByteplusAssetsLoading(false));
  };
  useEffect(() => {
    if (isBytePlus2Selected && byteplusAssets.length === 0 && !byteplusAssetsLoading) {
      loadByteplusAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBytePlus2Selected]);

  const addByteplusAsset = async () => {
    const assetId = newAssetId.trim();
    if (!/^asset-/.test(assetId)) {
      setError("Asset ID invalide (doit commencer par 'asset-').");
      return;
    }
    try {
      const res = await fetch("/api/byteplus-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId, name: newAssetName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'ajout");
      setByteplusAssets((prev) => [data.asset, ...prev.filter((a) => a.id !== data.asset.id)]);
      setSelectedAssetIds((prev) => [...prev, data.asset.asset_id]);
      setNewAssetId("");
      setNewAssetName("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'ajout");
    }
  };

  const deleteByteplusAsset = async (id: string, assetId: string) => {
    await fetch(`/api/byteplus-assets?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setByteplusAssets((prev) => prev.filter((a) => a.id !== id));
    setSelectedAssetIds((prev) => prev.filter((x) => x !== assetId));
  };

  const toggleAssetSelect = (assetId: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((x) => x !== assetId) : [...prev, assetId]
    );
  };

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
    // HeyGen avatar models need an avatar + a voice (else the model invents speech).
    if (isHeyGenEngineSelected) {
      if (!selectedAvatarId) {
        setError("Select an avatar to use this model.");
        return;
      }
      if (!useMyVoice || !myVoiceId || voiceScript.trim().length < 2) {
        setError("Avatar models need your voice + the dialogue. Fill in “Use my voice”.");
        return;
      }
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
          // Chaining strategy (only meaningful when chaining is ON)
          ...(multiSceneChain && { chain_strategy: chainStrategy }),
          // Forced scene count — omit for "auto" (duration-based split)
          ...(numScenes !== "auto" && { num_scenes: sceneCount }),
          // "Use my voice" — cloned HeyGen voice (lipsync or voice-over)
          ...(useMyVoice && myVoiceId && voiceScript.trim().length > 1 && {
            voice_id: myVoiceId,
            script_text: voiceScript.trim(),
            voice_mode: voiceMode,
            lipsync_mode: voiceLipsyncMode,
          }),
          // HeyGen avatar models → route to the avatar pipeline (HeyGen credits)
          ...(isHeyGenEngineSelected && selectedAvatarId && {
            avatar_id: selectedAvatarId,
          }),
          // BytePlus verified face assets (Seedance 2.0 reference-to-video)
          ...(isBytePlus2Selected && selectedAssetIds.length > 0 && {
            byteplus_asset_ids: selectedAssetIds,
          }),
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
  const autoSceneCount = plan === "free" ? 1 : Math.min(Math.ceil(dur / 5), planMaxScenes);

  // Per-clip ceiling of the selected engine (auto → Seedance Fast = 15s).
  const selectedEngineMax =
    selectedEngine === "auto"
      ? 15
      : engineOptions.find((e) => e.key === selectedEngine)?.maxDuration ?? 15;
  // Available forced scene counts: from the minimum the duration allows on
  // this engine, up to the plan / 3s-per-scene maximum.
  const minScenes = Math.max(1, Math.ceil(dur / selectedEngineMax));
  const maxUsefulScenes = Math.max(minScenes, Math.min(planMaxScenes, Math.floor(dur / 3)));
  const sceneCountChoices: number[] = [];
  for (let n = minScenes; n <= maxUsefulScenes; n++) sceneCountChoices.push(n);

  // Effective scene count shown in estimates / loading steps.
  const sceneCount =
    numScenes === "auto" ? autoSceneCount : Math.min(Math.max(numScenes, minScenes), maxUsefulScenes);

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

  // Model selector — defined once, rendered prominently at the top (was buried
  // in Advanced). Selecting the model first makes the contextual sections
  // (references, faces, cost) appear logically below.
  const modelBlock = (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-indigo-500" />
        Model
      </p>
      <div className="flex gap-2 flex-wrap">
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
  );

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

            {/* ── Model (promoted out of Advanced) ───────────────── */}
            {planLoaded && modelBlock}

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

            {/* ── Avatar picker (HeyGen models only) ───────────────── */}
            {isHeyGenEngineSelected && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Avatar <span className="text-rose-500">*</span>
                  </span>
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    HeyGen credits · ~60× cheaper
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/60 mb-3">
                  This model puts your avatar in the scene and speaks your script
                  in your voice (set below in “Use my voice”).
                </p>

                {heygenAvatarsLoading ? (
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your avatars…
                  </p>
                ) : heygenAvatars.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70">
                    No avatar yet.{" "}
                    <Link href="/create/avatar" className="text-primary hover:underline">
                      Create one in the Avatar studio
                    </Link>{" "}
                    then come back here.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {heygenAvatars.map((a) => {
                      const active = selectedAvatarId === a.avatarId;
                      return (
                        <button
                          key={a.avatarId}
                          type="button"
                          onClick={() => setSelectedAvatarId(active ? "" : a.avatarId)}
                          className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                            active
                              ? "border-primary ring-2 ring-primary/40"
                              : "border-border/40 hover:border-primary/40"
                          }`}
                          title={a.name}
                        >
                          <div className="aspect-square bg-muted/30">
                            {a.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.previewUrl}
                                alt={a.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <User className="h-6 w-6 text-muted-foreground/40" />
                              </div>
                            )}
                          </div>
                          <span className="block truncate px-2 py-1 text-[11px] text-foreground">
                            {a.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── BytePlus verified faces (Seedance 2.0 r2v) ───────── */}
            {isBytePlus2Selected && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Your faces (BytePlus)
                  </span>
                  <a
                    href="https://console.byteplus.com/ark/region:ark+ap-southeast-1/openManagement"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary/80 hover:underline"
                  >
                    Verify a new face ↗
                  </a>
                </div>
                <p className="text-xs text-muted-foreground/60 mb-3">
                  BytePlus blocks raw uploads of real faces, so faces here must be
                  <strong> verified once</strong> (console QR) — then reused by ID. Selected
                  faces become <strong>image 1, image 2…</strong> → reference them in your
                  prompt (e.g. “the man in image 1 …”).
                  <br />
                  <span className="text-muted-foreground/45">
                    Want to just upload a face image? Use the “Character Face” reference above
                    with Seedance 2.0 (Atlas) or Wan / Kling (those allow direct upload).
                  </span>
                </p>

                {byteplusAssetsLoading ? (
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your faces…
                  </p>
                ) : (
                  <>
                    {byteplusAssets.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {byteplusAssets.map((a) => {
                          const idx = selectedAssetIds.indexOf(a.asset_id);
                          const selected = idx >= 0;
                          return (
                            <div
                              key={a.id}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                                selected ? "border-primary/50 bg-primary/10" : "border-border/40 bg-muted/20"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleAssetSelect(a.asset_id)}
                                className="flex-1 flex items-center gap-2 text-left"
                              >
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border/50 text-transparent"
                                  }`}
                                >
                                  {selected ? idx + 1 : ""}
                                </span>
                                <span className="text-xs font-medium text-foreground truncate">
                                  {a.name || a.asset_id}
                                </span>
                                {selected && (
                                  <span className="text-[10px] text-primary/80">image {idx + 1}</span>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteByteplusAsset(a.id, a.asset_id)}
                                className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                                title="Remove"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add an approved Asset ID */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newAssetName}
                        onChange={(e) => setNewAssetName(e.target.value)}
                        placeholder="Name (e.g. Me)"
                        className="sm:w-32 rounded-lg border border-border/40 bg-background px-3 py-2 text-xs text-foreground"
                      />
                      <input
                        type="text"
                        value={newAssetId}
                        onChange={(e) => setNewAssetId(e.target.value)}
                        placeholder="BytePlus Asset ID (asset-…)"
                        className="flex-1 rounded-lg border border-border/40 bg-background px-3 py-2 text-xs text-foreground font-mono"
                      />
                      <button
                        type="button"
                        onClick={addByteplusAsset}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
                      >
                        + Add face
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 mt-2">
                      Create &amp; verify a face once in the BytePlus console (Media → Real-human →
                      New asset group → QR), then paste its <strong>Asset ID</strong> here. Reusable.
                    </p>
                  </>
                )}
              </div>
            )}

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

            {/* ── Scenes (scene-count control) ───────────────────── */}
            {plan !== "free" && planLoaded && sceneCountChoices.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Film className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-semibold text-foreground">Scenes</span>
                </div>
                <SegmentedControl
                  options={[
                    { value: "auto", label: `Auto (${autoSceneCount})` },
                    ...sceneCountChoices.map((n) => ({
                      value: String(n),
                      label: String(n),
                    })),
                  ]}
                  value={numScenes === "auto" ? "auto" : String(sceneCount)}
                  onChange={(v) =>
                    setNumScenes(v === "auto" ? "auto" : parseInt(v, 10))
                  }
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground/60 mt-2">
                  Auto splits by duration. Pick <strong>1</strong> to keep a
                  single continuous shot — no repeated near-identical cuts.
                </p>
              </div>
            )}

            {/* ── Use my voice (cloned HeyGen voice) ─────────────── */}
            {plan !== "free" && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Mic className="h-4 w-4 text-rose-500" />
                    Use my voice
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseMyVoice((v) => !v)}
                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                      useMyVoice ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                    aria-pressed={useMyVoice}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
                        useMyVoice ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {useMyVoice && (
                  <div className="rounded-xl border border-border/40 bg-card/50 p-3.5 space-y-3.5">
                    {clonedVoicesLoading ? (
                      <p className="text-xs text-muted-foreground/60 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your voices…
                      </p>
                    ) : clonedVoices.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">
                        No cloned voice yet.{" "}
                        <Link href="/create/avatar" className="text-primary hover:underline">
                          Create one in the Avatar studio
                        </Link>{" "}
                        then come back here.
                      </p>
                    ) : (
                      <>
                        {/* Voice picker + preview */}
                        <div>
                          <label className="text-xs font-medium text-foreground mb-1.5 block">
                            Voice
                          </label>
                          <div className="flex items-center gap-2">
                            <select
                              value={myVoiceId}
                              onChange={(e) => setMyVoiceId(e.target.value)}
                              className="flex-1 rounded-lg border border-border/40 bg-background px-3 py-2 text-xs text-foreground"
                            >
                              {clonedVoices.map((v) => (
                                <option key={v.voiceId} value={v.voiceId}>
                                  {v.name} {v.language ? `· ${v.language}` : ""}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const sel = clonedVoices.find((v) => v.voiceId === myVoiceId);
                              return sel?.previewUrl ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    try { new Audio(sel.previewUrl!).play(); } catch {}
                                  }}
                                  className="rounded-lg border border-border/40 p-2 text-muted-foreground hover:text-primary hover:border-primary/40"
                                  title="Preview voice"
                                >
                                  <Volume2 className="h-4 w-4" />
                                </button>
                              ) : null;
                            })()}
                          </div>
                        </div>

                        {/* Dialogue / script */}
                        <div>
                          <label className="text-xs font-medium text-foreground mb-1.5 block">
                            What should be said (exact words)
                          </label>
                          <textarea
                            value={voiceScript}
                            onChange={(e) => setVoiceScript(e.target.value)}
                            placeholder="Type the dialogue or narration to speak in your voice…"
                            rows={3}
                            maxLength={2000}
                            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-xs text-foreground resize-none"
                          />
                        </div>

                        {/* Mode: lipsync vs voice-over */}
                        <div>
                          <label className="text-xs font-medium text-foreground mb-1.5 block">
                            Mode
                          </label>
                          <SegmentedControl
                            options={[
                              { value: "lipsync", label: "Lip-sync" },
                              { value: "voiceover", label: "Voice-over" },
                            ]}
                            value={voiceMode}
                            onChange={(v) => setVoiceMode(v as "lipsync" | "voiceover")}
                            className="w-full"
                          />
                          <p className="text-[11px] text-muted-foreground/60 mt-1.5 leading-snug">
                            {voiceMode === "lipsync"
                              ? "Mouth synced to your voice on the main character (burned in)."
                              : "Your voice as a narration track over the scene (works for any scene, incl. multi-character)."}
                          </p>
                        </div>

                        {/* Lip-sync quality (lipsync only) */}
                        {voiceMode === "lipsync" && (
                          <div>
                            <label className="text-xs font-medium text-foreground mb-1.5 block">
                              Lip-sync quality
                            </label>
                            <SegmentedControl
                              options={[
                                { value: "speed", label: "Fast" },
                                { value: "precision", label: "Precision" },
                              ]}
                              value={voiceLipsyncMode}
                              onChange={(v) => setVoiceLipsyncMode(v as "speed" | "precision")}
                              className="w-full"
                            />
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground/50 leading-snug">
                          Best with the <strong>Seedance 2.0</strong> or <strong>Kling O3</strong> engine.
                          For lip-sync, keep the dialogue length close to the video duration.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

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

                  {/* Model selector moved to the top of the form (out of Advanced). */}

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

                      {/* ── Chaining strategy (only when chaining is ON) ──── */}
                      {multiSceneChain && (
                        <div className="mt-4">
                          <p className="text-xs font-semibold text-foreground mb-2">
                            Chaining strategy
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setChainStrategy("continuity")}
                              className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                                chainStrategy === "continuity"
                                  ? "border-primary/50 bg-primary/10"
                                  : "border-border/40 bg-muted/20 hover:border-border"
                              }`}
                            >
                              <span
                                className={`block text-xs font-semibold ${
                                  chainStrategy === "continuity"
                                    ? "text-primary"
                                    : "text-foreground"
                                }`}
                              >
                                Continuity
                              </span>
                              <span className="block text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">
                                Most fluid motion. Image quality may soften on
                                longer videos.
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setChainStrategy("anchor")}
                              className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                                chainStrategy === "anchor"
                                  ? "border-primary/50 bg-primary/10"
                                  : "border-border/40 bg-muted/20 hover:border-border"
                              }`}
                            >
                              <span
                                className={`block text-xs font-semibold ${
                                  chainStrategy === "anchor"
                                    ? "text-primary"
                                    : "text-foreground"
                                }`}
                              >
                                Stable quality
                              </span>
                              <span className="block text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">
                                Every scene re-anchors to scene 1. No quality
                                decay across cuts.
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
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

            {/* ── Admin: Credit sufficiency check ─────────────────── */}
            {isAdminEmail(userEmail) && (() => {
              // Determine provider for the selected engine
              const engineKey = selectedEngine === "auto" ? "evolink_fast" : selectedEngine;
              const isBailianEngine = engineKey.includes("bailian");

              // HeyGen avatar models — billed on HeyGen credits (not EvoLink)
              if (isHeyGenEngineSelected) {
                return (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-start gap-3">
                    <Wallet className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-500">
                        HeyGen credits — Avatar Shots (~$0.008/s)
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        ~60× cheaper than EvoLink Seedance for the same scene.
                        Billed on your HeyGen wallet, not EvoLink.
                      </p>
                    </div>
                  </div>
                );
              }

              // BytePlus / Atlas Seedance — surgical token-based cost estimate
              const isByteplusSel =
                selectedEngine === "seedance15pro_byteplus" ||
                selectedEngine === "seedance15pro_720p_byteplus" ||
                selectedEngine === "seedance2_byteplus" ||
                selectedEngine === "seedance2_fast_byteplus";
              const isAtlasSel =
                selectedEngine === "seedance2_atlas" ||
                selectedEngine === "seedance2_fast_atlas";
              if (isByteplusSel || isAtlasSel) {
                const isFast = selectedEngine.includes("fast");
                const resolution =
                  selectedEngine.includes("720") || isFast ? "720p" : "1080p";
                const usdPerMToken = SEEDANCE_USD_PER_MTOKEN[selectedEngine] ?? 2.4;
                const est = estimateBytePlusCost(resolution, dur, { usdPerMToken });
                const provider = isByteplusSel
                  ? "BytePlus (token)"
                  : "AtlasCloud (pay-as-you-go)";
                return (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3 flex items-start gap-3">
                    <Wallet className="h-5 w-5 shrink-0 mt-0.5 text-violet-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-violet-500">
                        Seedance 2.0 — coût estimé · {provider}
                      </p>
                      <ul className="text-xs text-muted-foreground/80 mt-1.5 space-y-0.5">
                        <li>
                          ≈ <span className="font-semibold text-foreground">{est.tokensPerSecond.toLocaleString()}</span> tokens/s
                          {" "}· {resolution} · {est.fps} fps
                        </li>
                        <li>
                          ≈ <span className="font-semibold text-foreground">{est.tokens.toLocaleString()}</span> tokens pour {dur}s
                        </li>
                        <li>
                          ≈ <span className="font-semibold text-emerald-500">${est.costUsd.toFixed(2)}</span>
                          {" "}<span className="text-muted-foreground/50">(à ${est.usdPerMToken}/1M tokens)</span>
                        </li>
                      </ul>
                      <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                        Formule officielle : (L × H × FPS × durée) / 1024. Le montant réel
                        consommé est enregistré après génération.
                      </p>
                    </div>
                  </div>
                );
              }

              // Bailian: no balance API — show a note to check Alibaba console
              if (isBailianEngine) {
                return (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex items-start gap-3">
                    <Wallet className="h-5 w-5 shrink-0 mt-0.5 text-blue-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-400">
                        Bailian credits (Alibaba Cloud)
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        No automatic balance check available for Bailian.
                        Verify your credits on the Alibaba Cloud console before launching.
                      </p>
                      <a
                        href="https://bailian.console.alibabacloud.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
                      >
                        <ExternalLink className="h-3 w-3" /> Open Alibaba Cloud Console
                      </a>
                    </div>
                  </div>
                );
              }

              // EvoLink: check credit balance
              if (!adminCredits) return null;

              const costPerScene = engineCosts[engineKey] ?? 100;
              const estimatedCost = sceneCount * costPerScene;
              const canAfford = adminCredits.remaining >= estimatedCost;
              const isLow = !canAfford || adminCredits.status !== "ok";

              if (!isLow) return null;

              return (
                <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                  !canAfford
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-amber-500/40 bg-amber-500/10"
                }`}>
                  <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
                    !canAfford ? "text-red-400" : "text-amber-400"
                  }`} />
                  <div className="flex-1">
                    {!canAfford ? (
                      <>
                        <p className="text-sm font-medium text-red-400">
                          <Wallet className="h-3.5 w-3.5 inline mr-1" />
                          Not enough credits for this project
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated cost: <span className="font-semibold text-red-400">~{estimatedCost} credits</span> ({sceneCount} scene{sceneCount > 1 ? "s" : ""} × {costPerScene}/scene)
                          <br />
                          Available: <span className="font-semibold text-red-400">{adminCredits.remaining.toFixed(1)} credits</span>
                          <br />
                          Missing: ~{Math.ceil(estimatedCost - adminCredits.remaining)} credits. Top up before launching.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-amber-400">
                          <Wallet className="h-3.5 w-3.5 inline mr-1" />
                          EvoLink credits running low: {adminCredits.remaining.toFixed(1)} remaining
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated cost for this job: ~{estimatedCost} credits ({sceneCount} scene{sceneCount > 1 ? "s" : ""}).
                          Consider topping up soon.
                        </p>
                      </>
                    )}
                    <a
                      href="https://evolink.ai/fr/dashboard/credits"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
                    >
                      <ExternalLink className="h-3 w-3" /> Top up on EvoLink
                    </a>
                  </div>
                </div>
              );
            })()}

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
