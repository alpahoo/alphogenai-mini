"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Wand2,
  Clock,
  Cpu,
  Crown,
  ArrowLeft,
  Plus,
  ClipboardCopy,
  Layers,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CopyPlus,
  Share2,
  Volume2,
  ExternalLink,
  Wallet,
  Clapperboard,
  Link2,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/workspace/sidebar";
import { JobCostBadge } from "@/components/job/JobCostBadge";
import { SocialExportPanel } from "@/components/job/social-export-panel";
import { SHOW_COST_TRACKING_UI, isAdminEmail } from "@/lib/flags";
import { useJobRealtime } from "@/lib/use-job-realtime";
import type { Job, JobScene } from "@/lib/types";
import { buildStageOrder, getEngineDisplayName } from "@/lib/types";
import { cleanModelName } from "@/lib/engine-intentions";
import { SceneTimeline, ScenePanel } from "@/components/editor";

// Reduced from 5s → 15s now that Realtime handles UI freshness.
// The poll still drives the EvoLink state machine (scene advancement).
const POLL_INTERVAL = 15_000;

/** Provider dashboard URLs for topping up credits */
const PROVIDER_TOP_UP: Record<string, { url: string; label: string }> = {
  evolink: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  evolink_fast: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  kling_o3: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  kling_v3: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  wan_26: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  wan_27: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  happy_horse_10: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  hailuo: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  hailuo_fast: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  sora_2: { url: "https://evolink.ai/fr/dashboard/credits", label: "EvoLink" },
  wan_26_bailian: { url: "https://bailian.console.alibabacloud.com/", label: "Alibaba Bailian" },
  wan_27_bailian: { url: "https://bailian.console.alibabacloud.com/", label: "Alibaba Bailian" },
};

function isInsufficientCreditsError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return lower.includes("insufficient_quota") || lower.includes("insufficient credits") || lower.includes("insufficient balance");
}

// ---------------------------------------------------------------------------
// Stage labels — premium, user-friendly
// ---------------------------------------------------------------------------
const FRIENDLY_STAGES: Record<string, string> = {
  queued: "In queue...",
  spawning_pipeline: "Preparing your pipeline...",
  encoding: "Encoding final video...",
  uploading: "Uploading result...",
  generating_audio: "Generating audio...",
  muxing_audio: "Mixing audio...",
  completed: "Complete",
  failed: "Failed",
};

/** Resolve stage label — supports dynamic `generating_scene_N` patterns. */
function getStageFriendlyLabel(stage: string | null): string {
  if (!stage) return "Processing...";
  if (FRIENDLY_STAGES[stage]) return FRIENDLY_STAGES[stage];
  const match = stage.match(/^generating_scene_(\d+)$/);
  if (match) return `Generating scene ${match[1]}...`;
  return stage;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec.toString().padStart(2, "0")}s` : `${sec}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// sceneStatusIcon moved to SceneTimeline component

// ---------------------------------------------------------------------------
// Human-readable error messages
// ---------------------------------------------------------------------------
function friendlyError(raw: string | null | undefined): string {
  if (!raw) return "Something went wrong during generation. This can happen due to high demand or temporary issues.";
  const msg = raw.toLowerCase();
  if (
    msg.includes("content rights") ||
    msg.includes("third-party") ||
    msg.includes("third party") ||
    msg.includes("trademark") ||
    msg.includes("copyright") ||
    msg.includes("brand logo") ||
    msg.includes("copyrighted ip")
  )
    return "Your prompt may reference copyrighted content (brand names, logos, movie characters, celebrities). Rephrase with generic descriptions and try again.";
  if (
    msg.includes("privacyinformation") ||
    msg.includes("real person") ||
    msg.includes("inputimagesensitive")
  )
    return "Seedance 2.0 blocks uploaded photos that look like a real person. To put a person in the scene, use your VERIFIED face (type @ in the prompt and pick the face tagged “face”) — or switch to a model that accepts uploaded face photos directly.";
  if (msg.includes("nsfw") || msg.includes("unsafe") || msg.includes("policy violation"))
    return "Your prompt was flagged by the safety filter. Try rephrasing with different wording.";
  if (msg.includes("insufficient_quota") || msg.includes("insufficient credits"))
    return "Insufficient credits on the generation account. Please contact support.";
  if (msg.includes("exceeded 2 hour") || msg.includes("exceeded 30 minute"))
    return "Generation timed out — the model took too long. Please try again.";
  if (msg.includes("timeout"))
    return "Generation timed out. Please try again.";
  if (msg.includes("invalid model") || msg.includes("model not found"))
    return "The selected model is currently unavailable. Try a different model.";
  if (msg.includes("rate limit") || msg.includes("too many requests"))
    return "Rate limit reached. Please wait a moment and try again.";
  if (msg.includes("pipeline not configured"))
    return "Generation pipeline not configured. Please contact support.";
  return "Generation failed. See details below.";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function JobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // Workspace shell state
  const [plan, setPlan] = useState("free");
  const [email, setEmail] = useState<string | null>(null);
  const [shellReady, setShellReady] = useState(false);

  // Job state
  const [job, setJob] = useState<Job | null>(null);
  const [scenes, setScenes] = useState<JobScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryingScenes, setRetryingScenes] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const voiceoverRef = useRef<HTMLAudioElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);

  // Admin credit balance
  const [adminCredits, setAdminCredits] = useState<{ remaining: number; status: string } | null>(null);

  // Social connections — declared before any conditional returns (Rules of Hooks)
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const [socialToast, setSocialToast] = useState<string | null>(null);
  const [overlayBusy, setOverlayBusy] = useState(false);

  // ── Detect OAuth callback redirect (youtube_connected=true etc) ────────
  const searchParams = useSearchParams();
  useEffect(() => {
    const ytOk = searchParams.get("youtube_connected");
    const ytErr = searchParams.get("youtube_error");
    const ttOk = searchParams.get("tiktok_connected");
    const ttErr = searchParams.get("tiktok_error");
    const igOk = searchParams.get("instagram_connected");
    const igErr = searchParams.get("instagram_error");

    if (ytOk === "true") {
      setSocialToast("YouTube connected successfully!");
      setYoutubeConnected(true);
    } else if (ytErr) {
      setSocialToast(`YouTube connection failed: ${ytErr}`);
    }
    if (ttOk === "true") {
      setSocialToast("TikTok connected successfully!");
      setTiktokConnected(true);
    } else if (ttErr) {
      setSocialToast(`TikTok connection failed: ${ttErr}`);
    }
    if (igOk === "true") {
      setSocialToast("Instagram connected successfully!");
      setInstagramConnected(true);
    } else if (igErr) {
      setSocialToast(`Instagram connection failed: ${igErr}`);
    }

    // Auto-dismiss toast
    if (ytOk || ytErr || ttOk || ttErr || igOk || igErr) {
      const t = setTimeout(() => setSocialToast(null), 5000);
      // Clean URL params without navigation
      window.history.replaceState({}, "", window.location.pathname);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // ── Check social connections (must be before conditional returns) ────────
  useEffect(() => {
    if (!email) return;
    const sb = createClient();
    sb.from("social_connections")
      .select("platform, channel_name")
      .then(({ data }) => {
        const names: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row.platform === "youtube") setYoutubeConnected(true);
          if (row.platform === "tiktok") setTiktokConnected(true);
          if (row.platform === "instagram") setInstagramConnected(true);
          if (row.channel_name) names[row.platform] = row.channel_name;
        }
        setChannelNames(names);
      });
  }, [email]);

  // ── Fetch admin credit balance ──────────────────────────────
  useEffect(() => {
    if (!email || !isAdminEmail(email)) return;
    fetch("/api/admin/credits")
      .then((r) => r.json())
      .then((data) => {
        const ev = data.providers?.evolink;
        if (ev && typeof ev.remaining === "number") {
          setAdminCredits({ remaining: ev.remaining, status: ev.status });
        }
      })
      .catch(() => {}); // Non-fatal
  }, [email]);

  // ── Realtime subscription (instant UI updates) ─────────────
  const isJobActive = job ? (job.status === "pending" || job.status === "in_progress") : false;

  useJobRealtime(
    params.id,
    // Job row changed — merge into state
    useCallback((updated: Partial<Job>) => {
      setJob((prev) => prev ? { ...prev, ...updated } as Job : prev);
    }, []),
    // Scene row changed — merge into scenes array
    useCallback((updated: Partial<JobScene>) => {
      if (updated.scene_index == null) return;
      setScenes((prev) => {
        const idx = prev.findIndex((s) => s.scene_index === updated.scene_index);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updated } as JobScene;
          return next;
        }
        // New scene (INSERT) — append
        return [...prev, updated as JobScene];
      });
    }, []),
    isJobActive // only subscribe while job is in flight
  );

  // ── Load user for sidebar + auth gate ───────────────────────
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?next=/jobs/${params.id}`);
        return;
      }

      setEmail(user.email ?? null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();
      if (profile?.plan) setPlan(profile.plan);
      setAuthState("ok");
      setShellReady(true);
    }
    load();
  }, [router, params.id]);

  // ── Fetch job ───────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${params.id}`);
      if (!res.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Server error — retrying...");
      }
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) { setAuthState("denied"); return "error"; }
        throw new Error(data.error || "Failed to fetch job");
      }
      setJob(data.job);
      if (data.scenes) setScenes(data.scenes);
      setLoading(false);
      return data.job.status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      return "error";
    }
  }, [params.id]);

  // ── Polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (authState !== "ok") return;
    let interval: NodeJS.Timeout | null = null;
    const start = async () => {
      const s = await fetchJob();
      if (s === "done" || s === "failed" || s === "error") return;
      interval = setInterval(async () => {
        const st = await fetchJob();
        if (st === "done" || st === "failed" || st === "error") {
          if (interval) clearInterval(interval);
        }
      }, POLL_INTERVAL);
    };
    start();
    return () => { if (interval) clearInterval(interval); };
  }, [fetchJob, authState]);

  // ── Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (!job) return;
    const isTerminal = job.status === "done" || job.status === "failed";
    const created = new Date(job.created_at).getTime();
    if (isTerminal) {
      setElapsed(Math.round((new Date(job.updated_at).getTime() - created) / 1000));
      return;
    }
    const tick = () => setElapsed(Math.round((Date.now() - created) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [job]);

  // ── Auto-highlight scene as video plays ────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !scenes.length || scenes.length <= 1) return;
    const onTimeUpdate = () => {
      const t = video.currentTime;
      let cumulative = 0;
      for (let i = 0; i < scenes.length; i++) {
        cumulative += scenes[i]?.duration_sec ?? 5;
        if (t < cumulative) {
          setSelectedSceneIndex(i);
          return;
        }
      }
      setSelectedSceneIndex(scenes.length - 1);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [scenes]);

  // ── Sync voice-over audio with video playback ─────────────
  useEffect(() => {
    const video = videoRef.current;
    const audio = voiceoverRef.current;
    if (!video || !audio) return;

    const syncPlay = () => { if (voiceoverEnabled) audio.play().catch(() => {}); };
    const syncPause = () => { audio.pause(); };
    const syncSeek = () => { audio.currentTime = video.currentTime; };

    video.addEventListener("play", syncPlay);
    video.addEventListener("pause", syncPause);
    video.addEventListener("seeked", syncSeek);

    return () => {
      video.removeEventListener("play", syncPlay);
      video.removeEventListener("pause", syncPause);
      video.removeEventListener("seeked", syncSeek);
    };
  }, [voiceoverEnabled, job?.voiceover_url]);

  const copyLink = (u: string) => { navigator.clipboard.writeText(u); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyPrompt = (t: string) => { navigator.clipboard.writeText(t); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 2000); };
  // Research-backed jobs: apply the deterministic post-production overlay
  // (captions/lower-third/source cards/brand). Falls back cleanly server-side.
  const applyOverlay = async () => {
    setOverlayBusy(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/overlay`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSocialToast("Branding applied to your video.");
        await fetchJob();
      } else if (data.fallback) {
        setSocialToast("Branding unavailable right now — original video kept.");
      } else {
        setSocialToast(data.error || "Could not apply branding.");
      }
    } catch {
      setSocialToast("Could not apply branding.");
    } finally {
      setOverlayBusy(false);
    }
  };
  const shareVideo = () => {
    const shareUrl = `${window.location.origin}/v/${params.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleToggleFavorite = async () => {
    if (!job || favoriteSaving) return;
    const nextFavorite = !job.is_favorite;
    setFavoriteSaving(true);
    setJob((prev) => prev ? { ...prev, is_favorite: nextFavorite } : prev);
    try {
      const res = await fetch(`/api/jobs/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: nextFavorite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update favorite");
      setJob((prev) => prev ? { ...prev, is_favorite: Boolean(data.is_favorite) } : prev);
    } catch (err) {
      setJob((prev) => prev ? { ...prev, is_favorite: !nextFavorite } : prev);
      setError(err instanceof Error ? err.message : "Could not update favorite");
    } finally {
      setFavoriteSaving(false);
    }
  };

  const handleRetry = async () => {
    if (retrying || !params.id) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (data.jobId) router.push(`/jobs/${data.jobId}`);
      else setError(data.error || "Retry failed");
    } catch { setError("Retry failed"); }
    setRetrying(false);
  };

  const handleDuplicate = async () => {
    if (duplicating || !params.id) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (data.jobId) router.push(`/jobs/${data.jobId}`);
      else setError(data.error || "Duplicate failed");
    } catch { setError("Duplicate failed"); }
    setDuplicating(false);
  };

  const [savingLook, setSavingLook] = useState(false);
  const [lookSaved, setLookSaved] = useState(false);
  const [savedLookId, setSavedLookId] = useState<string | null>(null);
  const handleSaveLook = async () => {
    if (savingLook || !params.id) return;
    setSavingLook(true);
    try {
      const res = await fetch("/api/looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: params.id }),
      });
      const data = await res.json();
      if (data.success && data.look?.id) {
        setLookSaved(true);
        setSavedLookId(data.look.id);
      } else {
        setError(data.error || "Could not save Look");
      }
    } catch { setError("Could not save Look"); }
    setSavingLook(false);
  };

  const handleRetryScenes = async () => {
    if (retryingScenes || !params.id) return;
    setRetryingScenes(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/retry-scenes`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // Reset local state — the poller will pick up the new status
        setJob((prev) => prev ? { ...prev, status: "in_progress", error_message: null } as Job : prev);
        setScenes((prev) => prev.map((s) =>
          s.status === "failed" ? { ...s, status: "pending", error_message: null } : s
        ));
        fetchJob();
      } else {
        setError(data.error || "Retry failed");
      }
    } catch { setError("Retry failed"); }
    setRetryingScenes(false);
  };

  // ── Seek video to scene start ──────────────────────────────
  const handleSceneSelect = useCallback(
    (index: number) => {
      setSelectedSceneIndex(index);
      if (!videoRef.current || !scenes.length) return;
      // Calculate cumulative start time for the selected scene
      let startTime = 0;
      for (let i = 0; i < index; i++) {
        startTime += scenes[i]?.duration_sec ?? 5;
      }
      videoRef.current.currentTime = startTime;
      videoRef.current.play().catch(() => {});
    },
    [scenes],
  );

  // ── Scene edit callbacks ───────────────────────────────────
  const handlePromptSaved = useCallback(
    (index: number, newPrompt: string) => {
      setScenes((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], prompt: newPrompt };
        return next;
      });
    },
    [],
  );

  const handleSceneRegenerate = useCallback(() => {
    // Refresh the job to pick up new status (in_progress)
    fetchJob();
  }, [fetchJob]);

  const handleClosePanel = useCallback(() => {
    setSelectedSceneIndex(-1);
  }, []);

  // stageOrder/stageIdx/stageLabel moved below sceneCount

  // ── Render ──────────────────────────────────────────────────
  if (!shellReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (authState === "denied") {
    return (
      <div className="flex h-screen">
        <Sidebar plan={plan} email={email} />
        <main className="flex-1 flex items-center justify-center px-8">
          <div className="text-center max-w-sm">
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
            <h2 className="text-lg font-semibold mb-1">Not found</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This project doesn&apos;t exist or you don&apos;t have access.
            </p>
            <Link href="/projects" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Back to projects
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const isActive = job ? (job.status === "pending" || job.status === "in_progress") : false;
  const isDone = job?.status === "done";
  const isAdmin = isAdminEmail(email);
  const isFailed = job?.status === "failed";
  const videoUrl = job ? (job.output_url_final || job.video_url) : null;
  const sceneCount = scenes.length || (job?.storyboard ? job.storyboard.length : 1);
  const failedScenes = scenes.filter((s) => s.status === "failed");
  const doneScenes = scenes.filter((s) => s.status === "done");
  const hasRetryableScenes = failedScenes.length > 0 && doneScenes.length > 0;
  const stageOrder = buildStageOrder(sceneCount);
  const stageIdx = job?.current_stage ? stageOrder.indexOf(job.current_stage) : 0;
  const stageLabel = job?.current_stage ? getStageFriendlyLabel(job.current_stage) : "In queue...";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar plan={plan} email={email} />

      {/* Social connection toast */}
      {socialToast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-lg ${
            socialToast.includes("failed") || socialToast.includes("error")
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-green-500/30 bg-green-500/10 text-green-400"
          }`}
        >
          {socialToast}
        </motion.div>
      )}

      <main className="flex-1 flex overflow-hidden bg-[#f5f3ee]">
        {/* ═══ LEFT: Main content ═══════════════════════════════ */}
        <div className="flex-1 overflow-y-auto px-6 py-7 lg:px-10">
          <Link
            href="/projects"
            className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error || !job ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="mb-4 h-10 w-10 text-destructive/50" />
              <p className="text-sm text-muted-foreground mb-4">{error ?? "Could not load project."}</p>
              <Link href="/create" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Wand2 className="h-4 w-4" /> Create new video
              </Link>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-7xl space-y-6"
            >
              {/* ── ACTIVE ──────────────────────────────────── */}
              {isActive && (
                <div className="rounded-2xl border border-border/50 bg-card/80 p-8 backdrop-blur-sm">
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                      <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold mb-1">{stageLabel}</h2>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Your video is being generated.{" "}
                      {sceneCount <= 1
                        ? "This usually takes 3–5 minutes."
                        : sceneCount <= 5
                          ? `Generating ${sceneCount} scenes — estimated ${sceneCount * 4}–${sceneCount * 6} minutes.`
                          : `Generating ${sceneCount} scenes — this may take ${Math.round(sceneCount * 4 / 60 * 10) / 10}–${Math.round(sceneCount * 6 / 60 * 10) / 10} hours. You can close this page and check back later.`}
                    </p>
                    {/* Scene progress: X/Y done */}
                    {scenes.length > 1 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {doneScenes.length}/{scenes.length} scenes completed
                      </p>
                    )}
                    <div className="mt-6 w-full max-w-sm">
                      <div className="flex gap-1">
                        {stageOrder.map((_, i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= stageIdx ? "bg-primary" : "bg-muted"}`} />
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>Step {Math.max(stageIdx + 1, 1)}/{stageOrder.length}</span>
                        <span className="tabular-nums">{formatTime(elapsed)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SCENE FAILURE ALERT (during generation) ───── */}
              {isActive && failedScenes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-400">
                        {failedScenes.length} scene{failedScenes.length > 1 ? "s" : ""} failed
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Scene{failedScenes.length > 1 ? "s" : ""}{" "}
                        {failedScenes.map((s) => s.scene_index + 1).join(", ")}{" "}
                        encountered an error. The remaining scenes will continue generating.
                        Once the job finishes, you&apos;ll be able to retry only the failed scenes.
                      </p>
                      {failedScenes[0]?.error_message && (
                        <p className="mt-1.5 text-[11px] font-mono text-amber-400/60">
                          {failedScenes[0].error_message.slice(0, 120)}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── FAILED ──────────────────────────────────── */}
              {isFailed && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                      <AlertCircle className="h-7 w-7 text-destructive" />
                    </div>
                    <h2 className="text-lg font-semibold mb-1">Generation failed</h2>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {friendlyError(job?.error_message)}
                    </p>
                    {/* Partial success notice + retry failed scenes */}
                    {hasRetryableScenes && (
                      <div className="mt-3 w-full max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                        <p className="text-sm font-medium text-amber-400 mb-1">
                          {doneScenes.length}/{scenes.length} scenes completed successfully
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Scene{failedScenes.length > 1 ? "s" : ""}{" "}
                          {failedScenes.map((s) => s.scene_index + 1).join(", ")} failed.
                          You can retry just the failed scenes — completed scenes are preserved.
                        </p>
                        <button
                          onClick={handleRetryScenes}
                          disabled={retryingScenes}
                          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                        >
                          {retryingScenes ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          {retryingScenes ? "Retrying..." : `Retry ${failedScenes.length} failed scene${failedScenes.length > 1 ? "s" : ""}`}
                        </button>
                      </div>
                    )}
                    {/* Raw error detail — useful for debugging */}
                    {job?.error_message && !hasRetryableScenes && (
                      <p className="mt-2 max-w-md rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 font-mono text-[11px] text-destructive/70 text-left break-all">
                        {job.error_message.length > 200
                          ? job.error_message.slice(0, 200) + "…"
                          : job.error_message}
                      </p>
                    )}
                    <div className="mt-6 flex flex-wrap gap-3">
                      {/* Top up credits button — shown on insufficient credits errors */}
                      {isAdmin && isInsufficientCreditsError(job?.error_message) && job?.engine_used && PROVIDER_TOP_UP[job.engine_used] && (
                        <a
                          href={PROVIDER_TOP_UP[job.engine_used].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
                        >
                          <Wallet className="h-4 w-4" />
                          Top up credits
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        onClick={handleRetry}
                        disabled={retrying}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                      >
                        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {retrying ? "Retrying..." : hasRetryableScenes ? "Restart entire job" : "Retry"}
                      </button>
                      <Link href="/create" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                        <Wand2 className="h-4 w-4" /> New prompt
                      </Link>
                      <Link href="/projects" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                        Back to projects
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* ── DONE ────────────────────────────────────── */}
              {isDone && videoUrl && (
                <>
                  {/* Video thumbnail (reduced size, clickable) */}
                  <motion.button
                    onClick={() => setVideoModalOpen(true)}
                    className="group relative w-full overflow-hidden rounded-[1.35rem] border border-neutral-950/10 bg-neutral-950 shadow-2xl shadow-neutral-950/15 transition-all hover:shadow-3xl hover:shadow-neutral-950/25"
                  >
                    <div className="relative aspect-video w-full">
                      <video
                        ref={videoRef}
                        className="h-full w-full object-cover bg-neutral-950"
                        src={videoUrl}
                        preload="metadata"
                      >
                        Your browser does not support video playback.
                      </video>
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" />
                      {/* Hover overlay with zoom icon */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
                          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                          </svg>
                          <span className="text-sm font-medium text-white">Click to expand</span>
                        </div>
                      </div>
                    </div>
                    {/* Hidden audio element for voice-over sync */}
                    {job.voiceover_url && (
                      <audio ref={voiceoverRef} src={job.voiceover_url} preload="auto" />
                    )}
                  </motion.button>

                  {/* Video modal (fullscreen view) */}
                  <AnimatePresence>
                    {videoModalOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
                        onClick={() => setVideoModalOpen(false)}
                      >
                        <motion.div
                          initial={{ scale: 0.95 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="relative h-screen w-screen flex items-center justify-center px-4 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Close button */}
                          <button
                            onClick={() => setVideoModalOpen(false)}
                            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-lg bg-black/50 text-white transition hover:bg-black/70"
                          >
                            <X className="h-5 w-5" />
                          </button>

                          {/* Modal video player */}
                          <div className="relative h-full w-full max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl bg-neutral-950">
                            <video
                              ref={modalVideoRef}
                              controls
                              autoPlay
                              className="h-full w-full object-contain bg-neutral-950"
                              src={videoUrl}
                            >
                              Your browser does not support video playback.
                            </video>
                            {/* Voice-over toggle (modal version) */}
                            {job.voiceover_url && (
                              <button
                                onClick={() => {
                                  setVoiceoverEnabled((v) => {
                                    const next = !v;
                                    if (!next && voiceoverRef.current) voiceoverRef.current.pause();
                                    if (next && voiceoverRef.current && modalVideoRef.current && !modalVideoRef.current.paused) {
                                      voiceoverRef.current.currentTime = modalVideoRef.current.currentTime;
                                      voiceoverRef.current.play().catch(() => {});
                                    }
                                    return next;
                                  });
                                }}
                                className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors z-10 ${
                                  voiceoverEnabled
                                    ? "bg-primary/90 text-primary-foreground"
                                    : "bg-black/50 text-white/70 hover:text-white"
                                }`}
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                                {voiceoverEnabled ? "Voice-over ON" : "Voice-over OFF"}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-neutral-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                        Post-generation studio
                      </span>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        {job.status}
                      </span>
                    </div>
                    <h1 className="mb-3 text-2xl font-semibold leading-tight tracking-tight text-neutral-950">
                      {job.prompt.length > 80 ? job.prompt.slice(0, 80) + "..." : job.prompt}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                      <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1"><Clock className="h-3 w-3" />{job.target_duration_seconds}s</span>
                      <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1"><Layers className="h-3 w-3" />{sceneCount} scene{sceneCount > 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1"><Cpu className="h-3 w-3" />{cleanModelName(getEngineDisplayName(job.engine_used))}</span>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">{job.plan}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <a
                          href={videoUrl}
                          download
                          className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 sm:col-span-1"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                        <button
                          onClick={shareVideo}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100"
                        >
                          {copiedShare ? <><Check className="h-4 w-4 text-green-400" /> Link copied</> : <><Share2 className="h-4 w-4" /> Share</>}
                        </button>
                        <button
                          onClick={() => copyLink(videoUrl)}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100"
                        >
                          {copied ? <><Check className="h-4 w-4 text-green-400" /> Copied</> : <><Copy className="h-4 w-4" /> Copy link</>}
                        </button>
                        <button
                          onClick={() => copyPrompt(job.prompt)}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100"
                        >
                          {copiedPrompt ? <><Check className="h-4 w-4 text-green-400" /> Copied</> : <><ClipboardCopy className="h-4 w-4" /> Copy prompt</>}
                        </button>
                        {Boolean(job.metadata?.research_job_id) && (
                          <button
                            onClick={applyOverlay}
                            disabled={overlayBusy}
                            title="Burn in exact captions, source cards and branding (deterministic, no AI text)."
                            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"
                          >
                            <Clapperboard className="h-4 w-4" />
                            {overlayBusy ? "Applying branding…" : "Apply branding"}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap lg:justify-end">
                        <button
                          onClick={handleToggleFavorite}
                          disabled={favoriteSaving}
                          aria-pressed={Boolean(job.is_favorite)}
                          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                            job.is_favorite
                              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:bg-neutral-100"
                          }`}
                        >
                          {favoriteSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star className={`h-4 w-4 ${job.is_favorite ? "fill-current" : ""}`} />
                          )}
                          {job.is_favorite ? "Favorited" : "Favorite"}
                        </button>
                        <button
                          onClick={handleDuplicate}
                          disabled={duplicating}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:opacity-50"
                        >
                          {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}
                          {duplicating ? "Creating..." : "Duplicate job"}
                        </button>
                        <Link
                          href={`/create/story?reference_job_id=${params.id}`}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                        >
                          <Link2 className="h-4 w-4" />
                          Use as reference
                        </Link>
                        {job?.engine_used === "heygen_avatar_shots" && (
                          <>
                            <button
                              onClick={handleSaveLook}
                              disabled={savingLook || lookSaved}
                              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50"
                              title="Save this cinematic shot to reuse with new scripts"
                            >
                              {savingLook ? <Loader2 className="h-4 w-4 animate-spin" /> : lookSaved ? <Check className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
                              {savingLook ? "Saving..." : lookSaved ? "Saved as Look" : "Save as Look"}
                            </button>
                            {lookSaved && savedLookId && (
                              <Link
                                href={`/create/avatar?look_id=${savedLookId}`}
                                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition hover:bg-green-100"
                                title="Reuse this saved Look with a new script and voice"
                              >
                                <Volume2 className="h-4 w-4" />
                                Reuse with new voice
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Prompt (during generation) ──────────────── */}
              {!isDone && job && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Prompt</p>
                  <p className="text-sm">{job.prompt}</p>
                </div>
              )}

              {/* ── Scene Timeline ────────────────────────── */}
              {scenes.length > 1 && (
                <SceneTimeline
                  scenes={scenes}
                  selectedIndex={selectedSceneIndex}
                  onSelect={handleSceneSelect}
                  isDone={isDone}
                  totalDuration={job?.target_duration_seconds}
                />
              )}

              {/* ── Scene edit panel (mobile) ─────────────── */}
              {scenes.length > 1 &&
                selectedSceneIndex >= 0 &&
                selectedSceneIndex < scenes.length &&
                (isDone || isFailed) && (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:hidden">
                    <ScenePanel
                      scene={scenes[selectedSceneIndex]}
                      sceneIndex={selectedSceneIndex}
                      jobId={params.id}
                      editable={isDone || isFailed}
                      onClose={handleClosePanel}
                      onPromptSaved={handlePromptSaved}
                      onRegenerate={handleSceneRegenerate}
                      jobEngine={job?.engine_used}
                    />
                  </div>
                )}

              {/* ── Mobile info cards (hidden on desktop) ───── */}
              {job && (
                <div className="lg:hidden space-y-5">
                  <InfoCards job={job} isActive={isActive} isDone={isDone} isFailed={isFailed} stageLabel={stageLabel} elapsed={elapsed} sceneCount={sceneCount} isAdmin={isAdmin} adminCredits={adminCredits} youtubeConnected={youtubeConnected} tiktokConnected={tiktokConnected} instagramConnected={instagramConnected} channelNames={channelNames} scenes={scenes} />
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* ═══ RIGHT: Info sidebar (desktop only) ══════════════ */}
        {job && (
          <div className="hidden w-80 flex-col gap-5 overflow-y-auto border-l border-neutral-200 bg-white/75 p-6 backdrop-blur lg:flex">
            {/* Scene edit panel — shown when a scene is selected on terminal jobs */}
            {scenes.length > 1 &&
              selectedSceneIndex >= 0 &&
              selectedSceneIndex < scenes.length &&
              (isDone || isFailed) && (
                <ScenePanel
                  scene={scenes[selectedSceneIndex]}
                  sceneIndex={selectedSceneIndex}
                  jobId={params.id}
                  editable={isDone || isFailed}
                  onClose={handleClosePanel}
                  onPromptSaved={handlePromptSaved}
                  onRegenerate={handleSceneRegenerate}
                  jobEngine={job?.engine_used}
                />
              )}
            <InfoCards job={job} isActive={isActive} isDone={isDone} isFailed={isFailed} stageLabel={stageLabel} elapsed={elapsed} sceneCount={sceneCount} isAdmin={isAdmin} adminCredits={adminCredits} youtubeConnected={youtubeConnected} tiktokConnected={tiktokConnected} instagramConnected={instagramConnected} channelNames={channelNames} scenes={scenes} />
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared info cards — rendered in desktop sidebar AND mobile stacked
// ---------------------------------------------------------------------------
function InfoCards({
  job,
  isActive,
  isDone,
  isFailed,
  stageLabel,
  elapsed,
  sceneCount,
  isAdmin = false,
  adminCredits = null,
  youtubeConnected = false,
  tiktokConnected = false,
  instagramConnected = false,
  channelNames = {},
  scenes = [],
}: {
  job: Job;
  isActive: boolean;
  isDone: boolean;
  isFailed: boolean;
  stageLabel: string;
  elapsed: number;
  sceneCount: number;
  isAdmin?: boolean;
  adminCredits?: { remaining: number; status: string } | null;
  youtubeConnected?: boolean;
  tiktokConnected?: boolean;
  instagramConnected?: boolean;
  channelNames?: Record<string, string>;
  scenes?: JobScene[];
}) {
  return (
    <>
      {/* Status */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Status</h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Status</span>
            <span className="font-medium flex items-center gap-1.5 capitalize">
              {isDone && <CheckCircle2 className="h-3 w-3 text-green-400" />}
              {isFailed && <XCircle className="h-3 w-3 text-destructive" />}
              {isActive && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              {isDone ? "Complete" : isFailed ? "Failed" : "Generating"}
            </span>
          </div>
          {isActive && (
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Stage</span>
              <span className="font-medium text-primary text-[11px]">{stageLabel}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">{isActive ? "Elapsed" : "Generation time"}</span>
            <span className="font-medium tabular-nums">{formatTime(elapsed)}</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Production</h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between gap-3"><span className="text-neutral-500">Model</span><span className="text-right font-medium">{cleanModelName(getEngineDisplayName(job.engine_used))}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Video duration</span><span className="font-medium">{job.target_duration_seconds}s</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Scenes</span><span className="font-medium">{sceneCount}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Format</span><span className="font-medium">{job.aspect_ratio || "16:9"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Captions</span><span className="font-medium capitalize">{job.caption_mode || "none"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Plan</span><span className="font-medium capitalize">{job.plan}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Audio</span><span className="font-medium capitalize">{job.audio_mode || "auto"}</span></div>
          {job.voiceover_text && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Voice-over</span>
              <span className={`font-medium ${job.voiceover_url ? "text-green-500" : "text-amber-400"}`}>
                {job.voiceover_url ? "Ready" : "Generating..."}
              </span>
            </div>
          )}
          <div className="flex justify-between"><span className="text-neutral-500">Created</span><span className="font-medium text-[10px]">{formatDate(job.created_at)}</span></div>
        </div>
        {/* Admin-only cost tracking */}
        {isAdmin && SHOW_COST_TRACKING_UI && (
          <JobCostBadge engine={job.engine_used} cost={job.estimated_cost_usd} />
        )}
      </div>

      {/* Admin-only: Provider credit balance */}
      {isAdmin && adminCredits && (
        <div className={`rounded-xl border p-4 ${
          adminCredits.status === "critical"
            ? "border-red-500/40 bg-red-500/5"
            : adminCredits.status === "low"
              ? "border-amber-500/40 bg-amber-500/5"
            : "border-neutral-200 bg-white shadow-sm"
        }`}>
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            <Wallet className="h-3 w-3" />
            Generation Credits
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Credit balance</span>
              <span className={`font-semibold tabular-nums ${
                adminCredits.status === "critical"
                  ? "text-red-400"
                  : adminCredits.status === "low"
                    ? "text-amber-400"
                    : "text-green-400"
              }`}>
                {adminCredits.remaining.toFixed(1)} credits
              </span>
            </div>
            {adminCredits.status !== "ok" && (
              <p className={`text-[11px] ${adminCredits.status === "critical" ? "text-red-400" : "text-amber-400"}`}>
                {adminCredits.status === "critical"
                  ? "Credits critically low! Top up now."
                  : "Credits running low."}
              </p>
            )}
            {(() => {
              const engineKey = job?.engine_used ?? "";
              const topUpUrl = PROVIDER_TOP_UP[engineKey]?.url ?? "https://evolink.ai/fr/dashboard/credits";
              return (
                <a
                  href={topUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Top up credits
                </a>
              );
            })()}
          </div>
        </div>
      )}

      {/* Audio player (when separate audio track exists) */}
      {isDone && job.audio_url && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            <Volume2 className="h-3 w-3" />
            Audio Track
          </h3>
          <audio controls className="w-full h-8" src={job.audio_url}>
            Your browser does not support audio playback.
          </audio>
          {job.voiceover_url && (
            <div className="mt-2">
              <p className="text-[10px] text-muted-foreground mb-1">Voice-over</p>
              <audio controls className="w-full h-8" src={job.voiceover_url}>
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>
      )}

      {/* Upgrade */}
      {job.plan === "free" && (
        <Link href="/pricing" className="flex items-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800">
          <Crown className="h-4 w-4" />
          <div><p>Unlock longer videos</p><p className="font-normal opacity-80">Up to 60s, 3 scenes</p></div>
        </Link>
      )}

      {/* Social Export */}
      {isDone && (
        <SocialExportPanel
          jobId={job.id}
          plan={job.plan}
          videoUrl={job.output_url_final || job.video_url || ""}
          existingExports={job.social_exports ?? undefined}
          youtubeConnected={youtubeConnected}
          tiktokConnected={tiktokConnected}
          instagramConnected={instagramConnected}
          channelNames={channelNames}
          scenes={scenes}
        />
      )}

      {/* Quick actions */}
      <div className="space-y-2">
        <Link href="/create" className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800">
          <Plus className="h-3.5 w-3.5" /> New video
        </Link>
        <Link href="/projects" className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
          All projects
        </Link>
      </div>
    </>
  );
}
