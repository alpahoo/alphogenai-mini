"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  ImagePlus,
  Send,
  Loader2,
  Radio,
  SearchCheck,
  Wand2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ExplainerPreview } from "@/components/explainer/explainer-preview";
import { ExplainerStudio } from "@/components/explainer/explainer-studio";
import {
  buildExplainerStoryboard,
  type ExplainerScene,
  type ExplainerStoryboard,
} from "@/lib/explainer/storyboard";

interface ResearchJob {
  id: string;
  user_id: string;
  topic: string;
  input_url: string | null;
  mode: string;
  status: string;
  language: string;
  target_duration_seconds: number | null;
  error_message: string | null;
  error_step: string | null;
  created_at: string;
  updated_at: string;
  working_storyboard: { scenes?: unknown; savedAt?: string; storyboardId?: string | null } | null;
}

interface ResearchSource {
  id: string;
  url: string;
  title: string;
  source_type: string;
  credibility_score: number | null;
  selected: boolean;
  extraction_status: string;
  extraction_error: string | null;
}

interface ResearchAngle {
  id: string;
  title: string;
  hook: string;
  positioning: string | null;
  score: number | null;
  selected: boolean;
}

interface ResearchScript {
  id: string;
  script: string;
  sections_json: Array<Record<string, unknown>> | null;
  quality_score: number | null;
  approved: boolean;
  created_at: string;
}

interface ResearchStoryboard {
  id: string;
  script_id: string;
  scenes_json: Array<{ title?: string; prompt?: string; duration_sec?: number }>;
}

interface ResearchSourceMedia {
  id: string;
  research_source_id: string | null;
  kind: string;
  source_url: string;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
  selected: boolean;
  rights_status: string;
  risk_note: string | null;
}

const RESEARCH_HANDOFF_STORAGE_KEY = "alphogen:research-handoff";

const STEPS = [
  { key: "brief", label: "Brief" },
  { key: "sources", label: "Sources" },
  { key: "angles", label: "Angles" },
  { key: "script", label: "Script" },
  { key: "storyboard", label: "Storyboard" },
  { key: "director", label: "Director" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Brief",
  discovering: "Discovering sources",
  extracting: "Extracting sources",
  ready_for_angles: "Ready for angles",
  scripting: "Script ready",
  approved: "Approved",
  sent_to_director: "Sent to Director",
  failed: "Needs review",
};

function statusClass(status: string) {
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "scripting" || status === "ready_for_angles") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (status === "discovering" || status === "extracting") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "approved" || status === "sent_to_director") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

function sourceStatusMeta(status: string): { label: string; cls: string } {
  if (status === "success") {
    return { label: "Extracted", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (status === "failed" || status === "blocked" || status === "timeout") {
    return { label: "Blocked", cls: "border-red-200 bg-red-50 text-red-700" };
  }
  return { label: "Pending", cls: "border-neutral-200 bg-white text-neutral-500" };
}

function clampSceneDuration(value: number | undefined) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(3, Math.min(10, Math.round(value ?? 5)));
}

function friendlyResearchError(message: string | null | undefined) {
  if (!message) return null;
  if (message.includes("SearXNG gateway not configured")) {
    return "Source search is not connected yet. Add RESEARCH_SEARXNG_GATEWAY_URL and RESEARCH_SEARXNG_SERVICE_TOKEN in Vercel, then redeploy.";
  }
  if (message.includes("LLM request timed out")) {
    return "The research model took too long to answer. Try Generate angles again; if it repeats, use fewer sources or a shorter brief.";
  }
  if (message.includes("LLM gateway not configured")) {
    return "Research writing is not connected yet. Add RESEARCH_LLM_GATEWAY_URL, RESEARCH_LLM_SERVICE_TOKEN, and RESEARCH_LLM_MODEL in Vercel, then redeploy.";
  }
  return message;
}

const ACTION_LABELS: Record<string, string> = {
  discover: "Searching trusted sources...",
  extract: "Extracting useful evidence...",
  analyze: "Generating editorial angles...",
  script: "Writing the script and storyboard...",
  approve: "Approving the storyboard...",
  handoff: "Preparing the Director handoff...",
  media: "Saving this reference...",
  "select-angle": "Selecting this angle...",
};

export default function ResearchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const jobId = params.id;
  const supabase = useMemo(() => createClient(), []);

  const [job, setJob] = useState<ResearchJob | null>(null);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [angles, setAngles] = useState<ResearchAngle[]>([]);
  const [script, setScript] = useState<ResearchScript | null>(null);
  const [storyboard, setStoryboard] = useState<ResearchStoryboard | null>(null);
  const [media, setMedia] = useState<ResearchSourceMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explainerJob, setExplainerJob] = useState<
    { id: string; status: string; url: string | null } | null
  >(null);
  const [showAllSources, setShowAllSources] = useState(false);
  const [showAllMedia, setShowAllMedia] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Unauthorized");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const [jobResult, sourceResult, angleResult, scriptResult, mediaResult] = await Promise.all([
        supabase
          .from("research_jobs")
          .select("*")
          .eq("id", jobId)
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("research_sources")
          .select("id, url, title, source_type, credibility_score, selected, extraction_status, extraction_error")
          .eq("research_job_id", jobId)
          .order("created_at", { ascending: true }),
        supabase
          .from("research_angles")
          .select("id, title, hook, positioning, score, selected")
          .eq("research_job_id", jobId)
          .order("score", { ascending: false }),
        supabase
          .from("research_scripts")
          .select("id, script, sections_json, quality_score, approved, created_at")
          .eq("research_job_id", jobId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("research_source_media")
          .select("id, research_source_id, kind, source_url, storage_path, width, height, mime, selected, rights_status, risk_note")
          .eq("research_job_id", jobId)
          .order("selected", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(24),
      ]);

      if (jobResult.error) throw jobResult.error;
      setJob(jobResult.data as ResearchJob);
      setSources((sourceResult.data ?? []) as ResearchSource[]);
      setAngles((angleResult.data ?? []) as ResearchAngle[]);
      setMedia((mediaResult.data ?? []) as ResearchSourceMedia[]);
      const latestScript = ((scriptResult.data ?? []) as ResearchScript[])[0] ?? null;
      setScript(latestScript);

      if (latestScript) {
        const { data } = await supabase
          .from("research_storyboards")
          .select("id, script_id, scenes_json")
          .eq("research_job_id", jobId)
          .eq("script_id", latestScript.id)
          .order("created_at", { ascending: false })
          .limit(1);
        setStoryboard(((data ?? []) as ResearchStoryboard[])[0] ?? null);
      } else {
        setStoryboard(null);
      }
    } catch {
      setError("Could not load this research plan.");
    } finally {
      setLoading(false);
    }
  }, [jobId, router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function runStep(name: string, endpoint: string, body?: unknown) {
    setAction(name);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: await authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error_message || json?.error || "Step failed.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step failed.";
      setError(friendlyResearchError(message) || message);
      await load();
    } finally {
      setAction(null);
    }
  }

  async function selectAngle(angleId: string) {
    setAction("select-angle");
    setError(null);
    try {
      await supabase.from("research_angles").update({ selected: false }).eq("research_job_id", jobId);
      const { error: updateError } = await supabase
        .from("research_angles")
        .update({ selected: true })
        .eq("id", angleId)
        .eq("research_job_id", jobId);
      if (updateError) throw updateError;
      await load();
    } catch {
      setError("Could not select this angle.");
    } finally {
      setAction(null);
    }
  }

  async function selectMediaReference(mediaId: string) {
    setAction("media");
    setError(null);
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/media/${mediaId}/select`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ rights_confirmed: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not save this reference.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save this reference.";
      setError(message);
    } finally {
      setAction(null);
    }
  }

  async function approvePlan() {
    if (!job || !script || scenes.length === 0) {
      setError("Generate a script and storyboard before approving.");
      return;
    }

    await runStep("approve", `/api/research/jobs/${jobId}/approve`);
  }

  async function sendToDirector() {
    if (!job || !script || !script.approved || scenes.length === 0) {
      setError("Approve a storyboard before sending it to Director.");
      return;
    }

    setAction("handoff");
    setError(null);
    try {
      const selectedReferences = media
        .filter((item) => item.selected && item.storage_path)
        .slice(0, 6)
        .map((item, index) => ({
          role: "outfit_style" as const,
          url: item.source_url,
          storage_path: item.storage_path as string,
          mime_type: item.mime || "image/jpeg",
          filename: `research-reference-${index + 1}`,
          weight: 0.7,
        }));

      const payload = {
        researchJobId: job.id,
        topic: job.topic,
        mode: job.mode,
        language: job.language,
        angleTitle: selectedAngle?.title ?? null,
        angleHook: selectedAngle?.hook ?? null,
        script: script.script,
        voiceoverText: script.script,
        references: selectedReferences,
        scenes: scenes.map((scene, index) => ({
          index,
          title: scene.title || `Scene ${index + 1}`,
          prompt: scene.prompt || job.topic,
          durationSec: clampSceneDuration(scene.duration_sec),
        })),
      };

      window.sessionStorage.setItem(RESEARCH_HANDOFF_STORAGE_KEY, JSON.stringify(payload));
      await supabase
        .from("research_jobs")
        .update({ status: "sent_to_director" })
        .eq("id", jobId)
        .eq("user_id", job.user_id);
      router.push("/create/story?research_handoff=1");
    } catch {
      setAction(null);
      setError("Could not prepare the Director handoff.");
    }
  }

  async function generateExplainer(editedStoryboard?: ExplainerStoryboard) {
    if (!job || !script?.approved || scenes.length === 0) {
      setError("Approve the storyboard before rendering an explainer.");
      return;
    }
    setAction("explainer");
    setError(null);
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/explainer`, {
        method: "POST",
        headers: await authHeaders(),
        ...(editedStoryboard ? { body: JSON.stringify({ storyboard: editedStoryboard }) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Explainer render failed to start.");
      setExplainerJob({ id: data.job_id, status: "in_progress", url: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the explainer render.");
    } finally {
      setAction(null);
    }
  }

  // Tier B: persist the Studio working copy (autosave). Tags the draft with the
  // current storyboard id so a regenerated plan invalidates it. Returns savedAt ISO.
  async function saveWorkingStoryboard(sb: ExplainerStoryboard): Promise<string> {
    const res = await fetch(`/api/research/jobs/${jobId}/working-storyboard`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify({ scenes: sb.scenes, storyboardId: storyboard?.id ?? null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save your edits.");
    return data.savedAt as string;
  }

  // Tier B: discard the working copy (Reset to plan) — clears the persisted draft.
  async function clearWorkingStoryboard(): Promise<void> {
    const res = await fetch(`/api/research/jobs/${jobId}/working-storyboard`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Could not reset your draft.");
    }
  }

  // Poll the explainer job until it finishes (render is async, ~minutes).
  useEffect(() => {
    if (!explainerJob || explainerJob.status !== "in_progress") return;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("jobs")
        .select("status, output_url_final")
        .eq("id", explainerJob.id)
        .single();
      if (data && (data.status === "done" || data.status === "failed")) {
        setExplainerJob({ id: explainerJob.id, status: data.status, url: data.output_url_final ?? null });
        clearInterval(timer);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [explainerJob, supabase]);

  const readySources = sources.filter((s) => s.extraction_status === "success").length;
  const selectedAngle = angles.find((a) => a.selected);
  const selectedMediaCount = media.filter((item) => item.selected && item.storage_path).length;
  const scenes = useMemo(() => storyboard?.scenes_json ?? [], [storyboard]);
  // WYSIWYG explainer storyboard for the live preview (pure, client-side, no cost).
  const explainerStoryboard = useMemo(
    () =>
      job && scenes.length > 0
        ? buildExplainerStoryboard({ input_url: job.input_url, topic: job.topic }, scenes)
        : null,
    [job, scenes],
  );
  // Studio seed: a persisted working copy (Tier B) if one exists, else the plan.
  // The panel preview always stays on the plan; only the Studio uses the draft.
  const studioInitial = useMemo<ExplainerStoryboard | null>(() => {
    if (!explainerStoryboard) return null;
    const ws = job?.working_storyboard;
    // Only reuse the draft if it was derived from the CURRENT storyboard version —
    // a regenerated script/storyboard invalidates a stale draft.
    if (
      ws &&
      Array.isArray(ws.scenes) &&
      ws.scenes.length > 0 &&
      storyboard?.id &&
      ws.storyboardId === storyboard.id
    ) {
      return { meta: explainerStoryboard.meta, scenes: ws.scenes as ExplainerScene[] };
    }
    return explainerStoryboard;
  }, [explainerStoryboard, job?.working_storyboard, storyboard?.id]);
  const visibleSources = showAllSources ? sources : sources.slice(0, 5);
  const hiddenSourcesCount = Math.max(0, sources.length - visibleSources.length);
  const visibleMedia = showAllMedia ? media : media.slice(0, 9);
  const hiddenMediaCount = Math.max(0, media.length - visibleMedia.length);
  const canApprove = Boolean(script && scenes.length > 0 && !script.approved);
  const canSendToDirector = Boolean(script?.approved && scenes.length > 0);
  const visibleJobError = friendlyResearchError(job?.error_message);

  if (loading && !job) {
    return (
      <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading research plan
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
        <Link href="/research" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600">
          <ArrowLeft className="h-4 w-4" />
          Back to Research
        </Link>
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
          Research plan not found.
        </div>
      </div>
    );
  }

  // Plan Review progress + single guided next action (UI-only; reuses existing handlers).
  const stepDone: Record<string, boolean> = {
    brief: true,
    sources: sources.length > 0,
    angles: !!selectedAngle,
    script: !!script,
    storyboard: scenes.length > 0,
    director: job.status === "sent_to_director",
  };
  const activeStepKey = STEPS.find((step) => !stepDone[step.key])?.key ?? "director";

  type NextAction = { label: string; hint: string; detail: string; onClick?: () => void; disabled: boolean };
  const nextAction: NextAction | null =
    sources.length === 0
      ? {
          label: "Find sources",
          hint: "Kick it off now",
          detail: "Discover trusted sources and start building your evidence base.",
          onClick: () => runStep("discover", `/api/research/jobs/${jobId}/discover`),
          disabled: !!action,
        }
      : readySources === 0
        ? {
            label: "Extract sources",
            hint: "One more step",
            detail: "Pull readable evidence so angle generation is reliable.",
            onClick: () => runStep("extract", `/api/research/jobs/${jobId}/extract`),
            disabled: !!action,
          }
        : angles.length === 0
          ? {
              label: "Generate angles",
              hint: "Keep going",
              detail: "Create several editorial directions and pick the strongest one.",
              onClick: () => runStep("analyze", `/api/research/jobs/${jobId}/analyze`),
              disabled: !!action,
            }
          : !selectedAngle
            ? {
                label: "Select an angle",
                hint: "Need one choice",
                detail: "Pick an angle below to continue to script generation.",
                onClick: undefined,
                disabled: true,
              }
            : !script
              ? {
                  label: "Generate script",
                  hint: "Build your plan",
                  detail: "Generate scenes and narration from your selected angle.",
                  onClick: () => runStep("script", `/api/research/jobs/${jobId}/script`),
                  disabled: !!action,
                }
              : !script.approved
                ? {
                    label: "Approve storyboard",
                    hint: "Quick review needed",
                    detail: "Review quality and approve before running Director or explainer.",
                    onClick: approvePlan,
                    disabled: !!action,
                  }
                : job.status !== "sent_to_director"
                  ? {
                      label: "Send to Director",
                      hint: "Ready to produce",
                      detail: "Move this storyboard into the Editor as an editable Director plan.",
                      onClick: sendToDirector,
                      disabled: !!action,
                    }
                  : null;

  return (
    <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/research" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" />
          Back to Research
        </Link>

        <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(job.status)}`}>
                  {STATUS_LABELS[job.status] || job.status}
                </span>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  {job.mode}
                </span>
                {job.target_duration_seconds ? (
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                    {job.target_duration_seconds}s target
                  </span>
                ) : null}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 lg:text-4xl">{job.topic}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
                Research pipeline from sourced evidence to a Director-ready storyboard.
              </p>
              {visibleJobError && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {visibleJobError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-2xl font-semibold text-neutral-950">{sources.length}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Sources</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-2xl font-semibold text-neutral-950">{angles.length}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Angles</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-2xl font-semibold text-neutral-950">{scenes.length}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Scenes</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-stretch gap-1.5">
            {STEPS.map((step, index) => {
              const done = stepDone[step.key];
              const active = step.key === activeStepKey;
              return (
                <div key={step.key} className="flex flex-1 flex-col gap-1.5">
                  <div
                    className={`h-1.5 w-full rounded-full ${
                      done ? "bg-emerald-500" : active ? "bg-neutral-900" : "bg-neutral-200"
                    }`}
                  />
                  <div className="flex items-center gap-1">
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <span className={`text-[10px] font-semibold ${active ? "text-neutral-900" : "text-neutral-400"}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    )}
                    <span
                      className={`truncate text-[11px] font-semibold ${
                        done ? "text-neutral-700" : active ? "text-neutral-900" : "text-neutral-400"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Current angle</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900 line-clamp-2">{selectedAngle?.title ?? "Not chosen yet"}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Target duration</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {job.target_duration_seconds ? `${job.target_duration_seconds}s` : "Not set"}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Storyboard scenes</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">{scenes.length}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Ready references</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">{selectedMediaCount}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {action && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
          >
            <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-neutral-800">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-950" />
              {ACTION_LABELS[action] || "Working..."}
            </div>
            <div className="h-1 bg-neutral-200">
              <div className="h-full w-1/2 animate-pulse rounded-r-full bg-neutral-950" />
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
          <main className="space-y-6">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">Sources</h2>
                  <p className="mt-1 text-sm text-neutral-500">Discover and extract evidence before generating angles.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runStep("discover", `/api/research/jobs/${jobId}/discover`)}
                    disabled={!!action}
                    className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {action === "discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                    Find sources
                  </button>
                  <button
                    onClick={() => runStep("extract", `/api/research/jobs/${jobId}/extract`)}
                    disabled={!!action || sources.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {action === "extract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Extract
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {sources.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500">
                    No sources yet. Start with discovery.
                  </div>
                ) : (
                  visibleSources.map((source) => (
                    <div key={source.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-950">{source.title}</p>
                          <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-neutral-500 hover:text-neutral-950">
                            {source.url}
                          </a>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                            {source.source_type}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sourceStatusMeta(source.extraction_status).cls}`}>
                            {sourceStatusMeta(source.extraction_status).label}
                          </span>
                        </div>
                      </div>
                      {source.extraction_error && (
                        <p className="mt-3 text-sm leading-6 text-red-600">{source.extraction_error}</p>
                      )}
                    </div>
                  ))
                )}
                {hiddenSourcesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSources(!showAllSources)}
                    className="mt-1 text-sm font-semibold text-neutral-900 hover:underline"
                  >
                    {showAllSources ? "Show fewer sources" : `Show all sources (${hiddenSourcesCount} hidden)`}
                  </button>
                )}
              </div>
            </section>

            {media.length > 0 && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-950">Suggested references</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Choose source images you have the right to use. Selected items are copied privately and sent to Director.
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    {selectedMediaCount} selected
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Suggestions only — nothing is added until you select it. No image is downloaded automatically; verify usage rights before publishing.
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleMedia.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                      <div className="relative aspect-video bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.source_url}
                          alt=""
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                        <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
                          {item.kind.replace(/_/g, " ")}
                        </div>
                        {item.selected && (
                          <div className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                            Selected
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs text-neutral-500 hover:text-neutral-950"
                        >
                          {item.source_url}
                        </a>
                        <p className="mt-2 text-xs leading-5 text-neutral-500">
                          {item.risk_note || "Verify usage rights before publishing."}
                        </p>
                        <button
                          type="button"
                          onClick={() => selectMediaReference(item.id)}
                          disabled={!!action || item.selected}
                          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                            item.selected
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-neutral-950 text-white hover:bg-neutral-800"
                          } disabled:opacity-60`}
                        >
                          {action === "media" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                          {item.selected ? "Ready for Director" : "Use as reference"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {hiddenMediaCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMedia(!showAllMedia)}
                    className="mt-3 text-sm font-semibold text-neutral-900 hover:underline"
                  >
                    {showAllMedia ? "Show fewer references" : `Review all references (${hiddenMediaCount} hidden)`}
                  </button>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">Angles</h2>
                  <p className="mt-1 text-sm text-neutral-500">Choose the editorial direction before creating the script.</p>
                </div>
                <button
                  onClick={() => runStep("analyze", `/api/research/jobs/${jobId}/analyze`)}
                  disabled={!!action || readySources === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                  Generate angles
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {angles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500 md:col-span-2">
                    No angles yet. Extract at least one source first.
                  </div>
                ) : (
                  [...angles]
                    .sort((a, b) => Number(b.selected) - Number(a.selected))
                    .map((angle) => (
                    <button
                      key={angle.id}
                      onClick={() => selectAngle(angle.id)}
                      disabled={action === "select-angle"}
                      className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${
                        angle.selected
                          ? "border-neutral-950 bg-neutral-950 text-white shadow-md md:col-span-2"
                          : "border-neutral-200 bg-neutral-50 text-neutral-950 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {angle.selected && (
                            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
                              Selected
                            </span>
                          )}
                          <h3 className="font-semibold">{angle.title}</h3>
                        </div>
                        {angle.selected && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                      </div>
                      <p className={`mt-2 text-sm leading-6 ${angle.selected ? "text-white/75" : "line-clamp-3 text-neutral-600"}`}>
                        {angle.hook}
                      </p>
                      {angle.positioning && (
                        <p className={`mt-3 text-xs leading-5 ${angle.selected ? "text-white/55" : "line-clamp-2 text-neutral-500"}`}>
                          {angle.positioning}
                        </p>
                      )}
                      {angle.score !== null && (
                        <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${angle.selected ? "text-white/55" : "text-neutral-400"}`}>
                          Fit {Math.round(angle.score * 100)}%
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">Script and storyboard</h2>
                  <p className="mt-1 text-sm text-neutral-500">Generate the Director-ready plan after selecting an angle.</p>
                </div>
                <button
                  onClick={() => runStep("script", `/api/research/jobs/${jobId}/script`)}
                  disabled={!!action || !selectedAngle}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {action === "script" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Generate script
                </button>
              </div>

              {script ? (
                <div className="mt-4 grid gap-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Quality {script.quality_score !== null ? `${Math.round(script.quality_score * 100)}%` : "pending"}
                      </span>
                      <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {script.approved ? "Approved" : "Awaiting approval"}
                      </span>
                    </div>
                    <p className="max-h-72 overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-7 text-neutral-700">{script.script}</p>
                    {!script.approved && (
                      <button
                        type="button"
                        onClick={approvePlan}
                        disabled={!!action || !canApprove}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {action === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve storyboard
                      </button>
                    )}
                  </div>

                  {scenes.length > 0 && (
                    <div className="grid gap-3">
                      {scenes.map((scene, index) => (
                        <div key={`${scene.title}-${index}`} className="rounded-xl border border-neutral-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-neutral-950">
                              {index + 1}. {scene.title || "Scene"}
                            </h3>
                            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-500">
                              {scene.duration_sec ?? 5}s
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-neutral-600">{scene.prompt}</p>
                        </div>
                      ))}

                      <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-4 text-white">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Director handoff</h3>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
                              Approve the storyboard, then send it to the Create flow as an editable AI Director plan.
                            </p>
                          </div>
                          {script.approved ? (
                            <button
                              type="button"
                              onClick={sendToDirector}
                              disabled={!!action || !canSendToDirector}
                              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-neutral-100 disabled:opacity-50"
                            >
                              {action === "handoff" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              Send to Director
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={approvePlan}
                              disabled={!!action || !canApprove}
                              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {action === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Approve storyboard
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500">
                  Select an angle, then generate the script and storyboard.
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            {nextAction && (
              <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5 text-white shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Next action</p>
                <p className="mt-2 text-sm leading-6 text-white/70">{nextAction.hint}</p>
                <p className="mt-2 text-xs leading-6 text-white/60">{nextAction.detail}</p>
                <button
                  type="button"
                  onClick={nextAction.onClick}
                  disabled={nextAction.disabled || !nextAction.onClick}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {action ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {nextAction.label}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-950">Readiness</h2>
              <div className="mt-4 space-y-3">
                {[
                  ["Sources discovered", sources.length > 0],
                  ["At least one source extracted", readySources > 0],
                  ["Angle selected", !!selectedAngle],
                  ["Script generated", !!script],
                  ["Storyboard generated", scenes.length > 0],
                  ["Script approved", !!script?.approved],
                ].map(([label, done]) => (
                  <div key={String(label)} className="flex items-center gap-2 text-sm">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-neutral-300" />
                    )}
                    <span className={done ? "text-neutral-950" : "text-neutral-500"}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-950">Director handoff</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Approve the storyboard, then send it to the Create flow as an editable AI Director plan.
              </p>
              <button
                type="button"
                onClick={sendToDirector}
                disabled={!!action || !canSendToDirector}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
                  canSendToDirector
                    ? "bg-neutral-950 text-white hover:bg-neutral-800"
                    : "cursor-not-allowed bg-neutral-100 text-neutral-400"
                }`}
              >
                {action === "handoff" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {script?.approved ? "Send to Director" : "Approve first"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* T-1120e — Render & post-production (UI-only): render status, Raw vs Final
                framing, and deep-links to the Job page where overlays/captions/branding/
                exports already live. No new route/API/DB; reuses generateExplainer + explainerJob. */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-950">Render &amp; post-production</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Render a code-based explainer (screenshots, animated text, voice-over) — a few cents,
                no AI footage. Finalize with captions, branding and social formats afterwards.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Raw</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">
                    Slides + voice-over from your approved storyboard.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Final</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">
                    Captions, lower-thirds, branding &amp; social formats.
                  </p>
                </div>
              </div>

              {explainerStoryboard && (
                <div className="mt-4">
                  <ExplainerPreview storyboard={explainerStoryboard} />
                  <button
                    type="button"
                    onClick={() => setStudioOpen(true)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
                  >
                    Open Explainer Studio
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => generateExplainer()}
                disabled={!!action || !canSendToDirector || explainerJob?.status === "in_progress"}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
                  canSendToDirector && explainerJob?.status !== "in_progress"
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "cursor-not-allowed bg-neutral-100 text-neutral-400"
                }`}
              >
                {action === "explainer" || explainerJob?.status === "in_progress" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {!script?.approved
                  ? "Approve first"
                  : explainerJob?.status === "done"
                    ? "Re-render explainer"
                    : "Render explainer (~$0.03)"}
              </button>

              {explainerJob?.status === "in_progress" && (
                <p className="mt-3 text-sm text-neutral-500">Rendering… (a few minutes)</p>
              )}

              {explainerJob?.status === "failed" && (
                <p className="mt-3 text-sm text-red-600">Render failed. Try again.</p>
              )}

              {explainerJob?.status === "done" && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Raw explainer ready
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Link
                      href={`/jobs/${explainerJob.id}`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                      Open post-production
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/library"
                      className="inline-flex w-full items-center justify-center rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      View in Library
                    </Link>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-emerald-700/80">
                    In post-production: add captions, lower-thirds with your angle, source cards, branding,
                    and export 16:9 / 9:16 / 1:1 for the Social Pack.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {studioOpen && studioInitial && (
        <div className="fixed inset-0 z-50 overflow-auto bg-white p-6">
          <div className="mx-auto max-w-6xl">
            <ExplainerStudio
              initial={studioInitial}
              plan={explainerStoryboard ?? undefined}
              onClose={() => setStudioOpen(false)}
              canRender={canSendToDirector}
              onSave={saveWorkingStoryboard}
              onClear={clearWorkingStoryboard}
              onRender={(sb) => {
                setStudioOpen(false);
                generateExplainer(sb);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
