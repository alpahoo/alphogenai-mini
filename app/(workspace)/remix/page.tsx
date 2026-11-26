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
    // The private history is only read once the module is confirmed on for this viewer.
    fetch("/api/modules").then((response) => response.json())
      .then((data) => { const on = Boolean(data.modules?.parallax_remix); setEnabled(on); if (on) void loadSources(); else setLoading(false); })
      .catch(() => { setEnabled(false); setLoading(false); });
  }, []);

  if (enabled === false) {
    return <div className="min-h-screen bg-background px-4 py-8 sm:px-8"><div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 text-card-foreground"><h1 className="text-2xl font-semibold">Parallax Remix is turned off</h1><p className="mt-2 text-sm text-muted-foreground">An administrator must turn this module back on before a new remix can start.</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3.5 w-3.5" /> Parallax Remix
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bring a finished video to life</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Choose one of your private completed videos, describe the new motion, and continue in the existing video composer. The source stays in your account and the new result is saved as its own job.
            </p>
          </div>
          <button type="button" onClick={() => void loadSources()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
            <RefreshCw className="h-4 w-4" /> Refresh history
          </button>
        </div>

        {loading && <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your private history…</div>}
        {enabled && !loading && error && <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{error}</div>}
        {enabled && !loading && !error && sources.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Film className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold">No completed video yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create a private video first, then come back here to remix it.</p>
            <Link href="/create/story" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Open video creator <ArrowRight className="h-4 w-4" /></Link>
          </div>
        )}

        {enabled && !loading && !error && sources.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => (
              <article key={source.id} className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
                <div className="aspect-video bg-neutral-900">
                  {source.output_url_final ? <video className="h-full w-full object-cover" src={source.output_url_final} controls preload="metadata" /> : null}
                </div>
                <div className="space-y-3 p-4">
                  <p className="line-clamp-3 min-h-[4.5rem] break-words text-sm font-semibold leading-6">{source.prompt}</p>
                  <p className="text-xs text-muted-foreground">{new Date(source.created_at).toLocaleString()} {source.target_duration_seconds ? `· ${source.target_duration_seconds}s` : ""}</p>
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


