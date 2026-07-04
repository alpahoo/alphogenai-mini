"use client";

// T-1131f — Podcast Video guided entry (V1).
// A simple, guided "topic -> dialogue -> voices -> render -> MP4" flow that drives
// the existing podcast backend (no new API, no migration, no Modal change).
// V1 scope: Generate-script only (no upload), editable dialogue lines,
// two_shot layout only, no lip-sync. T-1132b adds a Voice Lab: host/guest voice
// pickers + per-voice preview (cached) wired to PATCH /speakers + /voice-preview.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Mic, Pause, Play,
  Podcast, Sparkles, Film, FileText, Clapperboard, Clock, Globe2, Link2, Upload,
  Pencil, Save, X, ChevronUp, ChevronDown, Trash2, Plus, Copy, Archive,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PODCAST_VOICES, DEFAULT_HOST_VOICE, DEFAULT_GUEST_VOICE, getPodcastVoice } from "@/lib/podcast/voice-catalog";
import {
  estimatePodcastLipsync,
  secondsFromText,
  formatUsd,
  formatEstimatedTime,
} from "@/lib/podcast/lipsync-estimate";

type Speaker = { id: string; role: "host" | "guest"; name: string; position: number; voice_id?: string | null; persona_id?: string | null };
type Persona = { id: string; name: string; portrait_url: string | null; thumb_url: string | null; is_catalog: boolean };
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
  target_duration_seconds?: number | null;
  created_at?: string | null;
  source_topic?: string | null;
  source_asset_url?: string | null;
  metadata?: { podcast_style?: string; target_duration_seconds?: number; render_mode?: string } | null;
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

const DURATION_OPTIONS = [
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
];

const STYLE_OPTIONS = [
  { value: "casual", label: "Casual", desc: "Warm conversation" },
  { value: "news", label: "News", desc: "Context and what changed" },
  { value: "expert", label: "Expert", desc: "Analysis and tradeoffs" },
  { value: "debate", label: "Debate", desc: "Two viewpoints" },
  { value: "documentary", label: "Documentary", desc: "Narrative explainer" },
];

// Render mode (T-1144b-lite). Copy is deliberately explicit: "Talking visual"
// animates real people but is NOT exact lip-sync. "Lip-sync premium" is not
// active yet (soon) — shown disabled so the option is visible but not selectable.
const RENDER_MODE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "static", label: "Static", desc: "Fixed portrait cards. Fastest. Free." },
  { value: "talking_visual", label: "Talking visual", desc: "Real people, animated — not exact lip-sync. Free." },
  { value: "lipsync_premium", label: "Lip-sync premium", desc: "Exact per-speaker lip-sync. Paid — cost shown before render." },
];

const STEPS = [
  { n: 1, label: "Write dialogue", Icon: FileText },
  { n: 2, label: "Generate voices", Icon: Mic },
  { n: 3, label: "Render podcast", Icon: Clapperboard },
  { n: 4, label: "Final video", Icon: Film },
];

// Guided loading copy shown while the script is being written (T-1139).
const SCRIPT_LOADING_STEPS = [
  "Parsing your topic & source",
  "Structuring the conversation",
  "Drafting the dialogue",
  "Almost ready to review",
];

export default function CreatePodcastPage() {
  const supabase = useMemo(() => createClient(), []);

  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetDuration, setTargetDuration] = useState(120);
  const [podcastStyle, setPodcastStyle] = useState("casual");
  const [renderMode, setRenderMode] = useState("talking_visual");
  // Lip-sync premium opt-in gate (T-1145). Confirmation is required (with a cost
  // estimate) before the premium mode can be selected. No credits are spent here;
  // the real lip-sync render ships in T-1144b.
  const [lipsyncConfirmOpen, setLipsyncConfirmOpen] = useState(false);
  const [lipsyncConfirmed, setLipsyncConfirmed] = useState(false);

  const [podcast, setPodcast] = useState<PodcastRow | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  const [phase, setPhase] = useState<"idle" | "scripting" | "voicing" | "rendering">("idle");
  const [scriptStep, setScriptStep] = useState(0); // guided loading index (T-1139)
  const [recentPodcasts, setRecentPodcasts] = useState<PodcastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Voice Lab (T-1132b)
  const [previewing, setPreviewing] = useState<string | null>(null); // voice id loading/playing
  const [savingVoice, setSavingVoice] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Duo picker (T-1136d) — catalog personas for host/guest
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [savingPersona, setSavingPersona] = useState(false);
  // My Personas upload (T-1138)
  const [uploadName, setUploadName] = useState("");
  const [uploadConsent, setUploadConsent] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const personaFileRef = useRef<HTMLInputElement | null>(null);

  // Dialogue editing (T-1133a)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // T-1133c: add / delete / reorder
  const [addRole, setAddRole] = useState<"host" | "guest">("host");
  const [addText, setAddText] = useState("");
  const [addingLine, setAddingLine] = useState(false);
  const [structuring, setStructuring] = useState(false); // delete/move in progress
  const [voiceProgress, setVoiceProgress] = useState<string | null>(null); // "N left" while batching
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [voicingSegmentId, setVoicingSegmentId] = useState<string | null>(null);

  const hostSpeaker = useMemo(() => speakers.find((s) => s.role === "host"), [speakers]);
  const guestSpeaker = useMemo(() => speakers.find((s) => s.role === "guest"), [speakers]);
  const hostVoice = hostSpeaker?.voice_id || DEFAULT_HOST_VOICE;
  const guestVoice = guestSpeaker?.voice_id || DEFAULT_GUEST_VOICE;
  const hostPersonaId = hostSpeaker?.persona_id ?? null;
  const guestPersonaId = guestSpeaker?.persona_id ?? null;

  const speakerById = useMemo(() => Object.fromEntries(speakers.map((s) => [s.id, s])), [speakers]);
  const hasDialogue = segments.length > 0;
  const allReady = hasDialogue && segments.every((s) => s.status === "ready" && s.audio_url);
  const anyAudio = segments.some((s) => s.audio_url);
  const pendingVoiceCount = segments.filter((s) => s.status !== "ready" || !s.audio_url).length;
  // Live lip-sync estimate (T-1145): active-speaker lip-sync = one clip per segment.
  // Durations are proxied from text length pre-render. No HeyGen call, no spend.
  const lipsyncEstimate = useMemo(
    () => estimatePodcastLipsync(segments.map((s) => secondsFromText(s.text))),
    [segments],
  );
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
      if (previewAudioRef.current) previewAudioRef.current.pause();
    };
  }, []);

  // ── Step 1: create podcast + generate dialogue ────────────────────────
  async function generateDialogue() {
    const clean = topic.trim();
    if (clean.length < 3) { setError("Add a topic (a sentence or two) to start."); return; }
    const cleanUrl = sourceUrl.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      setError("The source link must start with http:// or https://");
      return;
    }
    setError(null);
    setPhase("scripting");
    // Premium isn't a live render mode yet (T-1144b) and the API rejects it —
    // persist the free equivalent so drafting never 400s. The UI keeps the premium
    // selection for cost disclosure; the render itself is separately gated.
    const persistRenderMode = renderMode === "lipsync_premium" ? "talking_visual" : renderMode;
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); setPhase("idle"); return; }

      let pid = podcast?.id;
      // Create the podcast only once; re-generating reuses the same draft.
      if (!pid) {
        const res = await fetch("/api/podcasts", {
          method: "POST",
          headers,
          body: JSON.stringify({
            source_mode: "generate",
            source_topic: clean,
            source_asset_url: cleanUrl || undefined,
            language,
            layout: "two_shot",
            podcast_style: podcastStyle,
            target_duration_seconds: targetDuration,
            render_mode: persistRenderMode,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Could not create the podcast.");
        setPodcast(json.podcast);
        setSpeakers(json.speakers || []);
        pid = json.podcast.id;
      } else {
        // Rewrite: persist the latest studio settings (style/duration) BEFORE the
        // script call so a reopen restores them. Metadata-only — no render
        // invalidation. If it fails, stop here (don't rewrite with unsaved settings).
        const metaRes = await fetch(`/api/podcasts/${pid}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ podcast_style: podcastStyle, target_duration_seconds: targetDuration, render_mode: persistRenderMode }),
        }).catch(() => null);
        if (!metaRes || !metaRes.ok) {
          const j = metaRes ? await metaRes.json().catch(() => ({})) : {};
          throw new Error(j?.error || "Could not save the style/duration. Try again.");
        }
      }

      const res = await fetch(`/api/podcasts/${pid}/script`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: clean,
          target_duration_seconds: targetDuration,
          style: podcastStyle,
        }),
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

  // ── Voice Lab (T-1132b): choose + preview host/guest voices ───────────
  async function setSpeakerVoice(role: "host" | "guest", voiceId: string) {
    if (!podcast) return;
    // Guard same voice for both speakers (the backend rejects it too).
    const other = role === "host" ? guestVoice : hostVoice;
    if (voiceId === other) {
      setError("Host and guest must use different voices.");
      return;
    }
    setError(null);
    setSavingVoice(true);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const body = role === "host" ? { host_voice_id: voiceId } : { guest_voice_id: voiceId };
      const res = await fetch(`/api/podcasts/${podcast.id}/speakers`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not save the voice.");
      if (json.speakers) setSpeakers(json.speakers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the voice.");
    } finally {
      setSavingVoice(false);
    }
  }

  // ── Guided loading while the script is being written (T-1139) ──────────
  useEffect(() => {
    if (phase !== "scripting") { setScriptStep(0); return; }
    setScriptStep(0);
    const id = setInterval(() => {
      setScriptStep((s) => Math.min(s + 1, SCRIPT_LOADING_STEPS.length - 1));
    }, 1400);
    return () => clearInterval(id);
  }, [phase]);

  // ── Reopen a draft/recent podcast via ?podcast_id= (T-1140) ────────────
  // Client-only: GET /api/podcasts/[id] already returns podcast+speakers+segments
  // in the exact shapes this page uses — just repopulate state, no new route.
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("podcast_id");
    if (!pid) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const res = await fetch(`/api/podcasts/${pid}`, { headers });
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !json.podcast) {
          if (!cancelled && !res.ok) setError("Could not open that podcast.");
          return;
        }
        const p = json.podcast as PodcastRow;
        setPodcast(p);
        setSpeakers(json.speakers || []);
        setSegments(json.segments || []);
        setTopic(p.source_topic || "");
        setSourceUrl(p.source_asset_url || "");
        if (p.language) setLanguage(p.language);
        // Studio settings restored from metadata (T-1141).
        const meta = p.metadata || {};
        if (meta.podcast_style) setPodcastStyle(meta.podcast_style);
        if (meta.target_duration_seconds) setTargetDuration(meta.target_duration_seconds);
        // Only restore a real render mode; premium is not selectable yet.
        if (meta.render_mode === "static" || meta.render_mode === "talking_visual") setRenderMode(meta.render_mode);
      } catch {
        if (!cancelled) setError("Could not open that podcast.");
      }
    })();
    return () => { cancelled = true; };
  }, [authHeaders]);

  // ── Recent podcasts (T-1139): read-only list for quick access ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const res = await fetch("/api/podcasts?limit=6", { headers });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(json.podcasts)) {
          setRecentPodcasts(json.podcasts as PodcastRow[]);
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  }, [authHeaders]);

  // ── Duo picker (T-1136d): load catalog personas + assign per speaker ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const res = await fetch("/api/podcast-personas", { headers });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(json.personas)) {
          // Catalog + the user's own personas (T-1138).
          setPersonas(json.personas as Persona[]);
        }
      } catch {
        /* non-blocking: the picker just stays empty */
      }
    })();
    return () => { cancelled = true; };
  }, [authHeaders]);

  // ── Library actions (T-1141): rename / archive / duplicate ─────────────
  async function renamePodcast(p: PodcastRow) {
    const next = window.prompt("Rename podcast", p.title || "Untitled podcast");
    if (next === null) return;
    const title = next.trim();
    if (!title) { setError("Title can't be empty."); return; }
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${p.id}`, { method: "PATCH", headers, body: JSON.stringify({ title }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "Rename failed."); }
      setRecentPodcasts((prev) => prev.map((x) => (x.id === p.id ? { ...x, title } : x)));
      setPodcast((cur) => (cur && cur.id === p.id ? { ...cur, title } : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    }
  }

  async function archivePodcast(p: PodcastRow) {
    if (!window.confirm(`Archive "${p.title || "Untitled podcast"}"? It will be removed from your library.`)) return;
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${p.id}`, { method: "DELETE", headers });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "Archive failed."); }
      setRecentPodcasts((prev) => prev.filter((x) => x.id !== p.id));
      // If the archived podcast is the one open in the editor, reset to the entry.
      if (podcast?.id === p.id) {
        setPodcast(null); setSpeakers([]); setSegments([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed.");
    }
  }

  async function duplicatePodcast(p: PodcastRow) {
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${p.id}/duplicate`, { method: "POST", headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.podcast) throw new Error(json?.error || "Duplicate failed.");
      // Open the fresh copy in the editor.
      window.location.href = `/create/podcast?podcast_id=${json.podcast.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed.");
    }
  }

  async function setSpeakerPersona(role: "host" | "guest", personaId: string | null) {
    if (!podcast) return;
    // Guard: host and guest can't share the same persona (backend rejects too).
    const other = role === "host" ? guestPersonaId : hostPersonaId;
    if (personaId && personaId === other) {
      setError("Host and guest must use different personas.");
      return;
    }
    setError(null);
    setSavingPersona(true);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const body = role === "host" ? { host_persona_id: personaId } : { guest_persona_id: personaId };
      const res = await fetch(`/api/podcasts/${podcast.id}/speakers`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not save the persona.");
      if (json.speakers) setSpeakers(json.speakers);
      // A persona change invalidates the rendered MP4 (backend cleared it too).
      setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the persona.");
    } finally {
      setSavingPersona(false);
    }
  }

  // ── My Personas (T-1138): upload a portrait + create an owned persona ──
  async function uploadPersona(file: File) {
    const name = uploadName.trim();
    if (name.length < 2) { setError("Give your presenter a name first."); return; }
    if (!uploadConsent) { setError("Please confirm you have the rights/consent for this image."); return; }
    setError(null);
    setUploadBusy(true);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const auth = (headers as Record<string, string>).Authorization;
      // 1) Upload the portrait bytes to the private bucket.
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/podcast-personas/upload", {
        method: "POST",
        headers: { Authorization: auth },
        body: fd,
      });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upJson?.error || "Could not upload the image.");
      // 2) Create the persona (source_kind=uploaded, consent required, screened).
      const res = await fetch("/api/podcast-personas", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          source_kind: "uploaded",
          portrait_path: upJson.storage_path,
          consent: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not create the persona.");
      if (json.persona) setPersonas((prev) => [...prev, json.persona as Persona]);
      setUploadName("");
      setUploadConsent(false);
      if (personaFileRef.current) personaFileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the persona.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function deletePersona(id: string) {
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcast-personas?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Could not remove the persona.");
      }
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      // If a speaker was using it, clear the selection (backend soft-deletes it;
      // render would fall back anyway).
      if (hostPersonaId === id) await setSpeakerPersona("host", null);
      if (guestPersonaId === id) await setSpeakerPersona("guest", null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the persona.");
    }
  }

  async function previewVoice(voiceId: string) {
    if (!podcast) return;
    // Toggle off if the same preview is playing.
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (previewing === voiceId) { setPreviewing(null); return; }
    setPreviewing(voiceId);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); setPreviewing(null); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/voice-preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ voice_id: voiceId }),
      });
      const json = await res.json();
      if (!res.ok || !json.audio_url) throw new Error(json?.error || "Could not preview this voice.");
      const a = new Audio(json.audio_url);
      previewAudioRef.current = a;
      a.onended = () => setPreviewing(null);
      a.onerror = () => setPreviewing(null);
      await a.play().catch(() => setPreviewing(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview this voice.");
      setPreviewing(null);
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
      // The backend voices a bounded batch per call (long-form). Loop until
      // `remaining` is 0 so the whole podcast gets voiced from one click.
      // A single batch can transiently fail (serverless timeout / gateway error
      // returning a non-JSON body); don't abort the whole run on it — retry the
      // batch a few times with backoff before giving up.
      const MAX_BATCHES = 40; // 60 lines / 12 per call = 5 batches; headroom for retries
      const MAX_CONSECUTIVE_FAILURES = 3;
      const RESUME_HINT = "Some lines are still pending — click “Generate pending voices” to resume.";
      let anyReady = false;
      let lastFailed = 0;
      let firstPass = true;
      let consecutiveFailures = 0;
      let completed = false;
      let lastRemaining = Number.NaN; // last remaining count reported by a successful batch
      for (let guard = 0; guard < MAX_BATCHES; guard++) {
        let res: Response;
        let json: { segments?: Segment[]; ready?: number; failed?: number; remaining?: number; error?: string };
        try {
          res = await fetch(`/api/podcasts/${podcast.id}/tts`, {
            method: "POST",
            headers,
            // force only matters on the first pass (regenerate already-ready lines).
            body: JSON.stringify(force && firstPass ? { force: true } : {}),
          });
          // A batch can fail with a non-OK status OR return HTTP 200 with a
          // non-JSON body (e.g. an HTML/text error page from a transient
          // gateway/timeout). Both must be treated as a retryable batch failure —
          // a 200 non-JSON must NOT be read as an empty {} (which would look like
          // `remaining = 0` and end the loop silently).
          let parsed: unknown;
          let parseOk = true;
          try {
            parsed = await res.json();
          } catch {
            parseOk = false;
          }
          json = (parsed ?? {}) as typeof json;
          if (!res.ok) throw new Error(json?.error || `Voice batch failed (HTTP ${res.status}).`);
          if (!parseOk) throw new Error("Voice batch returned an unexpected (non-JSON) response.");
        } catch {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            throw new Error(`Voice generation hit repeated errors. ${RESUME_HINT}`);
          }
          setVoiceProgress(`Retrying… (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
          await new Promise((r) => setTimeout(r, 1500 * consecutiveFailures));
          continue; // retry the same batch without consuming firstPass
        }
        consecutiveFailures = 0;
        firstPass = false;
        const byId = Object.fromEntries((json.segments || []).map((s: Segment) => [s.id, s]));
        setSegments((prev) => prev.map((s) => (byId[s.id] ? { ...s, ...byId[s.id] } : s)));
        if ((json.ready ?? 0) > 0) anyReady = true;
        lastFailed = json.failed || 0;
        const remaining = Number(json.remaining || 0);
        lastRemaining = remaining;
        setVoiceProgress(remaining > 0 ? `${remaining} line${remaining === 1 ? "" : "s"} left…` : null);
        if (remaining <= 0) { completed = true; break; }
      }
      // If we exhausted MAX_BATCHES without the backend reporting `remaining <= 0`,
      // do NOT treat the run as finished — surface a clear, actionable error.
      if (!completed) {
        const left = Number.isNaN(lastRemaining) ? "" : ` (${lastRemaining} left)`;
        throw new Error(`Voice generation didn't finish${left}. ${RESUME_HINT}`);
      }
      // Audio changed → drop the stale rendered video locally (backend reset it).
      if (anyReady) {
        setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));
      }
      if (lastFailed > 0) setError(`${lastFailed} segment(s) couldn't be voiced — try the line mic to retry.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the voices.");
    } finally {
      setPhase("idle");
      setVoiceProgress(null);
    }
  }

  async function generateSegmentVoice(seg: Segment) {
    if (!podcast) return;
    setError(null);
    setVoicingSegmentId(seg.id);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ preview: seg.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not generate this line.");
      const updated = Array.isArray(json.segments) ? json.segments[0] : null;
      if (updated) {
        setSegments((prev) => prev.map((s) => (s.id === seg.id ? { ...s, ...updated } : s)));
      }
      if (json.ready > 0) {
        setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));
      }
      if (json.failed > 0) setError("This line could not be voiced. Try again or edit it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate this line.");
    } finally {
      setVoicingSegmentId(null);
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

  function startEditSegment(seg: Segment) {
    setEditingSegmentId(seg.id);
    setEditingText(seg.text);
    setError(null);
  }

  function cancelEditSegment() {
    setEditingSegmentId(null);
    setEditingText("");
  }

  async function saveSegmentEdit(seg: Segment) {
    if (!podcast) return;
    const text = editingText.trim().replace(/\s+/g, " ");
    if (!text || text.length > 600) {
      setError("Dialogue line must be 1..600 characters.");
      return;
    }
    if (text === seg.text) {
      cancelEditSegment();
      return;
    }
    setSavingSegmentId(seg.id);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/segments/${seg.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok || !json.segment) throw new Error(json?.error || "Could not save this line.");
      setSegments((prev) => prev.map((s) => (s.id === seg.id ? { ...s, ...json.segment } : s)));
      if (playing === seg.id && audioRef.current) {
        audioRef.current.pause();
        setPlaying(null);
      }
      setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));
      cancelEditSegment();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this line.");
    } finally {
      setSavingSegmentId(null);
    }
  }

  // ── T-1133c: add / delete / reorder lines ─────────────────────────────
  const clearLocalVideo = () =>
    setPodcast((p) => (p ? { ...p, video_url: null, render_status: "idle", render_error: null } : p));

  async function addLine() {
    if (!podcast || segments.length >= 10) return;
    const text = addText.trim().replace(/\s+/g, " ");
    if (!text) { setError("Write the new line first."); return; }
    setAddingLine(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/segments`, {
        method: "POST",
        headers,
        body: JSON.stringify({ speaker_role: addRole, text }),
      });
      const json = await res.json();
      if (!res.ok || !json.segment) throw new Error(json?.error || "Could not add the line.");
      setSegments((prev) => [...prev, json.segment]);
      setAddText("");
      clearLocalVideo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the line.");
    } finally {
      setAddingLine(false);
    }
  }

  async function deleteLine(seg: Segment) {
    if (!podcast || segments.length <= 2) return;
    const needsConfirm = Boolean(seg.audio_url) || Boolean(podcast.video_url);
    if (needsConfirm && !window.confirm("Delete this line? Its audio and the rendered video will be discarded.")) {
      return;
    }
    setStructuring(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/segments/${seg.id}`, { method: "DELETE", headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not delete the line.");
      if (playing === seg.id && audioRef.current) { audioRef.current.pause(); setPlaying(null); }
      setSegments((prev) => prev.filter((s) => s.id !== seg.id));
      clearLocalVideo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the line.");
    } finally {
      setStructuring(false);
    }
  }

  async function moveLine(index: number, dir: -1 | 1) {
    if (!podcast) return;
    const target = index + dir;
    if (target < 0 || target >= segments.length) return;
    const reordered = [...segments];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setStructuring(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); return; }
      const res = await fetch(`/api/podcasts/${podcast.id}/segments/reorder`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ordered_ids: reordered.map((s) => s.id) }),
      });
      const json = await res.json();
      if (!res.ok || !json.segments) throw new Error(json?.error || "Could not reorder the lines.");
      setSegments(json.segments);
      clearLocalVideo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reorder the lines.");
    } finally {
      setStructuring(false);
    }
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
    // Lip-sync premium isn't renderable yet (real pipeline lands in T-1144b). Block
    // it here so a confirmed selection can't start a paid/failed render — no spend.
    if (renderMode === "lipsync_premium") {
      setError("Lip-sync premium arrive bientôt (T-1144b). Choisis Static ou Talking visual pour lancer un rendu maintenant.");
      return;
    }
    setError(null);
    setPhase("rendering");
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Please sign in again."); setPhase("idle"); return; }
      // Persist the chosen render mode (metadata-only) so the Modal renderer reads
      // the latest value even if it changed after the script was generated. If this
      // save fails we must NOT render — otherwise the render runs with stale metadata.
      const modeRes = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ render_mode: renderMode }),
      }).catch(() => null);
      if (!modeRes || !modeRes.ok) {
        const j = modeRes ? await modeRes.json().catch(() => ({})) : {};
        throw new Error(j?.error || "Could not save the render mode. Try again.");
      }
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
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-900">Create a podcast video</h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-neutral-500">
          Give a topic — we write the two-person script, voice each speaker, and render the video.
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

      {/* Entry / setup */}
      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <label className="block text-sm font-semibold text-neutral-900">Podcast setup</label>
            <p className="mt-1 text-xs text-neutral-500">
              Script engine: LiteLLM. Voices are selected and generated after the dialogue.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500">
            <Film className="h-3.5 w-3.5" /> 16:9 two-shot
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-semibold text-amber-800"
          >
            <FileText className="mr-2 inline h-4 w-4" /> Text idea
          </button>
          <button
            type="button"
            disabled
            title="Upload script/audio will be added in a later Podcast ticket."
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm font-semibold text-neutral-400"
          >
            <Upload className="mr-2 inline h-4 w-4" /> Upload script/audio (Soon)
          </button>
        </div>

        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter your raw idea, audience, or angle. Example: how creators can automate AI video production without losing quality."
          rows={4}
          maxLength={2000}
          className="mt-4 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
          <Link2 className="h-4 w-4 text-neutral-400" />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Optional source link (article, YouTube, product page)"
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
              <Clock className="h-3.5 w-3.5" /> Duration
            </span>
            <select
              value={targetDuration}
              onChange={(e) => setTargetDuration(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
            >
              {DURATION_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
              <Sparkles className="h-3.5 w-3.5" /> Style
            </span>
            <select
              value={podcastStyle}
              onChange={(e) => setPodcastStyle(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
            >
              {STYLE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-neutral-400">
              {STYLE_OPTIONS.find((s) => s.value === podcastStyle)?.desc}
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
              <Globe2 className="h-3.5 w-3.5" /> Language
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
        </div>

        {/* Render mode (T-1144b-lite) — explicit disclosure so users know the
            current visual is not exact lip-sync. */}
        <div className="mt-4">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
            <Clapperboard className="h-3.5 w-3.5" /> Render mode
          </span>
          <div className="grid gap-2 sm:grid-cols-3">
            {RENDER_MODE_OPTIONS.map((m) => {
              const active = renderMode === m.value;
              const isPremium = m.value === "lipsync_premium";
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    if (isPremium) {
                      // Opt-in gate: require an explicit cost confirmation once.
                      if (lipsyncConfirmed) setRenderMode(m.value);
                      else setLipsyncConfirmOpen(true);
                    } else {
                      setRenderMode(m.value);
                    }
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-neutral-900 bg-neutral-900/[0.03] ring-1 ring-neutral-900"
                      : "border-neutral-200 bg-white hover:bg-neutral-50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                    {m.label}
                    {isPremium && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">Paid</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{m.desc}</span>
                  {isPremium && lipsyncEstimate.clips > 0 && (
                    <span className="mt-1 block text-[11px] font-semibold text-amber-700">
                      Est. {formatUsd(lipsyncEstimate.estimatedUsdWithMargin)} · {formatEstimatedTime(lipsyncEstimate.estimatedTimeSeconds)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-400">
            “Talking visual” animates real people from a base clip and is <strong>free</strong> —
            it is not exact lip-sync (the mouth doesn’t match each word). “Lip-sync premium”
            is exact per-speaker lip-sync and is <strong>paid</strong>; the estimated cost is
            shown and confirmed before anything is generated.
          </p>
        </div>

        {/* Lip-sync premium opt-in gate (T-1145) — cost disclosure + explicit
            confirmation before the paid mode can be selected. No spend here. */}
        {lipsyncConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLipsyncConfirmOpen(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-neutral-900">Lip-sync premium — cost estimate</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Exact per-speaker lip-sync generates one paid HeyGen clip per dialogue line.
                Here’s the estimate for this podcast:
              </p>
              {lipsyncEstimate.clips > 0 ? (
                <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <div className="flex justify-between py-0.5"><span className="text-neutral-500">Clips (one per line)</span><span className="font-semibold text-neutral-800">{lipsyncEstimate.clips}</span></div>
                  <div className="flex justify-between py-0.5"><span className="text-neutral-500">Lip-sync seconds</span><span className="font-semibold text-neutral-800">~{Math.round(lipsyncEstimate.totalSeconds)} s</span></div>
                  <div className="flex justify-between py-0.5"><span className="text-neutral-500">Estimated time</span><span className="font-semibold text-neutral-800">{formatEstimatedTime(lipsyncEstimate.estimatedTimeSeconds)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1.5"><span className="font-semibold text-neutral-700">Estimated cost (incl. +15% margin)</span><span className="font-bold text-amber-700">{formatUsd(lipsyncEstimate.estimatedUsdWithMargin)}</span></div>
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
                  Generate the dialogue first to see a real estimate.
                </p>
              )}
              <p className="mt-3 text-[11px] leading-snug text-neutral-400">
                Estimate only — actual HeyGen credits vary. The real lip-sync render ships in a
                later update (T-1144b); confirming here selects the premium mode and its cost
                disclosure. <strong>No credits are spent now.</strong>
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setLipsyncConfirmOpen(false)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">Cancel</button>
                <button
                  type="button"
                  onClick={() => { setLipsyncConfirmed(true); setRenderMode("lipsync_premium"); setLipsyncConfirmOpen(false); }}
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                >
                  I understand the cost — select premium
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setTopic("Create a practical podcast about how creators can use AI video automation without losing originality or quality.");
              setSourceUrl("");
              setPodcastStyle("expert");
              setTargetDuration(120);
            }}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
          >
            Try sample
          </button>
          <button
            onClick={generateDialogue}
            disabled={phase === "scripting"}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {phase === "scripting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {phase === "scripting" ? "Writing script…" : hasDialogue ? "Rewrite script" : "Generate script"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Guided loading while the script is written (T-1139) */}
      {phase === "scripting" && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <p className="mb-3 text-sm font-semibold text-neutral-900">Writing your script…</p>
          <ul className="space-y-2">
            {SCRIPT_LOADING_STEPS.map((label, i) => {
              const done = i < scriptStep;
              const active = i === scriptStep;
              return (
                <li key={label} className="flex items-center gap-2.5 text-sm">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    done ? "bg-green-500/20 text-green-600" : active ? "bg-amber-500/20 text-amber-700" : "bg-neutral-100 text-neutral-300"
                  }`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </span>
                  <span className={done ? "text-neutral-500" : active ? "font-medium text-neutral-900" : "text-neutral-400"}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent podcasts — entry only (T-1139) */}
      {!podcast && recentPodcasts.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-neutral-900">Recent podcasts</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentPodcasts.map((p) => {
              const rs = p.render_status;
              const badge = rs === "done" ? { t: "Ready", c: "bg-green-100 text-green-700" }
                : rs === "rendering" ? { t: "Rendering", c: "bg-amber-100 text-amber-700" }
                : rs === "failed" ? { t: "Failed", c: "bg-red-100 text-red-700" }
                : { t: "Draft", c: "bg-neutral-100 text-neutral-500" };
              // Duration now lives in metadata (T-1141); fall back to the legacy top-level field.
              const durSec = p.metadata?.target_duration_seconds ?? p.target_duration_seconds;
              const dur = durSec
                ? (durSec >= 60 ? `${Math.round(durSec / 60)} min` : `${durSec}s`)
                : null;
              return (
                <div key={p.id} className="flex flex-col rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                  <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                    {p.video_url ? (
                      <video src={p.video_url} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : (
                      <Podcast className="h-6 w-6 text-neutral-300" />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-neutral-800">{p.title || "Untitled podcast"}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge.c}`}>{badge.t}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
                    {dur && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {dur}</span>}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <a href={`/create/podcast?podcast_id=${p.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50">
                      <Pencil className="h-3.5 w-3.5" /> {p.video_url ? "Edit" : "Continue"}
                    </a>
                    {p.video_url && (
                      <a href={p.video_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50">
                        <Play className="h-3.5 w-3.5" /> View video
                      </a>
                    )}
                    <button type="button" onClick={() => renamePodcast(p)} title="Rename"
                      className="ml-auto rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => duplicatePodcast(p)} title="Duplicate"
                      className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => archivePodcast(p)} title="Archive"
                      className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition hover:bg-neutral-50 hover:text-red-500">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogue */}
      {hasDialogue && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">Dialogue</h2>
            {anyAudio ? (
              <button onClick={() => generateVoices(pendingVoiceCount === 0)} disabled={phase === "voicing" || Boolean(voicingSegmentId)}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-60">
                {phase === "voicing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                {phase === "voicing"
                  ? voiceProgress || "Generating voices…"
                  : pendingVoiceCount > 0
                    ? `Generate ${pendingVoiceCount} pending voice${pendingVoiceCount === 1 ? "" : "s"}`
                    : "Regenerate all voices"}
              </button>
            ) : (
              <button onClick={() => generateVoices(false)} disabled={phase === "voicing" || Boolean(voicingSegmentId)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60">
                {phase === "voicing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {phase === "voicing" ? (voiceProgress || "Generating voices…") : "Generate voices"}
              </button>
            )}
          </div>

          {/* ── Duo picker (T-1136d): pick a catalog persona per speaker ── */}
          {personas.length > 0 && (
            <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Podcast className="h-4 w-4 text-indigo-600" />
                <h3 className="text-base font-bold text-neutral-900">Presenters</h3>
              </div>
              <p className="mb-4 text-xs text-neutral-500">
                Choose a face for each speaker. Leave as “None” to keep the default placeholder.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <DuoColumn
                  role="host"
                  personas={personas}
                  value={hostPersonaId}
                  otherValue={guestPersonaId}
                  disabled={savingPersona}
                  onChange={(pid) => setSpeakerPersona("host", pid)}
                />
                <DuoColumn
                  role="guest"
                  personas={personas}
                  value={guestPersonaId}
                  otherValue={hostPersonaId}
                  disabled={savingPersona}
                  onChange={(pid) => setSpeakerPersona("guest", pid)}
                />
              </div>

              {/* ── My Personas (T-1138): upload your own presenter ──────── */}
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Your presenters</span>
                <div className="mt-2 mb-3 flex flex-wrap gap-2">
                  {personas.filter((p) => !p.is_catalog).map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/60 py-1 pl-1 pr-2 text-xs">
                      <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-neutral-100">
                        {p.thumb_url && <img src={p.thumb_url} alt={p.name} className="h-full w-full object-cover" />}
                      </span>
                      <span className="max-w-[110px] truncate text-neutral-700">{p.name}</span>
                      <button type="button" onClick={() => deletePersona(p.id)} title="Remove" className="text-neutral-400 transition hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {personas.filter((p) => !p.is_catalog).length === 0 && (
                    <span className="text-xs text-neutral-400">No personal presenters yet.</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    maxLength={120}
                    placeholder="Presenter name"
                    className="w-44 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-800 outline-none focus:border-indigo-300"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-neutral-600">
                    <input type="checkbox" checked={uploadConsent} onChange={(e) => setUploadConsent(e.target.checked)} />
                    I have the rights/consent to use this face
                  </label>
                  <input
                    ref={personaFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPersona(f); }}
                  />
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => personaFileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload portrait
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-400">
                  JPG/PNG/WEBP, up to 10 MB. No public figures or copyrighted characters.
                </p>
              </div>

              {anyAudio && (
                <p className="mt-3 text-xs text-neutral-400">
                  Changed a presenter? Click “Regenerate” isn’t needed — just re-render the video.
                </p>
              )}
            </div>
          )}

          {/* ── Voice Lab (T-1132b): pick + preview host/guest voices ──── */}
          <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Mic className="h-4 w-4 text-amber-600" />
              <h3 className="text-base font-bold text-neutral-900">Voices</h3>
            </div>
            <p className="mb-4 text-xs text-neutral-500">
              Pick a distinct voice for each speaker and preview it before generating the full audio.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <VoicePicker
                role="host"
                value={hostVoice}
                otherValue={guestVoice}
                disabled={savingVoice}
                previewing={previewing}
                onChange={(v) => setSpeakerVoice("host", v)}
                onPreview={previewVoice}
              />
              <VoicePicker
                role="guest"
                value={guestVoice}
                otherValue={hostVoice}
                disabled={savingVoice}
                previewing={previewing}
                onChange={(v) => setSpeakerVoice("guest", v)}
                onPreview={previewVoice}
              />
            </div>
            {anyAudio && (
              <p className="mt-3 text-xs text-neutral-400">
                Changed a voice? Click “Regenerate voices” to apply it to the audio.
              </p>
            )}
          </div>

          {pendingVoiceCount > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {pendingVoiceCount} line{pendingVoiceCount === 1 ? "" : "s"} need voice generation before render.
              Use the line button or generate all pending voices.
            </div>
          )}

          <div className="space-y-2.5">
            {segments.map((seg, idx) => {
              const sp = speakerById[seg.speaker_id];
              const role = sp?.role ?? "host";
              const color = ROLE_COLOR[role];
              const busyRow = structuring || phase === "voicing" || Boolean(voicingSegmentId) || editingSegmentId !== null;
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
                    {editingSegmentId === seg.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={3}
                          maxLength={600}
                          className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 text-sm leading-relaxed text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-neutral-400">
                            Saving this line clears its generated audio and any final video.
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={cancelEditSegment}
                              disabled={savingSegmentId === seg.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-60"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveSegmentEdit(seg)}
                              disabled={savingSegmentId === seg.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
                            >
                              {savingSegmentId === seg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-sm leading-relaxed text-neutral-800">{seg.text}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="mr-1 flex flex-col">
                      <button
                        onClick={() => moveLine(idx, -1)}
                        title="Move up"
                        disabled={idx === 0 || busyRow}
                        className="rounded p-0.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveLine(idx, 1)}
                        title="Move down"
                        disabled={idx === segments.length - 1 || busyRow}
                        className="rounded p-0.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => generateSegmentVoice(seg)}
                      title={seg.audio_url ? "Regenerate this line voice" : "Generate this line voice"}
                      disabled={
                        phase === "voicing" ||
                        Boolean(voicingSegmentId) ||
                        editingSegmentId === seg.id ||
                        savingSegmentId === seg.id
                      }
                      className={`rounded-full border p-2 transition disabled:opacity-50 ${
                        seg.status !== "ready" || !seg.audio_url
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                      }`}
                    >
                      {voicingSegmentId === seg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    </button>
                    {seg.audio_url && (
                      <button onClick={() => togglePlay(seg)} title="Preview"
                        className="rounded-full border border-neutral-200 p-2 text-neutral-600 transition hover:bg-neutral-50">
                        {playing === seg.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => startEditSegment(seg)}
                      title="Edit line"
                      disabled={editingSegmentId === seg.id || savingSegmentId === seg.id}
                      className="rounded-full border border-neutral-200 p-2 text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteLine(seg)}
                      title={segments.length <= 2 ? "A podcast keeps at least 2 lines" : "Delete line"}
                      disabled={segments.length <= 2 || busyRow || savingSegmentId === seg.id}
                      className="rounded-full border border-neutral-200 p-2 text-neutral-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* + Add line (T-1133c) — appends a pending line at the end */}
          <div className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-3">
            {segments.length >= 10 ? (
              <p className="text-center text-xs text-neutral-400">Maximum of 10 lines reached.</p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as "host" | "guest")}
                  disabled={addingLine || structuring}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-700"
                >
                  <option value="host">{hostSpeaker?.name ?? "Host"}</option>
                  <option value="guest">{guestSpeaker?.name ?? "Guest"}</option>
                </select>
                <input
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !addingLine) addLine(); }}
                  maxLength={600}
                  placeholder="Add a new dialogue line…"
                  className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
                <button
                  onClick={addLine}
                  disabled={addingLine || structuring || !addText.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
                >
                  {addingLine ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add line
                </button>
              </div>
            )}
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

function VoicePicker({
  role, value, otherValue, disabled, previewing, onChange, onPreview,
}: {
  role: "host" | "guest";
  value: string;
  otherValue: string;
  disabled: boolean;
  previewing: string | null;
  onChange: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
}) {
  const color = ROLE_COLOR[role];
  const current = getPodcastVoice(value);
  const isPreviewing = previewing === value;
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{role}</span>
        {current && (
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700">{current.label}</span>
            <span className="text-neutral-400">· {current.provider}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-800 disabled:opacity-60"
        >
          {PODCAST_VOICES.map((v) => (
            <option key={v.id} value={v.id} disabled={v.id === otherValue}>
              {v.label} · {v.tone} ({v.gender}){v.id === otherValue ? " — in use" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPreview(value)}
          title="Preview voice"
          className="shrink-0 rounded-lg border border-neutral-200 p-2 text-neutral-600 transition hover:bg-neutral-50"
        >
          {isPreviewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
      {current && <p className="mt-1.5 text-[11px] text-neutral-400">{current.useCase}</p>}
    </div>
  );
}

function DuoColumn({
  role, personas, value, otherValue, disabled, onChange,
}: {
  role: "host" | "guest";
  personas: Persona[];
  value: string | null;
  otherValue: string | null;
  disabled: boolean;
  onChange: (personaId: string | null) => void;
}) {
  const color = ROLE_COLOR[role];
  const catalog = personas.filter((p) => p.is_catalog);
  const own = personas.filter((p) => !p.is_catalog);
  const Tile = ({
    id, name, img, selected, unavailable, own: isOwn,
  }: { id: string | null; name: string; img: string | null; selected: boolean; unavailable: boolean; own?: boolean }) => (
    <button
      type="button"
      disabled={disabled || unavailable}
      onClick={() => onChange(id)}
      title={unavailable ? "In use by the other speaker" : name}
      className={`relative flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 transition ${
        selected ? "border-2" : "border-neutral-200 hover:bg-neutral-50"
      } ${disabled || unavailable ? "opacity-40" : ""}`}
      style={selected ? { borderColor: color } : undefined}
    >
      {isOwn && (
        <span className="absolute right-1 top-1 rounded-full bg-indigo-100 px-1 text-[8px] font-bold uppercase text-indigo-600">you</span>
      )}
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-neutral-100">
        {img ? (
          <img src={img} alt={name} className="h-full w-full object-cover" />
        ) : (
          <X className="h-4 w-4 text-neutral-400" />
        )}
      </span>
      <span className="w-full truncate text-center text-[10px] font-medium text-neutral-600">{name}</span>
    </button>
  );
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="mb-2">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{role}</span>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        <Tile id={null} name="None" img={null} selected={value === null} unavailable={false} />
        {catalog.map((p) => (
          <Tile key={p.id} id={p.id} name={p.name} img={p.thumb_url || p.portrait_url} selected={value === p.id} unavailable={p.id === otherValue} />
        ))}
        {own.length > 0 && <span className="my-1 w-px shrink-0 bg-neutral-200" aria-hidden />}
        {own.map((p) => (
          <Tile key={p.id} id={p.id} name={p.name} img={p.thumb_url || p.portrait_url} selected={value === p.id} unavailable={p.id === otherValue} own />
        ))}
      </div>
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
