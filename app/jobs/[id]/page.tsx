"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/workspace/sidebar";
import { JobCostBadge } from "@/components/job/JobCostBadge";
import { SocialExportPanel } from "@/components/job/social-export-panel";
import { SHOW_COST_TRACKING_UI, isAdminEmail } from "@/lib/flags";
import type { Job, JobStage, JobScene } from "@/lib/types";
import { STAGE_ORDER, getEngineDisplayName } from "@/lib/types";

const POLL_INTERVAL = 5000;

// ---------------------------------------------------------------------------
// Stage labels — premium, user-friendly
// ---------------------------------------------------------------------------
const FRIENDLY_STAGES: Record<string, string> = {
  queued: "In queue...",
  spawning_pipeline: "Preparing your pipeline...",
  generating_scene_1: "Generating scene 1...",
  generating_scene_2: "Generating scene 2...",
  generating_scene_3: "Generating scene 3...",
  generating_scene_4: "Generating scene 4...",
  generating_scene_5: "Generating scene 5...",
  encoding: "Encoding final video...",
  uploading: "Uploading result...",
  completed: "Complete",
  failed: "Failed",
};

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

function sceneStatusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "skipped") return <div className="h-3.5 w-3.5 rounded-full bg-muted" />;
  if (status === "generating") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  return <div className="h-3.5 w-3.5 rounded-full border border-border" />;
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

  const copyLink = (u: string) => { navigator.clipboard.writeText(u); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyPrompt = (t: string) => { navigator.clipboard.writeText(t); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 2000); };

  const stageIdx = job?.current_stage ? STAGE_ORDER.indexOf(job.current_stage as JobStage) : 0;
  const stageLabel = job?.current_stage ? (FRIENDLY_STAGES[job.current_stage] ?? "Processing...") : "In queue...";

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

  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);

  // Check social connections once user is known
  useEffect(() => {
    if (!email) return;
    const sb = createClient();
    sb.from("social_connections")
      .select("platform")
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.platform === "youtube") setYoutubeConnected(true);
          if (row.platform === "tiktok") setTiktokConnected(true);
          if (row.platform === "instagram") setInstagramConnected(true);
        }
      });
  }, [email]);

  const isActive = job ? (job.status === "pending" || job.status === "in_progress") : false;
  const isDone = job?.status === "done";
  const isAdmin = isAdminEmail(email);
  const isFailed = job?.status === "failed";
  const videoUrl = job ? (job.output_url_final || job.video_url) : null;
  const sceneCount = scenes.length || (job?.storyboard ? job.storyboard.length : 1);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar plan={plan} email={email} />

      <main className="flex-1 flex overflow-hidden">
        {/* ═══ LEFT: Main content ═══════════════════════════════ */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <Link
            href="/projects"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
              className="space-y-6"
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
                      Your video is being generated. This usually takes 5–8 minutes per scene.
                    </p>
                    <div className="mt-6 w-full max-w-sm">
                      <div className="flex gap-1">
                        {STAGE_ORDER.map((_, i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= stageIdx ? "bg-primary" : "bg-muted"}`} />
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>Step {Math.max(stageIdx + 1, 1)}/{STAGE_ORDER.length}</span>
                        <span className="tabular-nums">{formatTime(elapsed)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── FAILED ──────────────────────────────────── */}
              {isFailed && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                      <AlertCircle className="h-7 w-7 text-destructive" />
                    </div>
                    <h2 className="text-lg font-semibold mb-1">Generation failed</h2>
                    <p className="text-sm text-muted-foreground max-w-md mb-6">
                      Something went wrong during generation. This can happen due to high demand or temporary issues.
                    </p>
                    <div className="flex gap-3">
                      <Link href="/create" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110">
                        <Wand2 className="h-4 w-4" /> Try again
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
                  <div className="rounded-2xl border border-border/50 bg-card/80 overflow-hidden backdrop-blur-sm">
                    <video controls autoPlay className="w-full" src={videoUrl}>
                      Your browser does not support video playback.
                    </video>
                  </div>

                  <div>
                    <h1 className="text-lg font-semibold leading-snug mb-2">
                      {job.prompt.length > 80 ? job.prompt.slice(0, 80) + "..." : job.prompt}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{job.target_duration_seconds}s</span>
                      <span className="flex items-center gap-1"><Layers className="h-3 w-3" />{sceneCount} scene{sceneCount > 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{getEngineDisplayName(job.engine_used)}</span>
                      <span className="uppercase text-[10px] font-medium">{job.plan}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a href={videoUrl} download className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110">
                      <Download className="h-4 w-4" /> Download
                    </a>
                    <button onClick={() => copyLink(videoUrl)} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                      {copied ? <><Check className="h-4 w-4 text-green-400" /> Copied</> : <><Copy className="h-4 w-4" /> Copy link</>}
                    </button>
                    <button onClick={() => copyPrompt(job.prompt)} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                      {copiedPrompt ? <><Check className="h-4 w-4 text-green-400" /> Copied</> : <><ClipboardCopy className="h-4 w-4" /> Copy prompt</>}
                    </button>
                  </div>
                </>
              )}

              {/* ── Prompt (during generation) ──────────────── */}
              {!isDone && job && (
                <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Prompt</p>
                  <p className="text-sm">{job.prompt}</p>
                </div>
              )}

              {/* ── Scenes breakdown ────────────────────────── */}
              {scenes.length > 1 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Scenes</h3>
                  <div className="space-y-2">
                    {scenes.map((scene) => (
                      <div key={scene.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-4 py-3">
                        {sceneStatusIcon(scene.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">Scene {scene.scene_index + 1}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{scene.prompt}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{scene.duration_sec}s</span>
                        <span className="text-[11px] text-muted-foreground capitalize">{scene.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Mobile info cards (hidden on desktop) ───── */}
              {job && (
                <div className="lg:hidden space-y-5">
                  <InfoCards job={job} isActive={isActive} isDone={isDone} isFailed={isFailed} stageLabel={stageLabel} elapsed={elapsed} sceneCount={sceneCount} isAdmin={isAdmin} />
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* ═══ RIGHT: Info sidebar (desktop only) ══════════════ */}
        {job && (
          <div className="hidden lg:flex w-72 flex-col border-l border-border/40 bg-muted/20 p-6 gap-5 overflow-y-auto">
            <InfoCards job={job} isActive={isActive} isDone={isDone} isFailed={isFailed} stageLabel={stageLabel} elapsed={elapsed} sceneCount={sceneCount} isAdmin={isAdmin} />
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
}: {
  job: Job;
  isActive: boolean;
  isDone: boolean;
  isFailed: boolean;
  stageLabel: string;
  elapsed: number;
  sceneCount: number;
  isAdmin?: boolean;
}) {
  return (
    <>
      {/* Status */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Status</h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium flex items-center gap-1.5 capitalize">
              {isDone && <CheckCircle2 className="h-3 w-3 text-green-400" />}
              {isFailed && <XCircle className="h-3 w-3 text-destructive" />}
              {isActive && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              {isDone ? "Complete" : isFailed ? "Failed" : "Generating"}
            </span>
          </div>
          {isActive && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Stage</span>
              <span className="font-medium text-primary text-[11px]">{stageLabel}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{isActive ? "Elapsed" : "Duration"}</span>
            <span className="font-medium tabular-nums">{formatTime(elapsed)}</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Details</h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium">{getEngineDisplayName(job.engine_used)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{job.target_duration_seconds}s</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Scenes</span><span className="font-medium">{sceneCount}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{job.plan}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium text-[10px]">{formatDate(job.created_at)}</span></div>
        </div>
        {/* Admin-only cost tracking */}
        {isAdmin && SHOW_COST_TRACKING_UI && (
          <JobCostBadge engine={job.engine_used} cost={job.estimated_cost_usd} />
        )}
      </div>

      {/* Upgrade */}
      {job.plan === "free" && (
        <Link href="/pricing" className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3 text-xs font-semibold text-white hover:brightness-110">
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
          existingExports={(job as Record<string, unknown>).social_exports as Record<string, string> | undefined}
          youtubeConnected={youtubeConnected}
          tiktokConnected={tiktokConnected}
          instagramConnected={instagramConnected}
        />
      )}

      {/* Quick actions */}
      <div className="space-y-2">
        <Link href="/create" className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110">
          <Plus className="h-3.5 w-3.5" /> New video
        </Link>
        <Link href="/projects" className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-muted">
          All projects
        </Link>
      </div>
    </>
  );
}
