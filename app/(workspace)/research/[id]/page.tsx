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
  Send,
  Loader2,
  Radio,
  SearchCheck,
  Wand2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  extracted_markdown: string | null;
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

function sourceTone(status: string) {
  if (status === "success") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "failed" || status === "blocked" || status === "timeout") {
    return "text-red-700 bg-red-50 border-red-200";
  }
  return "text-neutral-600 bg-neutral-50 border-neutral-200";
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
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      const [jobResult, sourceResult, angleResult, scriptResult] = await Promise.all([
        supabase
          .from("research_jobs")
          .select("*")
          .eq("id", jobId)
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("research_sources")
          .select("id, url, title, source_type, credibility_score, selected, extraction_status, extraction_error, extracted_markdown")
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
      ]);

      if (jobResult.error) throw jobResult.error;
      setJob(jobResult.data as ResearchJob);
      setSources((sourceResult.data ?? []) as ResearchSource[]);
      setAngles((angleResult.data ?? []) as ResearchAngle[]);
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

  async function approvePlan() {
    if (!job || !script || scenes.length === 0) {
      setError("Generate a script and storyboard before approving.");
      return;
    }

    setAction("approve");
    setError(null);
    try {
      const { error: scriptError } = await supabase
        .from("research_scripts")
        .update({ approved: true })
        .eq("id", script.id)
        .eq("research_job_id", jobId);
      if (scriptError) throw scriptError;

      const { error: jobError } = await supabase
        .from("research_jobs")
        .update({ status: "approved" })
        .eq("id", jobId)
        .eq("user_id", job.user_id);
      if (jobError) throw jobError;

      await load();
    } catch {
      setError("Could not approve this research plan.");
    } finally {
      setAction(null);
    }
  }

  async function sendToDirector() {
    if (!job || !script || !script.approved || scenes.length === 0) {
      setError("Approve a storyboard before sending it to Director.");
      return;
    }

    setAction("handoff");
    setError(null);
    try {
      const payload = {
        researchJobId: job.id,
        topic: job.topic,
        mode: job.mode,
        language: job.language,
        angleTitle: selectedAngle?.title ?? null,
        angleHook: selectedAngle?.hook ?? null,
        script: script.script,
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

  const readySources = sources.filter((s) => s.extraction_status === "success").length;
  const selectedAngle = angles.find((a) => a.selected);
  const scenes = storyboard?.scenes_json ?? [];
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

          <div className="mt-6 grid gap-2 md:grid-cols-6">
            {STEPS.map((step, index) => (
              <div key={step.key} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-1 text-sm font-semibold text-neutral-950">{step.label}</p>
              </div>
            ))}
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
                  sources.map((source) => (
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
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sourceTone(source.extraction_status)}`}>
                            {source.extraction_status}
                          </span>
                        </div>
                      </div>
                      {source.extracted_markdown && (
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">
                          {source.extracted_markdown}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

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
                  angles.map((angle) => (
                    <button
                      key={angle.id}
                      onClick={() => selectAngle(angle.id)}
                      disabled={action === "select-angle"}
                      className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${
                        angle.selected
                          ? "border-neutral-950 bg-neutral-950 text-white"
                          : "border-neutral-200 bg-neutral-50 text-neutral-950 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold">{angle.title}</h3>
                        {angle.selected && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                      </div>
                      <p className={`mt-2 text-sm leading-6 ${angle.selected ? "text-white/75" : "text-neutral-600"}`}>
                        {angle.hook}
                      </p>
                      {angle.positioning && (
                        <p className={`mt-3 text-xs leading-5 ${angle.selected ? "text-white/55" : "text-neutral-500"}`}>
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
                    <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-700">{script.script}</p>
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

          <aside className="space-y-4">
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
          </aside>
        </div>
      </div>
    </div>
  );
}
