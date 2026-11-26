"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Film, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type RemixSource = {
  id: string;
  prompt: string;
  created_at: string;
  output_url_final: string | null;
  target_duration_seconds: number | null;
};

export default function RemixPage() {
  const [sources, setSources] = useState<RemixSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  async function loadSources() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign in to remix one of your completed videos.");
        return;
      }

      const { data, error: queryError } = await supabase
        .from("jobs")
        .select("id, prompt, created_at, output_url_final, target_duration_seconds")
        .eq("user_id", user.id)
        .eq("status", "done")
        .not("output_url_final", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);
      if (queryError) throw queryError;
      setSources((data ?? []) as RemixSource[]);
    } catch {
      setError("Could not load your private video history. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/modules").then((response) => response.json()).then((data) => setEnabled(Boolean(data.modules?.parallax_remix))).catch(() => setEnabled(false));
    void loadSources();
  }, []);

  if (enabled === false) {
    return <div className="min-h-screen bg-[#f5f3ee] px-5 py-8 sm:px-8"><div className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold text-neutral-950">Parallax Remix désactivé</h1><p className="mt-2 text-sm text-neutral-600">Un administrateur doit réactiver ce module pour démarrer une nouvelle action.</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f3ee] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-800">
              <Sparkles className="h-3.5 w-3.5" /> Parallax Remix
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">Bring a finished video to life</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Choose one of your private completed videos, describe the new motion, and continue in the existing video composer. The source stays in your account and the new result is saved as its own job.
            </p>
          </div>
          <button type="button" onClick={() => void loadSources()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
            <RefreshCw className="h-4 w-4" /> Refresh history
          </button>
        </div>

        {loading && <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-12 text-sm text-neutral-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your private history…</div>}
        {!loading && error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</div>}
        {!loading && !error && sources.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <Film className="mx-auto h-8 w-8 text-neutral-400" />
            <h2 className="mt-3 text-lg font-semibold text-neutral-900">No completed video yet</h2>
            <p className="mt-1 text-sm text-neutral-500">Create a private video first, then come back here to remix it.</p>
            <Link href="/create/story" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Open video creator <ArrowRight className="h-4 w-4" /></Link>
          </div>
        )}

        {!loading && !error && sources.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => (
              <article key={source.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="aspect-video bg-neutral-900">
                  {source.output_url_final ? <video className="h-full w-full object-cover" src={source.output_url_final} controls preload="metadata" /> : null}
                </div>
                <div className="space-y-3 p-4">
                  <p className="line-clamp-3 min-h-[4.5rem] text-sm font-semibold leading-6 text-neutral-900">{source.prompt}</p>
                  <p className="text-xs text-neutral-500">{new Date(source.created_at).toLocaleString()} {source.target_duration_seconds ? `· ${source.target_duration_seconds}s` : ""}</p>
                  <Link href={`/create/remix?reference_job_id=${encodeURIComponent(source.id)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-800">
                    Remix this video <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


