"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isActive, pollDelay } from "@/lib/studio/status";
import { anySignal, startRunPolling } from "@/lib/studio/run-poller";
import { DEFAULT_PROMPT } from "@/lib/avatar/constants";
import { canSubmit as canSubmitNow, createAttemptStore, submitBlocker } from "@/lib/avatar/attempt";
import type { AudioItem } from "@/lib/avatar/audio-library";
import type { LibraryItem } from "@/lib/studio/reference-library";
import type { CostInfo, Allowance, StudioAsset, StudioRun } from "../types";

export type AudioEntry = AudioItem & { url: string | null };
export interface AvatarReadiness { ready: boolean; reason: string; blockers?: { code: string; message: string }[]; allowance: Allowance | null; loaded: boolean; cost?: CostInfo | null }
const AVATAR_PREFIX = "longcat-avatar@";
const SLUG = "longcat-avatar";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Talking-avatar screen state. Everything goes through the existing private admin APIs: portraits come from the
 * reference library, audios from the audio library, runs/history/media from the Studio run routes. The server decides
 * ownership, authorization and duplicates; this hook only avoids sending the same request twice by accident:
 * - one idempotency key and one seed per "attempt", reused if the network drops the response;
 * - a new key and seed only after the attempt succeeded or the inputs changed;
 * - the render button is disabled while submitting or while a render of this admin is queued or running.
 */
export function useAvatar() {
  const [readiness, setReadiness] = useState<AvatarReadiness>({ ready: false, reason: "Checking GPU authorization…", allowance: null, loaded: false });
  const [portraits, setPortraits] = useState<LibraryItem[]>([]);
  const [audios, setAudios] = useState<AudioEntry[]>([]);
  const [history, setHistory] = useState<StudioRun[]>([]);
  const [portraitPath, setPortraitPath] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [prompt, setPromptState] = useState("");
  const [current, setCurrent] = useState<StudioRun | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef(createAttemptStore());
  const submittingRef = useRef(false);

  const resetAttempt = () => attempt.current.reset();
  const choosePortrait = useCallback((path: string | null) => { setPortraitPath(path); resetAttempt(); }, []);
  const chooseAudio = useCallback((path: string | null) => { setAudioPath(path); resetAttempt(); }, []);
  const setPrompt = useCallback((value: string) => { setPromptState(value); resetAttempt(); }, []);

  const refreshReadiness = useCallback(async () => {
    try {
      const d = await json<Omit<AvatarReadiness, "loaded">>(await fetch(`/api/admin/comfy/runs?template=${SLUG}`, { cache: "no-store" }));
      setReadiness({ ...d, loaded: true });
    } catch { setReadiness({ ready: false, reason: "GPU authorization could not be checked", allowance: null, loaded: true }); }
  }, []);
  const refreshHistory = useCallback(async () => {
    try {
      const d = await json<{ items: StudioRun[] }>(await fetch("/api/admin/comfy/history?limit=50", { cache: "no-store" }));
      const items = (d.items ?? []).filter(r => r.template_version?.startsWith(AVATAR_PREFIX));
      setHistory(items);
      return items;
    } catch { setError("History unavailable"); return null; }
  }, []);
  const refreshPortraits = useCallback(async () => {
    try { setPortraits((await json<{ items: LibraryItem[] }>(await fetch("/api/admin/studio/references", { cache: "no-store" }))).items); }
    catch { setError("Portrait library unavailable"); }
  }, []);
  const refreshAudios = useCallback(async () => {
    try { setAudios((await json<{ items: AudioEntry[] }>(await fetch("/api/admin/studio/audio", { cache: "no-store" }))).items); }
    catch { setError("Audio library unavailable"); }
  }, []);

  // First load. An active render found in the history is reopened so a reload never hides it (or double-starts one).
  useEffect(() => {
    void refreshReadiness(); void refreshPortraits(); void refreshAudios();
    void refreshHistory().then(items => { const active = items?.find(r => isActive(r.status)); if (active) setCurrent(active); });
  }, [refreshReadiness, refreshPortraits, refreshAudios, refreshHistory]);

  const openRun = useCallback(async (id: string) => {
    try {
      const d = await json<{ run: StudioRun; assets: StudioAsset[] }>(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(id)}`, { cache: "no-store" }));
      setCurrent({ ...d.run, assets: d.assets ?? [] });
    } catch (e) { setError(e instanceof Error ? e.message : "Run unavailable"); }
  }, []);

  // Poll only the selected active run (same bounded poller as the main Studio).
  const currentId = current?.id ?? null;
  const currentActive = !!current && isActive(current.status);
  const currentRef = useRef(current); currentRef.current = current;
  useEffect(() => {
    const run = currentRef.current;
    if (!currentId || !currentActive || !run) return;
    const poller = startRunPolling<StudioRun>({
      run,
      fetchRun: async (id, timeoutSignal) => {
        const controller = new AbortController();
        const d = await json<{ run: StudioRun; assets: StudioAsset[] }>(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(id)}`,
          { cache: "no-store", signal: anySignal(controller.signal, timeoutSignal) }));
        return { ...d.run, assets: d.assets ?? [] };
      },
      isActive, delay: pollDelay,
      onUpdate: r => setCurrent(prev => (prev && prev.id === r.id ? r : prev)),
      onTerminal: () => { void refreshHistory(); void refreshReadiness(); },
      onTransientError: () => setError("Status temporarily unavailable. Retrying…"),
      onStop: reason => { if (reason === "errors" || reason === "max_age") setError("Automatic status checks stopped. Reload the page to check this render again."); },
    });
    const onVisible = () => { if (document.visibilityState === "visible") poller.wake(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); poller.stop(); };
  }, [currentId, currentActive, refreshHistory, refreshReadiness]);

  const activeRun = (current && isActive(current.status) ? current : history.find(r => isActive(r.status))) ?? null;
  const submitState = { ready: readiness.ready, portraitPath, audioPath, submitting, activeRunId: activeRun?.id ?? null };
  const canSubmit = canSubmitNow(submitState);
  const blocker = submitBlocker(submitState, readiness.reason);

  const render = useCallback(async () => {
    if (submittingRef.current || !portraitPath || !audioPath) return;
    submittingRef.current = true; setSubmitting(true); setError(""); setNotice("");
    const { key, seed } = attempt.current.get();
    try {
      const params: Record<string, unknown> = { image_path: portraitPath, audio_path: audioPath, seed };
      if (prompt.trim()) params.prompt = prompt.trim();
      const d = await json<{ run_id: string; dispatched: boolean }>(await fetch("/api/admin/comfy/runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: SLUG, params, idempotency_key: key }),
      }));
      resetAttempt();
      setNotice(d.dispatched ? "Render started. The GPU needs a few minutes (model loading, then three short segments)." : "Render saved but not dispatched yet. Use “Retry dispatch”; no second render will be created.");
      await openRun(d.run_id); void refreshHistory(); void refreshReadiness();
    } catch (e) {
      // The same key and seed are kept: sending again after a dropped response returns the same run, never a second one.
      setError(e instanceof Error ? e.message : "Render could not be started");
    } finally { submittingRef.current = false; setSubmitting(false); }
  }, [portraitPath, audioPath, prompt, openRun, refreshHistory, refreshReadiness]);

  /** Explicit retry of delivery only: the SQL claim guarantees at most one GPU execution per run. */
  const retryDispatch = useCallback(async (id: string) => {
    setError(""); setBusy("dispatch");
    try {
      await json(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(id)}`, { method: "POST" }));
      setNotice("Dispatch retried. No second render can start for this run."); await openRun(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Dispatch unavailable"); } finally { setBusy(null); }
  }, [openRun]);

  const uploadAudio = useCallback(async (file: File, name: string): Promise<boolean> => {
    setError(""); setBusy("audio");
    try {
      const form = new FormData(); form.append("file", file); form.append("name", name);
      const d = await json<{ item: AudioEntry }>(await fetch("/api/admin/studio/audio", { method: "POST", body: form }));
      await refreshAudios(); chooseAudio(d.item.path); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); return false; } finally { setBusy(null); }
  }, [refreshAudios, chooseAudio]);

  const deleteAudio = useCallback(async (item: AudioEntry) => {
    setError(""); setBusy("audio");
    try {
      await json(await fetch(`/api/admin/studio/audio?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }));
      if (audioPath === item.path) chooseAudio(null);
      await refreshAudios();
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); } finally { setBusy(null); }
  }, [audioPath, chooseAudio, refreshAudios]);

  const removeRun = useCallback(async (id: string) => {
    setError(""); setBusy("delete");
    try {
      await json(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(id)}`, { method: "DELETE" }));
      setCurrent(prev => (prev?.id === id ? null : prev)); await refreshHistory(); setNotice("Render deleted.");
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); } finally { setBusy(null); }
  }, [refreshHistory]);

  const signMedia = useCallback(async (assetId: string, download = false) => {
    const d = await json<{ url: string }>(await fetch(`/api/admin/comfy/media/${encodeURIComponent(assetId)}${download ? "?download=1" : ""}`, { cache: "no-store" }));
    return d.url;
  }, []);

  return {
    readiness, portraits, audios, history, portraitPath, audioPath, prompt, current, activeRun, submitting, busy, error, notice, canSubmit, blocker,
    defaultPrompt: DEFAULT_PROMPT,
    choosePortrait, chooseAudio, setPrompt, render, retryDispatch, uploadAudio, deleteAudio, removeRun, openRun, signMedia,
    refreshReadiness, refreshPortraits, setError, setNotice,
  };
}

export type AvatarState = ReturnType<typeof useAvatar>;
