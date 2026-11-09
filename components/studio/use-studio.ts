"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findModel, STUDIO_MODELS, type StudioModel } from "@/lib/studio/catalog";
import { defaultValues, resolveVariant, submissionParams, validateValues, valuesFromRun, type ParamValues } from "@/lib/studio/manifest";
import { RunSelection } from "@/lib/studio/run-selection";
import { isActive, pollDelay } from "@/lib/studio/status";
import type { Readiness, ReferenceImage, SignedMedia, StudioAsset, StudioRun } from "./types";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

function setQuery(next: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(next)) {
    if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
  }
  window.history.replaceState(null, "", url.toString());
}

export function useStudio() {
  const [model, setModelState] = useState<StudioModel>(STUDIO_MODELS[0]);
  const manifest = model.manifest;
  const [values, setValues] = useState<ParamValues>(() => manifest ? defaultValues(manifest) : {});
  const [reference, setReference] = useState<ReferenceImage | null>(null);
  const [readiness, setReadiness] = useState<Readiness>({ ready: false, reason: "Checking GPU authorization…", allowance: null, loaded: false });
  const [history, setHistory] = useState<StudioRun[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [current, setCurrent] = useState<StudioRun | null>(null);
  const [media, setMedia] = useState<Record<string, SignedMedia>>({});
  const [busy, setBusy] = useState<"idle" | "submitting" | "uploading">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingKey = useRef<string | null>(null);

  const refreshReadiness = useCallback(async () => {
    try {
      const d = await json<{ ready: boolean; reason?: string; error?: string; allowance?: Readiness["allowance"] }>(await fetch("/api/admin/comfy/runs", { cache: "no-store" }));
      setReadiness({ ready: d.ready === true, reason: d.reason ?? d.error ?? "", allowance: d.allowance ?? null, loaded: true });
    } catch { setReadiness({ ready: false, reason: "GPU authorization status unavailable", allowance: null, loaded: true }); }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const d = await json<{ items: StudioRun[] }>(await fetch("/api/admin/comfy/history?limit=30", { cache: "no-store" }));
      setHistory(d.items); setHistoryError("");
    } catch (e) { setHistory(h => h ?? []); setHistoryError(e instanceof Error ? e.message : "History unavailable"); }
  }, []);

  // The selected run (URL ?run=) is the only one whose responses may update the screen.
  const selection = useRef(new RunSelection<StudioRun>()).current;

  /** Fetch a run; applied only while it is still selected (stale responses and errors are dropped). */
  const loadRun = useCallback((id: string, onError: (e: unknown) => void) => selection.load(id,
    async (runId, signal) => {
      const d = await json<{ run: StudioRun; assets: StudioAsset[] }>(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(runId)}`, { cache: "no-store", signal }));
      return { ...d.run, assets: d.assets ?? [] };
    },
    run => {
      setCurrent(run);
      setHistory(h => h?.some(r => r.id === run.id) ? h.map(r => r.id === run.id ? { ...r, ...run } : r) : h);
    },
    onError), [selection]);

  const openRun = useCallback(async (id: string) => {
    setError(""); setQuery({ run: id });
    selection.select(id);
    // Placeholder for the newly selected run: no media or download of the previous run stays on screen.
    setCurrent(c => c?.id === id ? c : { id, status: "loading", error_code: null, generation_seconds: null, assets: [] });
    await loadRun(id, () => { setCurrent(null); setError("This private run is unavailable."); });
  }, [loadRun, selection]);

  // Initial load: model, run from URL (keeps the old /admin/workflows/minimax-h3?run= links working).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = findModel(q.get("model"));
    if (m?.manifest) { setModelState(m); setValues(defaultValues(m.manifest)); }
    const run = q.get("run");
    if (run) void openRun(run);
    void refreshReadiness(); void refreshHistory();
  }, [openRun, refreshHistory, refreshReadiness]);

  // Poll only the active run, only while the tab is visible.
  useEffect(() => {
    if (!current || !isActive(current.status)) return;
    const age = current.created_at ? Date.now() - Date.parse(current.created_at) : 0;
    const delay = pollDelay(current.status, age);
    if (delay === null) return;
    const timer = window.setTimeout(async () => {
      if (document.visibilityState !== "visible") { setCurrent(c => c ? { ...c } : c); return; }
      const id = current.id;
      const run = await loadRun(id, () => { setError("Status temporarily unavailable. Retrying…"); setCurrent(c => c?.id === id ? { ...c } : c); });
      if (run && !isActive(run.status)) { void refreshHistory(); void refreshReadiness(); }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [current, loadRun, refreshHistory, refreshReadiness]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setCurrent(c => c ? { ...c } : c); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const selectModel = useCallback((slug: string) => {
    const m = findModel(slug); if (!m) return;
    setModelState(m); setQuery({ model: slug });
    if (m.manifest) setValues(defaultValues(m.manifest));
    setReference(null); setError("");
  }, []);

  const setValue = useCallback((key: string, value: string | number) => setValues(v => ({ ...v, [key]: value })), []);

  const errors = useMemo(() => manifest ? validateValues(manifest, values) : {}, [manifest, values]);
  const variant = manifest ? resolveVariant(manifest, values, !!reference) : null;
  const activeRun = current && isActive(current.status) ? current : (history ?? []).find(r => isActive(r.status)) ?? null;

  const blockers: string[] = [];
  if (model.availability !== "available" || !manifest) blockers.push(model.pendingReason ?? "This model is not available yet.");
  else {
    if (!readiness.ready) blockers.push(readiness.loaded ? readiness.reason || "GPU authorization pending" : "Checking GPU authorization…");
    if (activeRun) blockers.push("A generation is already in progress.");
    if (!variant) blockers.push("This combination has no validated workflow.");
    const errKeys = Object.keys(errors);
    if (errKeys.length === 1 && errKeys[0] === "prompt") blockers.push(errors.prompt);
    else if (errKeys.length) blockers.push("Fix the highlighted settings.");
  }
  const canGenerate = blockers.length === 0 && busy === "idle";

  const generate = useCallback(async () => {
    if (!manifest || !canGenerate) return;
    setBusy("submitting"); setError(""); setNotice("");
    // Same key on a network retry → the server returns the same run (no second GPU permit).
    pendingKey.current ??= crypto.randomUUID();
    try {
      const d = await json<{ run_id: string; dispatched: boolean }>(await fetch("/api/admin/comfy/runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: pendingKey.current, params: submissionParams(manifest, values, reference?.path ?? null) }),
      }));
      pendingKey.current = null;
      selection.select(d.run_id);
      setCurrent({ id: d.run_id, status: "queued", error_code: null, generation_seconds: null, created_at: new Date().toISOString(), params_effective: values, assets: [] });
      setQuery({ run: d.run_id });
      if (!d.dispatched) setNotice("Run reserved. Dispatch is pending — use Retry dispatch; no new run is created.");
      void refreshHistory(); void refreshReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation unavailable");
      if (e instanceof Error && /refused|Invalid|policy|supported/i.test(e.message)) pendingKey.current = null;
    } finally { setBusy("idle"); }
  }, [canGenerate, manifest, reference, refreshHistory, refreshReadiness, selection, values]);

  const retryDispatch = useCallback(async (id: string) => {
    setError("");
    const res = await fetch(`/api/admin/comfy/runs/${encodeURIComponent(id)}`, { method: "POST" });
    if (res.ok) { setNotice("Dispatch sent."); void loadRun(id, () => undefined); } else setError("Dispatch still unavailable. The reservation is preserved.");
  }, [loadRun]);

  const uploadReference = useCallback(async (file: File) => {
    const ref = manifest?.studio?.reference;
    if (!ref) return;
    if (!ref.accept.includes(file.type)) { setError("Use a PNG, JPEG or WebP image."); return; }
    if (file.size > ref.maxBytes) { setError("Image must be 10 MB or less."); return; }
    setBusy("uploading"); setError("");
    const previewUrl = URL.createObjectURL(file);
    try {
      const form = new FormData(); form.append("file", file);
      const d = await json<{ storage_path: string }>(await fetch("/api/upload?bucket=references", { method: "POST", body: form }));
      setReference(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return { path: d.storage_path, previewUrl, name: file.name }; });
      // Image-to-video exists only in turbo: switch explicitly and say so.
      if (manifest && !resolveVariant(manifest, values, true)) {
        const quality = manifest.params.find(p => p.key === "quality")?.options?.find(o => resolveVariant(manifest, { ...values, quality: o }, true));
        if (quality) { setValues(v => ({ ...v, quality })); setNotice(`Quality switched to ${quality}: it is the only validated image-to-video workflow.`); }
      }
    } catch (e) { URL.revokeObjectURL(previewUrl); setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy("idle"); }
  }, [manifest, values]);

  const clearReference = useCallback(() => setReference(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null; }), []);

  const signMedia = useCallback(async (assetId: string, opts?: { download?: boolean; force?: boolean }) => {
    const cached = media[assetId];
    if (!opts?.download && !opts?.force && cached && cached.expiresAt - Date.now() > 60_000) return cached.url;
    const d = await json<{ url: string; expires_in: number }>(await fetch(`/api/admin/comfy/media/${encodeURIComponent(assetId)}${opts?.download ? "?download=1" : ""}`, { cache: "no-store" }));
    if (!opts?.download) setMedia(m => ({ ...m, [assetId]: { url: d.url, expiresAt: Date.now() + d.expires_in * 1000 } }));
    return d.url;
  }, [media]);

  const download = useCallback(async (assetId: string) => {
    try {
      const url = await signMedia(assetId, { download: true });
      const a = document.createElement("a"); a.href = url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    } catch { setError("Download link unavailable"); }
  }, [signMedia]);

  const reuse = useCallback((run: StudioRun, keepSeed: boolean) => {
    if (!manifest) return;
    setValues(valuesFromRun(manifest, run.params_effective, keepSeed));
    // A private reference from another run is not re-attached automatically.
    setReference(null);
    setNotice(keepSeed ? "Settings and seed loaded. Generate to create a new run." : "Settings loaded with a new random seed.");
  }, [manifest]);

  const applyValues = useCallback((next: ParamValues) => setValues(v => ({ ...v, ...next })), []);

  return {
    model, manifest, values, setValue, applyValues, selectModel, errors, variant,
    reference, uploadReference, clearReference,
    readiness, history, historyError, refreshHistory, current, openRun, activeRun,
    generate, canGenerate, blockers, busy, error, setError, notice, setNotice, retryDispatch,
    media, signMedia, download, reuse,
  };
}

export type StudioState = ReturnType<typeof useStudio>;
