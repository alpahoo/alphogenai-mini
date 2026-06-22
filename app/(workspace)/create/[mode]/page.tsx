"use client";

import { useState, useEffect, use, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Wand2,
  Loader2,
  Sparkles,
  Lock,
  Clock,
  ChevronDown,
  Check,
  Monitor,
  Type,
  Music,
  Mic,
  Volume2,
  User,
  Cpu,
  Film,
  Link2,
  ShoppingBag,
  Share2,
  ImagePlus,
  Package,
  Shirt,
  AlertTriangle,
  ExternalLink,
  Wallet,
  Clapperboard,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SegmentedControl } from "@/components/create/segmented-control";
import { estimateBytePlusCost, SEEDANCE_USD_PER_MTOKEN } from "@/lib/byteplus-cost";
import { TemplatePicker } from "@/components/create/template-picker";
import { ReferenceUpload, buildReferencePayload } from "@/components/create/reference-upload";
import {
  PromptComposer,
  type PromptComposerHandle,
  type ComposerReference,
  type MediaRefData,
} from "@/components/create/prompt-composer";
import { FacesManager } from "@/components/create/faces-manager";
import { AssetPanel } from "@/components/create/asset-panel";
import { getEngineIntention, cleanModelName, faceCompat, type EngineCompatContext } from "@/lib/engine-intentions";
import {
  AIDirectorPanel,
  type DirectorSceneVM,
  type DirectorAction,
} from "@/components/create/ai-director-panel";
import { computeDirectorQuality } from "@/lib/director-quality";
import { resolveDirectorEngineKey } from "@/lib/director-engine";
import {
  buildUGCDirectorPlan,
  type UGCAngle,
  type UGCCreator,
  type UGCPlatform,
} from "@/lib/ugc-director";
import { getUGCSocialPreset } from "@/lib/ugc-social-pack";
import { computeUGCReadiness } from "@/lib/ugc-readiness";
import { isAdminEmail } from "@/lib/flags";
import type { PromptTemplate } from "@/lib/prompt-templates";
import type { JobPlan, EngineKey, ReferenceItem, ReferenceRole } from "@/lib/types";
import { PLAN_MAX_DURATION, PLAN_MAX_SCENES } from "@/lib/types";

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
  thumb_url?: string | null;
}

interface CinematicLook {
  id: string;
  name: string;
  video_url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
}

interface ResearchHandoffPayload {
  researchJobId: string;
  topic: string;
  mode?: string;
  language?: string;
  angleTitle?: string | null;
  angleHook?: string | null;
  script?: string;
  voiceoverText?: string;
  references?: Array<{
    role?: ReferenceRole;
    url?: string;
    storage_path?: string;
    mime_type?: string;
    filename?: string;
    weight?: number;
  }>;
  scenes?: Array<{
    index?: number;
    title?: string;
    prompt?: string;
    durationSec?: number;
  }>;
}

const RESEARCH_HANDOFF_STORAGE_KEY = "alphogen:research-handoff";

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
  const searchParams = useSearchParams();
  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.story;

  // Plan
  const [plan, setPlan] = useState<JobPlan>("free");
  const [planLoaded, setPlanLoaded] = useState(false);

  // Form
  const [prompt, setPrompt] = useState("");
  // Tokenized prompt composer (TipTap). `prompt` mirrors its plain text;
  // `composerRefs` holds the ordered inline media chips (faces/images/…).
  const composerRef = useRef<PromptComposerHandle>(null);
  const referenceJobPrefillRef = useRef<string | null>(null);
  const researchHandoffAppliedRef = useRef(false);
  const promptParamAppliedRef = useRef(false);
  const [researchJobId, setResearchJobId] = useState<string | null>(null);
  const [composerRefs, setComposerRefs] = useState<ComposerReference[]>([]);
  // Images uploaded straight from the composer toolbar (→ @image chips). Kept
  // for the @-menu; the actual ReferenceItem is also added to `references` so
  // the backend receives it through the existing reference pipeline.
  const [composerUploads, setComposerUploads] = useState<MediaRefData[]>([]);
  const [composerUploading, setComposerUploading] = useState(false);
  const [referencePrefillStatus, setReferencePrefillStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // url -> full ReferenceItem for composer uploads. Only the ones still present
  // as chips in the prompt are sent at submit (avoids stale/duplicate refs).
  const [composerUploadItems, setComposerUploadItems] = useState<Record<string, ReferenceItem>>({});
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
  const [showReferences, setShowReferences] = useState(false);
  // T-1130b — story-only guided "how to start" choice. Drives existing state only
  // (references panel / Director); never changes generation logic. story mode only.
  const [storyTab, setStoryTab] = useState<"text" | "reference" | "director">("text");
  // AI Director — editable pre-generation plan (submit wired in submitJob)
  const [directorOpen, setDirectorOpen] = useState(false);
  const [directorScenes, setDirectorScenes] = useState<DirectorSceneVM[]>([]);
  const directorEngineKey = resolveDirectorEngineKey(selectedEngine);
  const [ugcAngle, setUgcAngle] = useState<UGCAngle>("product_demo");
  const [ugcPlatform, setUgcPlatform] = useState<UGCPlatform>("tiktok_reels");
  const [ugcCreator, setUgcCreator] = useState<UGCCreator>("none");
  const [selectedUGCFaceAssetId, setSelectedUGCFaceAssetId] = useState("");
  const [selectedUGCLookId, setSelectedUGCLookId] = useState("");
  const [selectedUGCAvatarId, setSelectedUGCAvatarId] = useState("");
  const [ugcLooks, setUgcLooks] = useState<CinematicLook[]>([]);
  const [ugcLooksLoading, setUgcLooksLoading] = useState(false);
  const [ugcProductName, setUgcProductName] = useState("");
  const [ugcBenefit, setUgcBenefit] = useState("");
  const [ugcTone, setUgcTone] = useState("natural, premium, creator-led");

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

  // Avatar library used when an avatar model is selected.
  const [heygenAvatars, setHeygenAvatars] = useState<HeyGenAvatar[]>([]);
  const [heygenAvatarsLoading, setHeygenAvatarsLoading] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");

  // True when an avatar model is selected (needs an avatar + voice).
  const isHeyGenEngineSelected =
    selectedEngine === "heygen_avatar_iv" || selectedEngine === "heygen_avatar_shots";

  // BytePlus Seedance 2.0 supports reference-to-video (verified face assets).
  const isBytePlus2Selected =
    selectedEngine === "seedance2_byteplus" || selectedEngine === "seedance2_fast_byteplus";
  // BytePlus verified-face asset library (managed via FacesManager; faces are
  // inserted into the prompt as @face chips → byteplus_asset_ids at submit).
  const [byteplusAssets, setByteplusAssets] = useState<BytePlusAsset[]>([]);
  const [byteplusAssetsLoading, setByteplusAssetsLoading] = useState(false);

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
    setComposerRefs([]);
    composerRef.current?.setText(template.prompt);
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
    const referenceJobId = searchParams.get("reference_job_id");
    if (!referenceJobId || referenceJobPrefillRef.current === referenceJobId) return;

    referenceJobPrefillRef.current = referenceJobId;
    setReferencePrefillStatus("loading");
    setShowReferences(true);

    async function prepareReference() {
      try {
        const res = await fetch(`/api/jobs/${referenceJobId}/reference-image`, { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.reference?.url) {
          throw new Error(data.error || "Could not prepare reference");
        }

        const item = data.reference as ReferenceItem;
        const media: MediaRefData = {
          refType: "image",
          label: "reference",
          url: item.url,
          thumb: item.url,
        };

        setComposerUploads((prev) => {
          if (prev.some((m) => m.url === item.url)) return prev;
          return [...prev, media];
        });
        setComposerUploadItems((prev) => ({ ...prev, [item.url]: item }));
        setReferences((prev) => ({ ...prev, job_reference: item }));
        composerRef.current?.insertRef(media);
        setReferencePrefillStatus("ready");
      } catch (err) {
        setReferencePrefillStatus("error");
        setError(err instanceof Error ? err.message : "Could not prepare a reference from this video yet");
      }
    }

    void prepareReference();
  }, [searchParams]);

  // Upload an image from the composer toolbar → insert an @image chip and
  // register it as a reference (sent to the backend via references_payload).
  const inferComposerUploadRole = (): ReferenceRole => {
    if (mode !== "product" && mode !== "social") return "outfit_style";
    const usedRoles = new Set(Object.values(composerUploadItems).map((item) => item.role));
    if (!usedRoles.has("product_reference")) return "product_reference";
    if (!usedRoles.has("outfit_reference")) return "outfit_reference";
    return "outfit_style";
  };

  const composerLabelForRole = (role: ReferenceRole) => {
    if (role === "product_reference") return "product";
    if (role === "outfit_reference") return "outfit";
    return `image ${composerUploads.length + 1}`;
  };

  const handleComposerUpload = async (file: File, roleOverride?: ReferenceRole) => {
    if (file.size > 10 * 1024 * 1024) {
      setError("Image too large (max 10MB)");
      return;
    }
    setComposerUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?bucket=references", { method: "POST", body: fd });
      if (!res.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Upload server error — please retry.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const referenceRole = roleOverride ?? inferComposerUploadRole();
      const item: ReferenceItem = {
        role: referenceRole,
        url: data.url,
        ...(typeof data.storage_path === "string" && { storage_path: data.storage_path }),
        mime_type: file.type,
        filename: file.name,
        weight: 0.7,
      };
      // Store by url; sent only if its chip is still in the prompt at submit.
      setComposerUploadItems((prev) => ({ ...prev, [data.url]: item }));

      // Clean, stable label ("image N") independent of the raw file name.
      const media: MediaRefData = {
        refType: "image",
        label: composerLabelForRole(referenceRole),
        url: data.url,
        thumb: data.url,
      };
      setComposerUploads((prev) => [...prev, media]);
      composerRef.current?.insertRef(media);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setComposerUploading(false);
    }
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
    const needed = useMyVoice || isHeyGenEngineSelected || ((mode === "product" || mode === "social") && ugcCreator === "avatar");
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
    mode,
    ugcCreator,
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

  // Also load verified faces on mount so the composer's @-menu has them ready
  // (regardless of the selected engine).
  useEffect(() => {
    loadByteplusAssets();
  }, []);
  useEffect(() => {
    if (mode !== "product" && mode !== "social") return;
    if (ugcLooks.length > 0 || ugcLooksLoading) return;
    setUgcLooksLoading(true);
    fetch("/api/looks")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const looks: CinematicLook[] = Array.isArray(data.looks) ? data.looks : [];
        setUgcLooks(looks);
        if (looks.length > 0 && !selectedUGCLookId) setSelectedUGCLookId(looks[0].id);
      })
      .catch(() => {})
      .finally(() => setUgcLooksLoading(false));
  }, [mode, selectedUGCLookId, ugcLooks.length, ugcLooksLoading]);

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

  // Core submit. When called from the AI Director, `opts.directorScenes` are
  // mapped to the backend's already-supported `scenes[]` (clientScenes path) —
  // no backend/state-machine change. Normal "Generate Video" passes nothing.
  const submitJob = async (opts?: { directorScenes?: DirectorSceneVM[] }) => {
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Prompt must be at least 3 characters");
      return;
    }
    // Verified face assets from the composer's @face chips, merged (deduped)
    // with any legacy panel selection. Only chips carrying a verified assetId.
    const mergedAssetIds = Array.from(
      new Set(
        composerRefs
          .filter((r) => r.refType === "face" && r.assetId)
          .map((r) => r.assetId as string),
      ),
    );
    // Composer-uploaded images: send ONLY those still present as chips in the
    // prompt (avoids stale/removed/duplicate uploads being silently sent).
    const activeRefUrls = new Set(
      composerRefs.map((r) => r.url).filter((u): u is string => !!u),
    );
    const activeComposerRefs: Record<string, ReferenceItem> = {};
    Object.entries(composerUploadItems).forEach(([url, item]) => {
      if (activeRefUrls.has(url)) activeComposerRefs[url] = item;
    });
    const allReferences = { ...references, ...activeComposerRefs };
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
          ...(researchJobId && { research_job_id: researchJobId }),
          ...(uploadedImageUrl && { image_url: uploadedImageUrl }),
          ...(Object.keys(allReferences).length > 0 && { references: buildReferencePayload(allReferences) }),
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
          // AI Director: edited plan → backend's clientScenes path (validated
          // server-side: cap MAX_SCENES, duration clamp [3,10], prompt ≤2000).
          ...(opts?.directorScenes &&
            opts.directorScenes.length > 0 && {
              scenes: opts.directorScenes.map((s) => ({
                prompt: s.prompt,
                duration_sec: Math.max(3, Math.min(10, s.durationSec)),
                engine: directorEngineKey,
              })),
            }),
          // "Use my voice" — cloned HeyGen voice (lipsync or voice-over)
          ...(useMyVoice && myVoiceId && voiceScript.trim().length > 1 && {
            voice_id: myVoiceId,
            script_text: voiceScript.trim(),
            voice_mode: voiceMode,
            lipsync_mode: voiceLipsyncMode,
          }),
          // Avatar models route to the avatar pipeline.
          ...(isHeyGenEngineSelected && selectedAvatarId && {
            avatar_id: selectedAvatarId,
          }),
          // BytePlus verified face assets (Seedance 2.0 reference-to-video)
          ...(isBytePlus2Selected && mergedAssetIds.length > 0 && {
            byteplus_asset_ids: mergedAssetIds,
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

  // Form submit (normal "Generate Video" path — no director scenes).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitJob();
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

  useEffect(() => {
    if (!planLoaded) return;
    if (searchParams.get("research_handoff") !== "1" || researchHandoffAppliedRef.current) return;

    researchHandoffAppliedRef.current = true;
    try {
      const raw = window.sessionStorage.getItem(RESEARCH_HANDOFF_STORAGE_KEY);
      if (!raw) return;

      const handoff = JSON.parse(raw) as ResearchHandoffPayload;
      const rawScenes = Array.isArray(handoff.scenes) ? handoff.scenes : [];
      const maxDirectorScenes = Math.max(1, Math.min(planMaxScenes, Math.floor(planMaxDuration / 3) || 1));
      const cappedScenes = rawScenes.slice(0, maxDirectorScenes);
      if (cappedScenes.length === 0) return;

      const promptParts = [
        `Research brief: ${handoff.topic}`,
        handoff.angleTitle ? `Selected angle: ${handoff.angleTitle}` : null,
        handoff.angleHook ? `Hook: ${handoff.angleHook}` : null,
        handoff.script ? `Script:\n${handoff.script}` : null,
      ].filter(Boolean);
      const researchPrompt = promptParts.join("\n\n").slice(0, 1900);
      const narrationText = (handoff.voiceoverText || handoff.script || "").trim().slice(0, 2000);
      const totalSceneDuration = cappedScenes.reduce(
        (sum, scene) => sum + Math.max(3, Math.min(10, Math.round(scene.durationSec ?? 5))),
        0,
      );
      const durationOption =
        DURATION_OPTIONS.map((option) => Number(option.value)).find((value) => value >= totalSceneDuration) ??
        Number(DURATION_OPTIONS[DURATION_OPTIONS.length - 1].value);
      const modelName =
        selectedEngine === "auto"
          ? "Auto"
          : cleanModelName(engineOptions.find((e) => e.key === selectedEngine)?.label ?? selectedEngine);

      setPrompt(researchPrompt);
      setResearchJobId(handoff.researchJobId || null);
      composerRef.current?.setText(researchPrompt);
      setComposerRefs([]);
      if (narrationText) {
        setVoiceoverEnabled(true);
        setVoiceoverText(narrationText);
        setVoiceScript(narrationText);
        setVoiceMode("voiceover");
        setCaptionMode("auto");
      }
      if (Array.isArray(handoff.references) && handoff.references.length > 0) {
        const researchReferences: Record<string, ReferenceItem> = {};
        handoff.references.slice(0, 6).forEach((ref, index) => {
          if (!ref?.storage_path || !ref.url) return;
          researchReferences[`research_reference_${index + 1}`] = {
            role: ref.role ?? "outfit_style",
            url: ref.url,
            storage_path: ref.storage_path,
            mime_type: ref.mime_type ?? "image/jpeg",
            filename: ref.filename ?? `research-reference-${index + 1}`,
            weight: typeof ref.weight === "number" ? ref.weight : 0.7,
          };
        });
        if (Object.keys(researchReferences).length > 0) {
          setReferences((prev) => ({ ...prev, ...researchReferences }));
        }
      }
      setDuration(String(Math.min(planMaxDuration, durationOption)));
      setNumScenes(cappedScenes.length);
      setDirectorScenes(
        cappedScenes.map((scene, index) => ({
          index,
          title: scene.title || `Research scene ${index + 1}`,
          prompt: scene.prompt || handoff.topic,
          durationSec: Math.max(3, Math.min(10, Math.round(scene.durationSec ?? 5))),
          camera: index === 0 ? "strong opening frame" : undefined,
          assets: [],
          recommendedModel: modelName,
          notes: ["Research-backed storyboard"],
        })),
      );
      setDirectorOpen(true);
      window.sessionStorage.removeItem(RESEARCH_HANDOFF_STORAGE_KEY);
    } catch {
      setError("Could not load the research storyboard handoff.");
    }
  }, [searchParams, planLoaded, planMaxScenes, planMaxDuration, selectedEngine, engineOptions]);

  // Template Hub composer handoff: pre-fill the prompt from ?prompt=<encoded text>
  // when arriving from the home page's "Tell your agent what to create" composer.
  useEffect(() => {
    if (!planLoaded) return;
    if (promptParamAppliedRef.current) return;
    if (searchParams.get("research_handoff") === "1") return;

    const promptParam = searchParams.get("prompt");
    if (!promptParam) return;

    promptParamAppliedRef.current = true;
    const decoded = decodeURIComponent(promptParam);
    setPrompt(decoded);
    composerRef.current?.setText(decoded);
  }, [searchParams, planLoaded]);

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
  // Selected-engine capabilities → asset compatibility badges (display-only).
  const engineCompat: EngineCompatContext = useMemo(
    () => ({
      isAuto: selectedEngine === "auto",
      isBytePlus2: isBytePlus2Selected,
      supportsRefs:
        selectedEngine === "auto" ||
        engineOptions.some((e) => e.key === selectedEngine && e.supportsRefs),
    }),
    [selectedEngine, isBytePlus2Selected, engineOptions],
  );

  // ── AI Director — derive a readable, editable plan + quality read-out from
  //    the current inputs. Pure/local; the plan is sent on "Generate now" via
  //    submitJob({ directorScenes }). No provider names surface here.
  const buildDirectorPlan = (): DirectorSceneVM[] => {
    const n = Math.max(1, sceneCount || 1);
    const total = Math.max(1, parseInt(duration, 10) || 5);
    const per = Math.max(3, Math.min(10, Math.round(total / n)));
    const TITLES = ["Establishing shot", "Reaction", "Detail / insert", "Wide shot", "Close-up", "Transition"];
    const CAMERAS = ["slow dolly-in", "handheld", "static", "slow pan", "tracking"];
    const base = prompt.trim() || config.placeholder;
    const assets = composerRefs.map((r) => ({
      kind: (r.refType === "video" ? "image" : r.refType) as "face" | "image" | "style",
      label: r.label,
      thumb: r.thumb ?? null,
    }));
    const modelName =
      selectedEngine === "auto"
        ? "Auto"
        : cleanModelName(engineOptions.find((e) => e.key === selectedEngine)?.label ?? selectedEngine);
    const hasFace = composerRefs.some((r) => r.refType === "face");

    const scenes: DirectorSceneVM[] = Array.from({ length: n }, (_, i) => ({
      index: i,
      title: TITLES[i % TITLES.length],
      prompt: n === 1 ? base : `${TITLES[i % TITLES.length]} — ${base}`,
      durationSec: per,
      camera: CAMERAS[i % CAMERAS.length],
      assets,
      recommendedModel: modelName,
      notes: !hasFace && engineCompat.isBytePlus2 ? ["character consistency: add a verified face"] : undefined,
    }));

    return scenes;
  };

  const openDirector = () => {
    setDirectorScenes(buildDirectorPlan());
    setDirectorOpen(true);
  };

  // Reactive quality read-out — recomputed whenever the edited scenes or inputs
  // change (real helpers, provider-neutral; see lib/director-quality.ts).
  const directorQuality = useMemo(
    () =>
      computeDirectorQuality({
        prompt,
        scenes: directorScenes,
        hasFace: composerRefs.some((r) => r.refType === "face"),
        hasRawImage: composerRefs.some((r) => r.refType === "image" && !!r.url),
        engineCompat,
        selectedEngineKey: directorEngineKey,
        aspectRatio,
      }),
    [prompt, directorScenes, composerRefs, engineCompat, directorEngineKey, aspectRatio],
  );

  const hasPrompt = prompt.trim().length > 0;
  const directorSceneLabel = `${sceneCount} scene${sceneCount > 1 ? "s" : ""}`;
  const directorModelLabel =
    selectedEngine === "auto"
      ? "Auto -> Seedance 2.0 Fast"
      : cleanModelName(engineOptions.find((e) => e.key === selectedEngine)?.label ?? selectedEngine);
  const directorConsole = (
    <div className="overflow-hidden rounded-xl border border-neutral-900/10 bg-neutral-950 text-white shadow-xl shadow-neutral-950/10">
      <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            <Sparkles className="h-3.5 w-3.5" />
            Director Console
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Turn the prompt into an editable shot plan
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/58">
              Review scene prompts, duration, model fit and cost before generation. The classic Generate Video path stays available.
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-3 lg:w-[420px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2">
            <span className="block text-white/40">Plan</span>
            <span className="mt-0.5 block truncate font-semibold text-white">{directorSceneLabel}</span>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2">
            <span className="block text-white/40">Model</span>
            <span className="mt-0.5 block truncate font-semibold text-white">{directorModelLabel}</span>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2">
            <span className="block text-white/40">Readiness</span>
            <span className={`mt-0.5 block font-semibold ${hasPrompt ? "text-emerald-300" : "text-amber-300"}`}>
              {hasPrompt ? "Ready to plan" : "Prompt needed"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row">
        <button
          type="button"
          onClick={openDirector}
          disabled={loading || !hasPrompt}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-bold text-neutral-950 shadow-md shadow-white/10 transition-all hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clapperboard className="h-4 w-4" />
          {directorOpen ? "Refresh Director plan" : "Plan with AI Director"}
        </button>
        <button
          type="submit"
          disabled={loading || !hasPrompt}
          className="flex items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-44"
        >
          <Wand2 className="h-4 w-4" />
          Generate now
        </button>
      </div>
    </div>
  );

  const applyDirectorAction = (action: DirectorAction) => {
    setDirectorScenes((prev) =>
      prev.map((s) => {
        let p = s.prompt;
        let d = s.durationSec;
        const add = (suffix: string) =>
          p.toLowerCase().includes(suffix.split(",")[0].toLowerCase())
            ? p
            : `${p.replace(/[.\s]+$/, "")}. ${suffix}`;
        if (action === "cinematic") p = add("cinematic lighting, shallow depth of field");
        if (action === "realistic") p = add("photorealistic, natural skin texture");
        if (action === "improve") p = add("detailed, coherent, high quality");
        if (action === "tiktok") d = Math.min(d, 5);
        // keep-character: local no-op (driven by the @face chips already in the plan)
        return { ...s, prompt: p, durationSec: d };
      }),
    );
  };

  const imageComposerRefs = composerRefs.filter((r) => r.refType === "image" && r.url);
  const ugcPanelVisible = mode === "product" || mode === "social";
  const findImageRefByRole = (role: ReferenceRole) =>
    imageComposerRefs.find((r) => r.url && composerUploadItems[r.url]?.role === role);
  const productReference = findImageRefByRole("product_reference") ?? imageComposerRefs[0];
  const outfitReference =
    findImageRefByRole("outfit_reference") ??
    imageComposerRefs.find((r) => r.url && r.url !== productReference?.url) ??
    imageComposerRefs[1];
  const ugcPlatformLabel =
    ugcPlatform === "tiktok_reels" ? "TikTok / Reels" : ugcPlatform === "square_feed" ? "Square feed" : "Landscape ad";
  const ugcSocialPreset = getUGCSocialPreset(ugcPlatform);
  const selectedUGCFace =
    byteplusAssets.find((asset) => asset.asset_id === selectedUGCFaceAssetId) ?? byteplusAssets[0];
  const selectedUGCLook = ugcLooks.find((look) => look.id === selectedUGCLookId) ?? ugcLooks[0];
  const selectedUGCAvatar =
    heygenAvatars.find((avatar) => avatar.avatarId === selectedUGCAvatarId) ?? heygenAvatars[0];
  const ugcCreatorLabel =
    ugcCreator === "verified_face"
      ? selectedUGCFace?.name || selectedUGCFace?.asset_id
      : ugcCreator === "saved_look"
        ? selectedUGCLook?.name
        : ugcCreator === "avatar"
          ? selectedUGCAvatar?.name
          : undefined;
  const ugcCreatorSummary =
    ugcCreator === "verified_face"
      ? selectedUGCFace
        ? `Verified face: ${selectedUGCFace.name || "Ready"}`
        : "Add a verified face for identity continuity"
      : ugcCreator === "saved_look"
        ? selectedUGCLook
          ? `Saved Look: ${selectedUGCLook.name}`
          : "Save a Look from an avatar shot first"
        : ugcCreator === "avatar"
          ? selectedUGCAvatar
            ? `Avatar: ${selectedUGCAvatar.name}`
            : heygenAvatarsLoading
              ? "Loading avatars..."
              : "Create an avatar first"
          : "No fixed creator; product-first framing";
  const ugcReadiness = computeUGCReadiness({
    hasProductReference: Boolean(productReference),
    hasOutfitReference: Boolean(outfitReference),
    angle: ugcAngle,
    creator: ugcCreator,
    hasVerifiedFace: Boolean(selectedUGCFace),
    hasSavedLook: Boolean(selectedUGCLook),
    hasAvatar: Boolean(selectedUGCAvatar),
    selectedEngine,
  });
  const ugcReadinessToneClass =
    ugcReadiness.tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
      : ugcReadiness.tone === "medium"
        ? "border-amber-500/35 bg-amber-500/5 text-amber-600"
        : "border-red-500/35 bg-red-500/5 text-red-600";

  const renderUGCIdentityCard = ({
    creator,
    title,
    desc,
    detail,
    thumb,
    Icon,
    disabled = false,
  }: {
    creator: UGCCreator;
    title: string;
    desc: string;
    detail: string;
    thumb?: string | null;
    Icon: typeof User;
    disabled?: boolean;
  }) => {
    const active = ugcCreator === creator;
    return (
      <button
        type="button"
        onClick={() => !disabled && setUgcCreator(creator)}
        disabled={disabled}
        className={`flex min-h-[92px] items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
          active
            ? "border-emerald-500/45 bg-emerald-500/10 shadow-sm"
            : "border-border/50 bg-background hover:border-emerald-500/30 hover:bg-emerald-500/5"
        } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-muted/30">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-4 w-4 text-emerald-500" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-bold text-foreground">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/70">{desc}</span>
          <span className={`mt-1 block truncate text-[10px] font-semibold ${active ? "text-emerald-600" : "text-muted-foreground/55"}`}>
            {detail}
          </span>
        </span>
      </button>
    );
  };

  const ugcIdentityPanel = (
    <div className="mt-4 rounded-xl border border-border/45 bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-foreground">Creator identity</p>
          <p className="text-[11px] text-muted-foreground/60">Choose who carries the product story.</p>
        </div>
        <span className="max-w-[260px] truncate rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">
          {ugcCreatorSummary}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {renderUGCIdentityCard({
          creator: "none",
          title: "Product-first",
          desc: "Hands, lifestyle shots, and natural product framing.",
          detail: "Always available",
          Icon: Sparkles,
        })}
        {renderUGCIdentityCard({
          creator: "verified_face",
          title: "Verified face",
          desc: "Use a verified creator face for continuity.",
          detail: selectedUGCFace ? selectedUGCFace.name || "Ready" : "No face yet",
          thumb: selectedUGCFace?.thumb_url ?? null,
          Icon: User,
          disabled: byteplusAssets.length === 0,
        })}
        {renderUGCIdentityCard({
          creator: "saved_look",
          title: "Saved Look",
          desc: "Reuse a saved cinematic identity as direction.",
          detail: ugcLooksLoading ? "Loading..." : selectedUGCLook ? selectedUGCLook.name : "No Look yet",
          thumb: selectedUGCLook?.thumbnail_url ?? null,
          Icon: Clapperboard,
          disabled: ugcLooks.length === 0,
        })}
        {renderUGCIdentityCard({
          creator: "avatar",
          title: "Avatar",
          desc: "Presenter-style UGC direction with an avatar identity.",
          detail: heygenAvatarsLoading ? "Loading..." : selectedUGCAvatar ? selectedUGCAvatar.name : "No avatar yet",
          thumb: selectedUGCAvatar?.previewUrl ?? null,
          Icon: User,
          disabled: false,
        })}
      </div>
      {ugcCreator === "verified_face" && byteplusAssets.length > 1 && (
        <select
          value={selectedUGCFace?.asset_id ?? ""}
          onChange={(event) => setSelectedUGCFaceAssetId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-emerald-500/40"
        >
          {byteplusAssets.map((asset) => (
            <option key={asset.asset_id} value={asset.asset_id}>{asset.name || asset.asset_id}</option>
          ))}
        </select>
      )}
      {ugcCreator === "saved_look" && ugcLooks.length > 1 && (
        <select
          value={selectedUGCLook?.id ?? ""}
          onChange={(event) => setSelectedUGCLookId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-emerald-500/40"
        >
          {ugcLooks.map((look) => (
            <option key={look.id} value={look.id}>{look.name}</option>
          ))}
        </select>
      )}
      {ugcCreator === "avatar" && heygenAvatars.length > 1 && (
        <select
          value={selectedUGCAvatar?.avatarId ?? ""}
          onChange={(event) => setSelectedUGCAvatarId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-emerald-500/40"
        >
          {heygenAvatars.map((avatar) => (
            <option key={avatar.avatarId} value={avatar.avatarId}>{avatar.name}</option>
          ))}
        </select>
      )}
    </div>
  );

  const renderUGCComposerReferenceSlot = (
    role: Extract<ReferenceRole, "product_reference" | "outfit_reference">,
    title: string,
    hint: string,
    ref: ComposerReference | undefined,
    Icon: typeof Package,
  ) => (
    <label
      className={`group flex min-h-[72px] cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 py-2 transition-colors ${
        ref
          ? "border-emerald-500/35 bg-emerald-500/5"
          : "border-border/50 bg-muted/20 hover:border-emerald-500/35 hover:bg-emerald-500/5"
      } ${composerUploading || loading ? "pointer-events-none opacity-70" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) void handleComposerUpload(file, role);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={composerUploading || loading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleComposerUpload(file, role);
          event.target.value = "";
        }}
      />
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-background">
        {ref?.thumb || ref?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(ref.thumb || ref.url) as string} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-4 w-4 text-emerald-500" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-foreground">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground/65">
          {ref ? `@${ref.label}` : hint}
        </span>
      </span>
    </label>
  );

  const ugcComposerReferenceSlots = ugcPanelVisible ? (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      {renderUGCComposerReferenceSlot("product_reference", "Product reference", "Upload or drop product image", productReference, Package)}
      {renderUGCComposerReferenceSlot("outfit_reference", "Outfit / style", "Upload or drop outfit image", outfitReference, Shirt)}
    </div>
  ) : null;

  const buildUGCPlan = () => {
    const productLabel = productReference?.label ?? "product";
    const productPlaceholder = productReference?.placeholder ?? "image 1";
    const outfitLabel = outfitReference?.label ?? "outfit";
    const outfitPlaceholder = outfitReference?.placeholder ?? "image 2";
    const plan = buildUGCDirectorPlan({
      product: { label: productLabel, placeholder: productPlaceholder },
      outfit: outfitReference ? { label: outfitLabel, placeholder: outfitPlaceholder } : null,
      angle: ugcAngle,
      platform: ugcPlatform,
      creator: ugcCreator,
      creatorLabel: ugcCreatorLabel,
      productName: ugcProductName,
      keyBenefit: ugcBenefit,
      tone: ugcTone,
    });
    const maxDirectorScenes = Math.max(1, Math.min(planMaxScenes, Math.floor(planMaxDuration / 3) || 1));
    const cappedScenes = plan.scenes.slice(0, maxDirectorScenes);
    const modelName =
      selectedEngine === "auto"
        ? "Auto"
        : cleanModelName(engineOptions.find((e) => e.key === selectedEngine)?.label ?? selectedEngine);
    const assets = [
      ...(productReference
        ? [{ kind: "image" as const, label: productReference.placeholder, thumb: productReference.thumb ?? null }]
        : []),
      ...(outfitReference
        ? [{ kind: "style" as const, label: outfitReference.placeholder, thumb: outfitReference.thumb ?? null }]
        : []),
      ...composerRefs
        .filter((r) => r.refType === "face")
        .map((r) => ({ kind: "face" as const, label: r.label, thumb: r.thumb ?? null })),
    ];

    setAspectRatio(plan.aspectRatio);
    setCaptionMode(plan.social.captionMode);
    setDuration(String(Math.min(planMaxDuration, cappedScenes.reduce((sum, s) => sum + s.durationSec, 0))));
    setNumScenes(cappedScenes.length);
    setPrompt(plan.prompt);
    setDirectorScenes(
      cappedScenes.map((scene, index) => ({
        index,
        title: scene.title,
        prompt: scene.prompt,
        durationSec: scene.durationSec,
        camera: scene.role === "demo" ? "close-up demo" : scene.role === "hook" ? "fast hook" : undefined,
        assets: assets.filter((asset) => scene.assetChips.includes(asset.label) || asset.kind === "face"),
        recommendedModel: modelName,
        notes:
          !productReference
            ? ["add a product image for stronger visual grounding"]
            : scene.role === "style"
              ? ["outfit is a style reference, not exact try-on"]
              : undefined,
      })),
    );
    setDirectorOpen(true);
  };

  const ugcPanel = ugcPanelVisible ? (
    <div className="rounded-2xl border border-emerald-500/25 bg-card px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
            <ShoppingBag className="h-3.5 w-3.5" />
            UGC Studio
          </div>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground">
            Build a creator-style product plan
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Uses your first image as the product reference and the second image as outfit/style.
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs lg:w-56">
          <span className="block text-muted-foreground/60">References</span>
          <span className={`mt-0.5 block font-semibold ${productReference ? "text-emerald-500" : "text-amber-500"}`}>
            {productReference ? `${productReference.label}${outfitReference ? ` + ${outfitReference.label}` : ""}` : "Product image needed"}
          </span>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border px-3 py-3 ${ugcReadinessToneClass}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold text-foreground">
              {ugcReadiness.tone === "risky" ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              UGC readiness
            </p>
            <p className="mt-1 text-sm font-semibold">{ugcReadiness.label}</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground/70">
              {ugcReadiness.detail}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 md:justify-end">
            {ugcReadiness.checks.map((check) => (
              <span
                key={check.label}
                className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                  check.ok
                    ? "border-emerald-500/25 bg-background text-emerald-600"
                    : "border-border/50 bg-background text-muted-foreground/55"
                }`}
              >
                {check.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <input
          value={ugcProductName}
          onChange={(e) => setUgcProductName(e.target.value)}
          placeholder="Product name"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-500/40"
        />
        <input
          value={ugcBenefit}
          onChange={(e) => setUgcBenefit(e.target.value)}
          placeholder="Main benefit"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-500/40"
        />
        <input
          value={ugcTone}
          onChange={(e) => setUgcTone(e.target.value)}
          placeholder="Tone"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-500/40"
        />
      </div>

      {ugcIdentityPanel}

      <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Share2 className="h-3.5 w-3.5 text-violet-500" />
              Social Pack preset
            </p>
            <p className="mt-1 text-sm font-semibold text-violet-600 dark:text-violet-300">
              {ugcSocialPreset.label}
            </p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground/70">
              {ugcSocialPreset.metadataBrief}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 md:justify-end">
            {ugcSocialPreset.primaryFormats.map((format) => (
              <span key={format} className="rounded-full border border-violet-500/25 bg-background px-2 py-1 text-[10px] font-semibold text-violet-600">
                {format}
              </span>
            ))}
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2 py-1 text-[10px] font-semibold text-emerald-600">
              Captions auto
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ugcSocialPreset.hashtagHints.map((tag) => (
            <span key={tag} className="text-[10px] font-medium text-muted-foreground/60">{tag}</span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={ugcAngle}
            onChange={(e) => setUgcAngle(e.target.value as UGCAngle)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-500/40"
          >
            <option value="product_demo">Product demo</option>
            <option value="testimonial">Testimonial</option>
            <option value="unboxing">Unboxing</option>
            <option value="try_on">Try-on / outfit</option>
            <option value="before_after">Before / after</option>
            <option value="founder_pitch">Founder pitch</option>
          </select>
          <select
            value={ugcPlatform}
            onChange={(e) => setUgcPlatform(e.target.value as UGCPlatform)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-500/40"
          >
            <option value="tiktok_reels">TikTok / Reels</option>
            <option value="square_feed">Square feed</option>
            <option value="landscape_ad">Landscape ad</option>
          </select>

        </div>
        <button
          type="button"
          onClick={buildUGCPlan}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/15 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clapperboard className="h-4 w-4" />
          Build UGC Director plan
        </button>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground/55">
        Plan target: {ugcPlatformLabel}. Product/outfit references stay attached through the existing image chips.
      </p>
    </div>
  ) : null;

  // Unified control row: Model · Duration · Format · Scenes (CTO mockup).
  const modelBlock = (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Model */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Cpu className="h-3.5 w-3.5 text-indigo-500" /> Model
          </label>
          <select
            value={selectedEngine}
            onChange={(e) => setSelectedEngine(e.target.value as EngineKey | "auto")}
            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
          >
            <option value="auto">Auto — best for your plan</option>
            {engineOptions.map((opt) => {
              const locked =
                (opt.gate === "premium" && plan !== "premium") ||
                (opt.gate === "pro" && plan === "free");
              const tags = [
                opt.quality === "1080p" ? "HD" : null,
                opt.supportsRefs ? "Refs" : null,
                locked ? `${opt.gate === "premium" ? "Premium" : "Pro"} only 🔒` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <option key={opt.key} value={opt.key} disabled={locked}>
                  {getEngineIntention(opt)} — {cleanModelName(opt.label)}
                  {tags ? ` · ${tags}` : ""}
                </option>
              );
            })}
          </select>
          {selectedEngine !== "auto" && (
            <p className="mt-1 text-[10px] text-muted-foreground/50">
              Powered by {cleanModelName(engineOptions.find((e) => e.key === selectedEngine)?.label ?? selectedEngine)}
            </p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Clock className="h-3.5 w-3.5 text-amber-500" /> Duration
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={!planLoaded}
            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
          >
            {durationOptions.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
                {o.locked ? " 🔒" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Format */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Monitor className="h-3.5 w-3.5 text-blue-500" /> Format
          </label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as "16:9" | "9:16" | "1:1")}
            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
          >
            <option value="16:9">Landscape (16:9)</option>
            <option value="9:16">Portrait (9:16)</option>
            <option value="1:1">Square (1:1)</option>
          </select>
        </div>

        {/* Scenes */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Film className="h-3.5 w-3.5 text-purple-500" /> Scenes
          </label>
          {plan !== "free" && planLoaded && sceneCountChoices.length > 0 ? (
            <select
              value={numScenes === "auto" ? "auto" : String(sceneCount)}
              onChange={(e) =>
                setNumScenes(e.target.value === "auto" ? "auto" : parseInt(e.target.value, 10))
              }
              className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
            >
              <option value="auto">Auto ({autoSceneCount})</option>
              {sceneCountChoices.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm text-muted-foreground/60">
              1 (Auto)
            </div>
          )}
        </div>
      </div>

      {/* Hints under the control row */}
      {selectedEngine !== "auto" &&
        engineHealth[selectedEngine] !== undefined &&
        engineHealth[selectedEngine] !== -1 &&
        engineHealth[selectedEngine] < 0.6 && (
          <p className="text-[11px] text-amber-500">
            ⚠ This model has a low success rate right now ({Math.round(engineHealth[selectedEngine] * 100)}% / 24h) — consider another.
          </p>
        )}
      {plan !== "premium" && (
        <Link
          href="/pricing"
          className="flex items-center gap-1.5 text-xs font-medium text-primary/80 transition-colors hover:text-primary"
        >
          <Lock className="h-3.5 w-3.5" />
          {plan === "free" ? "Unlock longer videos & advanced models" : "Get up to 120s"}
        </Link>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full bg-[#f6f6f2]">
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
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
        <Link
          href="/create"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-7 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="flex items-start gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ${config.iconBg}`}>
                <config.icon className="h-7 w-7" />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
                  <Sparkles className="h-3.5 w-3.5" />
                  Production brief
                </div>
                <h1 className="text-4xl font-semibold leading-tight tracking-tight text-neutral-950 sm:text-5xl">
                  {config.title}
                </h1>
                <p className="mt-2 max-w-2xl text-base leading-7 text-neutral-600">
                  {config.subtitle}
                </p>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-3 lg:w-[420px]">
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
                <span className="block text-neutral-500">Plan</span>
                <span className="mt-0.5 block font-semibold text-neutral-950">{planLoaded ? plan : "Loading"}</span>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
                <span className="block text-neutral-500">Format</span>
                <span className="mt-0.5 block font-semibold text-neutral-950">{aspectRatio}</span>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
                <span className="block text-neutral-500">Scenes</span>
                <span className="mt-0.5 block font-semibold text-neutral-950">{directorSceneLabel}</span>
              </div>
            </div>
          </div>

          {/* T-1130b — story-only guided start: visible, functional choices wired to
              existing state (references panel / AI Director). Hidden for product/social. */}
          {mode === "story" && (
            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold text-neutral-700">How do you want to start?</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  { key: "text", title: "Text to Video", hint: "Describe a scene, then generate.", Icon: Type },
                  {
                    key: "reference",
                    title: "Text with Reference",
                    hint: "Guide it with visual references.",
                    Icon: ImagePlus,
                    count: Object.keys(references).length,
                  },
                  { key: "director", title: "Director scenes", hint: "Plan a multi-scene sequence.", Icon: Clapperboard },
                ] as Array<{
                  key: "text" | "reference" | "director";
                  title: string;
                  hint: string;
                  Icon: typeof Type;
                  count?: number;
                }>).map(({ key, title, hint, Icon, count }) => {
                  const active = storyTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setStoryTab(key);
                        if (key === "reference") setShowReferences(true);
                        if (key === "text") setShowReferences(false);
                        if (key === "director") setDirectorOpen(true);
                      }}
                      className={`group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                        active
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-neutral-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          active ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                          {title}
                          {typeof count === "number" && count > 0 && (
                            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {count}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-neutral-500">{hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
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
              {/* Composer toolbar: insert media references */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label
                  className={`flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors ${
                    composerUploading
                      ? "cursor-wait opacity-70"
                      : "cursor-pointer hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={composerUploading || loading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleComposerUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {composerUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  Upload image
                </label>
                <span className="text-xs text-muted-foreground/50">
                  or type <span className="font-medium text-foreground/70">@</span> to insert a saved face / image
                </span>
              </div>
              {ugcComposerReferenceSlots}
              {referencePrefillStatus !== "idle" && (
                <div className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                  referencePrefillStatus === "error"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-violet-500/30 bg-violet-500/5 text-violet-500"
                }`}>
                  {referencePrefillStatus === "loading" ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                  ) : referencePrefillStatus === "ready" ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  )}
                  <span>
                    {referencePrefillStatus === "loading" && "Preparing reference from your previous video..."}
                    {referencePrefillStatus === "ready" && "Reference added. Edit the prompt or generate when ready."}
                    {referencePrefillStatus === "error" && "Could not prepare the reference automatically. You can still upload one manually."}
                  </span>
                </div>
              )}
              {isBytePlus2Selected && composerRefs.some((r) => r.refType === "image" && r.url) && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-300/90">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Seedance 2.0 <strong>rejects raw photos of real people</strong>.
                    For a person, insert your <strong>verified face</strong> (@) instead — or
                    switch to a model that accepts uploaded face photos.
                  </span>
                </div>
              )}
              <div className="relative">
                <PromptComposer
                  ref={composerRef}
                  placeholder={config.placeholder}
                  onChange={(out) => {
                    setPrompt(out.prompt);
                    setComposerRefs(out.references);
                  }}
                  suggestions={[
                    ...byteplusAssets.map((a) => ({
                      refType: "face" as const,
                      label: a.name || a.asset_id,
                      assetId: a.asset_id,
                      provider: "byteplus",
                      thumb: a.thumb_url ?? null,
                    })),
                    ...composerUploads,
                  ]}
                />
                <span className={`pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums ${prompt.length > 1800 ? "text-amber-500 font-medium" : "text-muted-foreground/40"}`}>
                  {prompt.length}/2000
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setPrompt(ex);
                      setComposerRefs([]);
                      composerRef.current?.setText(ex);
                    }}
                    disabled={loading}
                    className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-40"
                  >
                    {ex.length > 40 ? ex.slice(0, 40) + "..." : ex}
                  </button>
                ))}
              </div>
            </div>

            {ugcPanel}

            {/* ── Model (promoted out of Advanced) ───────────────── */}
            {planLoaded && modelBlock}

            {/* AI Director Console */}
            {directorConsole}

            {directorOpen && (
              <AIDirectorPanel
                scenes={directorScenes}
                quality={directorQuality}
                generating={loading}
                onSceneChange={(index, patch) =>
                  setDirectorScenes((prev) => prev.map((s) => (s.index === index ? { ...s, ...patch } : s)))
                }
                onAction={applyDirectorAction}
                onClose={() => setDirectorOpen(false)}
                onGenerate={() => {
                  setDirectorOpen(false);
                  submitJob({ directorScenes });
                }}
              />
            )}

            {/* ── References (collapsed by default; advanced inputs) ──── */}
            <div className="rounded-xl border border-border/40">
              <button
                type="button"
                onClick={() => setShowReferences((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground"
              >
                <span className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-violet-500" />
                  Reference image &amp; style
                  <span className="text-muted-foreground/50 font-normal text-xs">(optional)</span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showReferences ? "rotate-180" : ""}`} />
              </button>
              {showReferences && (
                <div className="space-y-5 border-t border-border/40 px-4 py-4">
            {/* ── Reference Image (I2V) ──────────────────────────── */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-violet-500" />
                Reference image <span className="text-muted-foreground/50 font-normal text-xs">(optional)</span>
              </p>
              {imagePreview ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                </div>
              )}
            </div>

            {/* ── Avatar picker (HeyGen models only) ───────────────── */}
            {isHeyGenEngineSelected && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Avatar <span className="text-rose-500">*</span>
                  </span>
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Avatar mode · lower cost
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

            {/* ── Your verified faces (mobile fallback; desktop uses the right Assets panel) ── */}
            {isBytePlus2Selected && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 lg:hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Your faces
                  </span>
                  <span className="text-[11px] text-muted-foreground/50">
                    Click a face to add it to your prompt
                  </span>
                </div>
                <FacesManager
                  faces={byteplusAssets}
                  loading={byteplusAssetsLoading}
                  onReload={loadByteplusAssets}
                  compat={faceCompat(engineCompat)}
                  onInsert={(f) =>
                    composerRef.current?.insertRef({
                      refType: "face",
                      label: f.name || "face",
                      assetId: f.asset_id,
                      provider: "byteplus",
                      thumb: f.thumb_url ?? null,
                    })
                  }
                />
              </div>
            )}

            {/* ── Duration ───────────────────────────────────────── */}
            {/* (Duration · Format · Scenes moved into the unified control row at the top) */}

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

              // Avatar models use the connected avatar wallet.
              if (isHeyGenEngineSelected) {
                return (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-start gap-3">
                    <Wallet className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-500">
                        Avatar credits - low-cost scene mode
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Optimized for talking avatar scenes. Billed against the connected avatar wallet.
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
                return (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3 flex items-start gap-3">
                    <Wallet className="h-5 w-5 shrink-0 mt-0.5 text-violet-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-violet-500">
                        Seedance 2.0 - estimated generation cost
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
                        External generation credits
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        No automatic balance check is available for this model.
                        Verify the connected wallet before launching.
                      </p>
                      <a
                        href="https://bailian.console.alibabacloud.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
                      >
                        <ExternalLink className="h-3 w-3" /> Open credit console
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
                          Generation credits running low: {adminCredits.remaining.toFixed(1)} remaining
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
                      <ExternalLink className="h-3 w-3" /> Top up credits
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Generate CTA (skip path) ───────────────────────── */}
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
      <div className="hidden w-80 flex-col border-l border-neutral-200 bg-white/70 p-6 lg:flex">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col h-full"
        >
          <AssetPanel
            faces={byteplusAssets}
            facesLoading={byteplusAssetsLoading}
            onReloadFaces={loadByteplusAssets}
            uploads={composerUploads}
            onUploadImage={handleComposerUpload}
            uploading={composerUploading}
            engineCompat={engineCompat}
            onInsert={(m) => composerRef.current?.insertRef(m)}
          />
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

