"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  Clock,
  Copy,
  Eye,
  Loader2,
  Plus,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ResearchMode = "news" | "tutorial" | "product" | "competitor";

interface ResearchJob {
  id: string;
  topic: string;
  input_url: string | null;
  mode: ResearchMode;
  status: string;
  language: string;
  target_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

interface ResearchWatchlist {
  id: string;
  name: string;
  topic: string;
  url: string;
  mode: ResearchMode;
  status: "active" | "paused";
  last_changed_at: string | null;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brief",
  discovering: "Discovering",
  extracting: "Extracting",
  ready_for_angles: "Angles ready",
  scripting: "Script ready",
  approved: "Approved",
  sent_to_director: "In Director",
  failed: "Needs review",
};

const MODE_LABELS: Record<ResearchMode, string> = {
  news: "News",
  tutorial: "Tutorial",
  product: "Product",
  competitor: "Competitor",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: string) {
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "sent_to_director" || status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "discovering" || status === "extracting") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "scripting" || status === "ready_for_angles") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

function FieldHelp({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-500">
      <span className="font-semibold text-neutral-800">{title}</span>
      <span className="ml-1">{children}</span>
    </div>
  );
}

export default function ResearchPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [mode, setMode] = useState<ResearchMode>("news");
  const [duration, setDuration] = useState(60);
  const [watchlists, setWatchlists] = useState<ResearchWatchlist[]>([]);
  const [watchlistsLoading, setWatchlistsLoading] = useState(true);
  const [watchlistCreating, setWatchlistCreating] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistName, setWatchlistName] = useState("");
  const [watchlistUrl, setWatchlistUrl] = useState("");
  const [watchlistTopic, setWatchlistTopic] = useState("");
  const [copiedWatchlistId, setCopiedWatchlistId] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadJobs = useCallback(async () => {
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

      const { data, error: fetchError } = await supabase
        .from("research_jobs")
        .select("id, topic, input_url, mode, status, language, target_duration_seconds, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(30);

      if (fetchError) throw fetchError;
      setJobs((data ?? []) as ResearchJob[]);
    } catch {
      setError("Could not load research jobs.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  const loadWatchlists = useCallback(async () => {
    setWatchlistsLoading(true);
    setWatchlistError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/research/watchlists", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Watchlists unavailable");
      const json = await res.json();
      setWatchlists((json.watchlists ?? []) as ResearchWatchlist[]);
    } catch {
      setWatchlistError("Watchlists will appear after the T-1108 migration is applied.");
    } finally {
      setWatchlistsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadJobs();
    loadWatchlists();
  }, [loadJobs, loadWatchlists]);

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

  async function createResearchJob() {
    const cleanTopic = topic.trim();
    if (cleanTopic.length < 3) {
      setError("Add a topic with at least 3 characters.");
      return;
    }

    setCreating(true);
    setCreateStatus("Creating your research brief...");
    setError(null);
    let isNavigating = false;
    try {
      const res = await fetch("/api/research/jobs", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          topic: cleanTopic,
          input_url: inputUrl.trim() || null,
          mode,
          language: "en-US",
          target_duration_seconds: duration,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Research job could not be created.");
      setCreateStatus("Opening the research workspace...");
      isNavigating = true;
      router.push(`/research/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research job could not be created.");
      setCreateStatus(null);
    } finally {
      if (!isNavigating) setCreating(false);
    }
  }

  async function createWatchlist() {
    const cleanName = watchlistName.trim();
    const cleanTopic = watchlistTopic.trim();
    const cleanUrl = watchlistUrl.trim();
    if (cleanName.length < 2 || cleanTopic.length < 3 || !cleanUrl.startsWith("http")) {
      setWatchlistError("Add a name, topic, and valid http/https URL.");
      return;
    }

    setWatchlistCreating(true);
    setWatchlistError(null);
    try {
      const res = await fetch("/api/research/watchlists", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          name: cleanName,
          topic: cleanTopic,
          url: cleanUrl,
          mode,
          status: "active",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Watchlist could not be created.");
      setWatchlistName("");
      setWatchlistTopic("");
      setWatchlistUrl("");
      await loadWatchlists();
    } catch (err) {
      setWatchlistError(err instanceof Error ? err.message : "Watchlist could not be created.");
    } finally {
      setWatchlistCreating(false);
    }
  }

  async function copyWatchlistText(value: string, watchlistId: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWatchlistId(watchlistId);
      window.setTimeout(() => setCopiedWatchlistId((current) => (current === watchlistId ? null : current)), 1800);
    } catch {
      setWatchlistError("Could not copy to clipboard.");
    }
  }

  function webhookUrlForWatchlist(watchlistId: string) {
    if (typeof window === "undefined") return `/api/webhooks/changedetection/${watchlistId}`;
    return `${window.location.origin}/api/webhooks/changedetection/${watchlistId}`;
  }

  return (
    <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 text-white shadow-sm">
          <div className="grid gap-8 p-6 lg:grid-cols-[1fr_0.72fr] lg:p-8">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                <SearchCheck className="h-3.5 w-3.5" />
                Research Studio
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight lg:text-5xl">
                Turn a topic, URL, or product into a sourced video plan.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65">
                Discover sources, extract useful evidence, generate editorial angles, then prepare a Director-ready storyboard.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  ["Sources", "Search and extract"],
                  ["Angles", "Pick the strategy"],
                  ["Storyboard", "Send to Director"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white p-4 text-neutral-950 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">New research brief</h2>
              </div>

              <div className="mt-4 space-y-3">
                <FieldHelp title="Brief">
                  Describe the video you want, the audience, and the structure. Example: create a 90s French tutorial for beginners with a hook, 3 steps, limits, and a final action.
                </FieldHelp>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="What should AlphoResearch investigate?"
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                />
                <input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Optional URL"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                />
                <FieldHelp title="Optional URL">
                  Add the official article, product page, docs page, or release note when you already know the source. Leave empty to let Research discover sources.
                </FieldHelp>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ResearchMode)}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none"
                  >
                    {Object.entries(MODE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none"
                  >
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                    <option value={120}>120s</option>
                    <option value={180}>180s</option>
                  </select>
                </div>
                <FieldHelp title="Mode and duration">
                  News summarizes an update, Tutorial teaches steps, Product explains an offer, Competitor analyzes positioning. Duration is the target length for the script/storyboard.
                </FieldHelp>
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
                {createStatus && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-950" />
                      {createStatus}
                    </div>
                    <div className="h-1 bg-neutral-200">
                      <div className="h-full w-1/2 animate-pulse rounded-r-full bg-neutral-950" />
                    </div>
                  </div>
                )}
                <button
                  onClick={createResearchJob}
                  disabled={creating}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-80"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? "Starting research..." : "Start research"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-neutral-950">Create watchlist</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Monitor a product page, release page, or competitor URL. Changes create draft research only.
            </p>
            <div className="mt-4 space-y-3">
              <FieldHelp title="Watchlist">
                Use this for pages you want to monitor over time. When the page changes, AlphoGen creates a draft Research plan only.
              </FieldHelp>
              <input
                value={watchlistName}
                onChange={(e) => setWatchlistName(e.target.value)}
                placeholder="Watchlist name"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
              />
              <input
                value={watchlistUrl}
                onChange={(e) => setWatchlistUrl(e.target.value)}
                placeholder="https://example.com/releases"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
              />
              <textarea
                value={watchlistTopic}
                onChange={(e) => setWatchlistTopic(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="What should AlphoResearch investigate when this changes?"
                className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
              />
              <FieldHelp title="Example">
                Name: OpenAI updates. URL: official news page. Topic: create a French draft explaining what changed, why it matters, and a short video plan for creators.
              </FieldHelp>
              {watchlistError && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {watchlistError}
                </p>
              )}
              <button
                type="button"
                onClick={createWatchlist}
                disabled={watchlistCreating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {watchlistCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Create watchlist
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Watchlists
                </h2>
                <p className="mt-1 text-sm text-neutral-500">Detected changes become draft research plans.</p>
              </div>
              <button onClick={loadWatchlists} className="text-sm font-semibold text-neutral-950 hover:underline">
                Refresh
              </button>
            </div>

            {watchlistsLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading watchlists
              </div>
            ) : watchlists.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500">
                No watchlists yet. Add one to monitor changes without auto-publishing anything.
              </div>
            ) : (
              <div className="grid gap-3">
                {watchlists.map((watchlist) => (
                  <div key={watchlist.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-950">{watchlist.name}</p>
                        <a
                          href={watchlist.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate text-xs text-neutral-500 hover:text-neutral-950"
                        >
                          {watchlist.url}
                        </a>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        watchlist.status === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-neutral-200 bg-white text-neutral-500"
                      }`}>
                        {watchlist.status}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-600">{watchlist.topic}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                      <span>{MODE_LABELS[watchlist.mode]}</span>
                      {watchlist.last_changed_at && <span>Changed {formatDate(watchlist.last_changed_at)}</span>}
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => copyWatchlistText(webhookUrlForWatchlist(watchlist.id), watchlist.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedWatchlistId === watchlist.id ? "Copied" : "Copy webhook URL"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyWatchlistText(watchlist.id, watchlist.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
                      >
                        Copy ID
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-neutral-400">
                      Copy webhook URL is for changedetection.io. Copy ID is only for manual debugging or support.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Recent research
            </h2>
            <button onClick={loadJobs} className="text-sm font-semibold text-neutral-950 hover:underline">
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading research
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
              <BookOpenCheck className="mx-auto h-10 w-10 text-neutral-300" />
              <p className="mt-3 text-sm font-semibold text-neutral-950">No research brief yet</p>
              <p className="mt-1 text-sm text-neutral-500">Create one to build a sourced video plan.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/research/${job.id}`}
                  className="group grid gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md md:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(job.status)}`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                      <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {MODE_LABELS[job.mode]}
                      </span>
                    </div>
                    <h3 className="mt-3 truncate text-base font-semibold text-neutral-950">{job.topic}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(job.updated_at || job.created_at)}
                      </span>
                      {job.target_duration_seconds && <span>{job.target_duration_seconds}s target</span>}
                      {job.input_url && <span className="truncate">{job.input_url}</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-sm font-semibold text-neutral-950">
                    Open plan
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
