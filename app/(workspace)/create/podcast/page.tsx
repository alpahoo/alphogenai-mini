"use client";

// T-1131f — Podcast Video guided entry (V1).
// A simple, guided "topic -> dialogue -> voices -> render -> MP4" flow that drives
// the existing podcast backend (no new API, no migration, no Modal change).
// V1 scope: Generate-script only (no upload), read-only dialogue (no segment
// edit), default host/guest voices (no picker), two_shot layout only, no lip-sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Mic, Pause, Play,
  Podcast, Sparkles, Film, FileText, Clapperboard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Speaker = { id: string; role: "host" | "guest"; name: string; position: number };
type Segment = {
  id: string;
  speaker_id: string;
  order_index: number;
  text: string;
  audio_url: string | null;
  status: "pending" | "ready" | "failed";
};
type PodcastRow = {
  id: string;
  title: string;
  status: string;
  language: string;
  layout: string;
  aspect_ratio: string;
  render_status: "idle" | "rendering" | "done" | "failed";
  video_url: string | null;
  render_error: string | null;
};

const LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "fr-FR", label: "Français" },
  { code: "es-ES", label: "Español" },
  { code: "de-DE", label: "Deutsch" },
];

const ROLE_COLOR: Record<string, string> = { host: "#34c98a", guest: "#5b8def" };

const RENDER_POLL_TIMEOUT_MS = 5 * 60 * 1000; // stop polling a stuck render after 5 min

const STEPS = [
  { n: 1, label: "Write dialogue", Icon: FileText },
  { n: 2, label: "Generate voices", Icon: Mic },
  { n: 3, label: "Render podcast", Icon: Clapperboard },
  { n: 4, label: "Final video", Icon: Film },
];

export default function CreatePodcastPage() {
  const supabase = useMemo(() => createClient(), []);

  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("en-US");

  const [podcast, setPodcast] = useState<PodcastRow | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  const [phase, setPhase] = useState<"idle" | "scripting" | "voicing" | "rendering">("idle");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const speakerById = useMemo(() => Object.fromEntries(speakers.map((s) => [s.id, s])), [speakers]);
  const hasDialogue = segments.length > 0;
  const allReady = hasDialogue && segments.every((s) => s.status === "ready" && s.audio_url);
  const anyAudio = segments.some((s) => s.audio_url);
  const rendering = podcast?.render_status === "rendering" || phase === "rendering";
  const currentStep = !hasDialogue ? 1 : !anyAudio ? 2 : podcast?.video_url ? 4 : 3;

  // ── auth header helper ────────────────────────────────────────────────
  const authHeaders = useCallback(async (): Promise<HeadersInit | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
  }, [supabase]);

  // ── cleanup ───────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  // ── Step 1: create podcast + generate dialogue ────────────────────────
  async function generateDialogue() {
    const clean = topic.trim();
    if (clean.length < 3) { setError("Add a topic (a sentence or two) to start."); return; }
    setError(null);
    setPhase("scripting");
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); setPhase("idle"); return; }

      let pid = podcast?.id;
      // Create the podcast only once; re-generating reuses the same draft.
      if (!pid) {
        const res = await fetch("/api/podcasts", {
          method: "POST",
          headers,
          body: JSON.stringify({ source_mode: "generate", source_topic: clean, language, layout: "two_shot" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Could not create the podcast.");
        setPodcast(json.podcast);
        setSpeakers(json.speakers || []);
        pid = json.podcast.id;
      }

      const res = await fetch(`/api/podcasts/${pid}/script`, {
        method: "POST",
        headers,
        body: JSON.stringify({ topic: clean }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not write the dialogue.");
      setSegments(json.segments || []);
      // New dialogue → drop any previously rendered video locally (backend reset it too).
      setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write the dialogue.");
    } finally {
      setPhase("idle");
    }
  }

  // ── Step 2: generate voices (full) ────────────────────────────────────
  async function generateVoices(force = false) {
    if (!podcast) return;
    setError(null);
    setPhase("voicing");
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); setPhase("idle"); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify(force ? { force: true } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not generate the voices.");
      // Merge returned segment statuses/urls back in.
      const byId = Object.fromEntries((json.segments || []).map((s: Segment) => [s.id, s]));
      setSegments((prev) => prev.map((s) => (byId[s.id] ? { ...s, ...byId[s.id] } : s)));
      // Audio actually changed → drop the stale rendered video locally (backend reset it).
      if (json.ready > 0) {
        setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));
      }
      if (json.failed > 0) setError(`${json.failed} segment(s) couldn't be voiced — try “Regenerate voices”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the voices.");
    } finally {
      setPhase("idle");
    }
  }

  // ── preview a single segment's audio ──────────────────────────────────
  function togglePlay(seg: Segment) {
    if (!seg.audio_url) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playing === seg.id) { setPlaying(null); return; }
    const a = new Audio(seg.audio_url);
    audioRef.current = a;
    setPlaying(seg.id);
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
  }

  // ── Step 3: render + poll ─────────────────────────────────────────────
  const pollPodcast = useCallback(async () => {
    if (!podcast) return;
    // Give up after the timeout so a stuck render never polls forever.
    if (pollStartRef.current && Date.now() - pollStartRef.current > RENDER_POLL_TIMEOUT_MS) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setPhase("idle");
      setError("Render is taking longer than expected. You can refresh this page or try again.");
      return;
    }
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch(`/api/podcasts/${podcast.id}`, { headers });
    if (!res.ok) return;
    const json = await res.json();
    setPodcast(json.podcast);
    if (json.segments) setSegments(json.segments);
    const rs = json.podcast?.render_status;
    if (rs === "done" || rs === "failed") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setPhase("idle");
      if (rs === "failed") setError(json.podcast?.render_error || "The render failed. Please try again.");
    }
  }, [podcast, authHeaders]);

  async function renderPodcast() {
    if (!podcast || !allReady) return;
    setError(null);
    setPhase("rendering");
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); setPhase("idle"); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/render`, { method: "POST", headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not start the render.");
      setPodcast((p) => (p ? { ...p, render_status: "rendering", video_url: null } : p));
      if (pollRef.current) clearInterval(pollRef.current);
      pollStartRef.current = Date.now();
      pollRef.current = setInterval(pollPodcast, 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the render.");
      setPhase("idle");
    }
  }

  // resume polling if we land on a rendering podcast
  useEffect(() => {
    if (podcast?.render_status === "rendering" && !pollRef.current) {
      if (!pollStartRef.current) pollStartRef.current = Date.now();
      pollRef.current = setInterval(pollPodcast, 3500);
    }
  }, [podcast?.render_status, pollPodcast]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/create" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> Back to workflows
      </Link>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
          <Podcast className="h-3.5 w-3.5" /> Podcast Video
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-900">Turn your ideas into podcasts</h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-neutral-500">
          Describe a topic. AlphoGen writes a two-person conversation, voices each speaker, and renders a
          two-shot podcast video — no setup.
        </p>
      </motion.div>

      {/* Stepper */}
      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = currentStep > s.n || (s.n === 4 && !!podcast?.video_url);
          const active = currentStep === s.n;
          return (
            <div key={s.n} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  done ? "bg-green-500/20 text-green-600" : active ? "bg-amber-500/15 text-amber-700" : "bg-neutral-100 text-neutral-400"
                }`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                </div>
                <div className="hidden sm:block text-sm font-semibold text-neutral-700">{s.label}</div>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 ${done ? "bg-green-500/30" : "bg-neutral-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* Entry / brief */}
      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-neutral-800">What should the podcast be about?</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. How small teams can ship AI video ads faster in 2026"
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-500">
            Format 16:9 · Two-shot
          </span>
          <button
            onClick={generateDialogue}
            disabled={phase === "scripting"}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {phase === "scripting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {phase === "scripting" ? "Writing dialogue…" : hasDialogue ? "Rewrite dialogue" : "Generate dialogue"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Dialogue (read-only) */}
      {hasDialogue && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">Dialogue</h2>
            {anyAudio ? (
              <button onClick={() => generateVoices(true)} disabled={phase === "voicing"}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-60">
                {phase === "voicing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                Regenerate voices
              </button>
            ) : (
              <button onClick={() => generateVoices(false)} disabled={phase === "voicing"}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60">
                {phase === "voicing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {phase === "voicing" ? "Generating voices…" : "Generate voices"}
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {segments.map((seg) => {
              const sp = speakerById[seg.speaker_id];
              const role = sp?.role ?? "host";
              const color = ROLE_COLOR[role];
              return (
                <div key={seg.id} className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: color }}>
                    {(sp?.name?.[0] ?? role[0]).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{sp?.name ?? role}</span>
                      <SegmentBadge status={seg.status} />
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-neutral-800">{seg.text}</p>
                  </div>
                  {seg.audio_url && (
                    <button onClick={() => togglePlay(seg)} title="Preview"
                      className="shrink-0 rounded-full border border-neutral-200 p-2 text-neutral-600 transition hover:bg-neutral-50">
                      {playing === seg.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Render */}
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Render podcast</h3>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {allReady ? "All voices are ready — render the two-shot video." : "Generate voices for every line before rendering."}
                </p>
              </div>
              <button
                onClick={renderPodcast}
                disabled={!allReady || rendering}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                {rendering ? "Rendering…" : "Render podcast"}
              </button>
            </div>

            {rendering && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <Loader2 className="h-4 w-4 animate-spin" /> Composing your podcast video — this usually takes under a minute.
              </div>
            )}

            {podcast?.render_status === "done" && podcast.video_url && (
              <div className="mt-4">
                <video src={podcast.video_url} controls className="w-full rounded-xl border border-neutral-200 shadow-sm" />
                <a href={podcast.video_url} target="_blank" rel="noreferrer"
                   className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Download MP4
                </a>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function SegmentBadge({ status }: { status: Segment["status"] }) {
  if (status === "ready")
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700"><CheckCircle2 className="h-3 w-3" /> Ready</span>;
  if (status === "failed")
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700"><AlertTriangle className="h-3 w-3" /> Failed</span>;
  return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500">Pending</span>;
}
