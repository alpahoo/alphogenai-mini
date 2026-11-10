"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findModel, modelForTemplateVersion, STUDIO_MODELS, type StudioModel } from "@/lib/studio/catalog";
import { defaultValues, resolveVariant, submissionParams, validateValues, valuesFromRun, type ParamValues } from "@/lib/studio/manifest";
import { RunSelection } from "@/lib/studio/run-selection";
import { isActive, pollDelay } from "@/lib/studio/status";
import { anySignal, startRunPolling } from "@/lib/studio/run-poller";
import type { Readiness, ReferenceImage, SignedMedia, StudioAsset, StudioRun } from "./types";
import { useStudioAssistant } from "./use-assistant";

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
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  // Readiness is per template: each runtime has its own server gate.
  const refreshReadiness = useCallback(async () => {
    const slug = model.slug;
    if (!model.manifest) { setReadiness({ ready: false, reason: model.pendingReason ?? "Not available", allowance: null, loaded: true }); return; }
    try {
      const d = await json<{ ready: boolean; reason?: string; error?: string; allowance?: Readiness["allowance"]; licence_confirmed?: boolean; cost?: Readiness["cost"] }>(
        await fetch(`/api/admin/comfy/runs?template=${encodeURIComponent(slug)}`, { cache: "no-store" }));
      if (modelRef.current.slug !== slug) return;
      setReadiness({ ready: d.ready === true, reason: d.reason ?? d.error ?? "", allowance: d.allowance ?? null, loaded: true, licence_confirmed: d.licence_confirmed, cost: d.cost ?? null });
    } catch { setReadiness({ ready: false, reason: "GPU authorization status unavailable", allowance: null, loaded: true }); }
  }, [model]);

  const refreshHistory = useCallback(async () => {
    try {
      const d = await json<{ items: StudioRun[] }>(await fetch("/api/admin/comfy/history?limit=30", { cache: "no-store" }));
      setHistory(d.items); setHistoryError("");
    } catch (e) { setHistory(h => h ?? []); setHistoryError(e instanceof Error ? e.message : "History unavailable"); }
  }, []);

  // The selected run (URL ?run=) is the only one whose responses may update the screen.
  const selection = useRef(new RunSelection<StudioRun>()).current;

  const applyRun = useCallback((run: StudioRun) => {
    setCurrent(run);
    setHistory(h => h?.some(r => r.id === run.id) ? h.map(r => r.id === run.id ? { ...r, ...run } : r) : h);
  }, []);

  /** Fetch a run; applied only while it is still selected (stale responses and errors are dropped). */
  const loadRun = useCallback((id: string, onError: (e: unknown) => void) => selection.load(id,
    async (runId, signal) => {
      const d = await json<{ run: StudioRun; assets: StudioAsset[] }>(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(runId)}`, { cache: "no-store", signal }));
      return { ...d.run, assets: d.assets ?? [] };
    },
    applyRun,
    onError), [selection, applyRun]);

  const openRun = useCallback(async (id: string) => {
    setError(""); setQuery({ run: id });
    selection.select(id);
    // Placeholder for the newly selected run: no media or download of the previous run stays on screen.
    setCurrent(c => c?.id === id ? c : { id, status: "loading", error_code: null, generation_seconds: null, assets: [] });
    const run = await loadRun(id, () => { setCurrent(null); setError("This private run is unavailable."); });
    // Opening a run from another model switches the Create panel to that model.
    if (run) {
      const target = modelForTemplateVersion(run.template_version);
      if (target.slug !== modelRef.current.slug && target.manifest) {
        setModelState(target); setQuery({ model: target.slug });
        setValues(defaultValues(target.manifest)); setReference(null);
      }
    }
  }, [loadRun, selection]);

  // Initial load: model, run from URL (keeps the old /admin/workflows/minimax-h3?run= links working).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = findModel(q.get("model"));
    if (m?.manifest) { setModelState(m); setValues(defaultValues(m.manifest)); }
    const run = q.get("run");
    if (run) void openRun(run);
    void refreshHistory();
  }, [openRun, refreshHistory]);

  useEffect(() => {
    setReadiness(r => ({ ...r, ready: false, loaded: false, reason: "Checking GPU authorization…" }));
    void refreshReadiness();
  }, [refreshReadiness]);

  // Poll only the selected active run, only while the tab is visible, until a terminal state.
  // The loop owns its timer (lib/studio/run-poller.ts): a stale response, a hung request or a
  // hidden tab can no longer leave the screen on "Generating" after the run has failed.
  const currentId = current?.id ?? null;
  const currentActive = !!current && isActive(current.status);
  const currentRef = useRef(current);
  currentRef.current = current;
  const pollError = useRef(false);
  useEffect(() => {
    const run = currentRef.current;
    if (!currentId || !currentActive || !run || run.id !== currentId) return;
    const clearPollError = () => { if (pollError.current) { pollError.current = false; setError(""); } };
    const poller = startRunPolling<StudioRun>({
      run,
      fetchRun: (id, timeoutSignal) => new Promise<StudioRun | null>((resolve, reject) => {
        void selection.load(id,
          async (runId, signal) => {
            const d = await json<{ run: StudioRun; assets: StudioAsset[] }>(await fetch(`/api/admin/comfy/runs/${encodeURIComponent(runId)}`,
              { cache: "no-store", signal: anySignal(signal, timeoutSignal) }));
            return { ...d.run, assets: d.assets ?? [] };
          },
          applyRun,
          e => reject(e),
        ).then(resolve, reject);
      }),
      isActive, delay: pollDelay,
      onUpdate: clearPollError,
      onTerminal: () => { clearPollError(); void refreshHistory(); void refreshReadiness(); },
      onTransientError: () => { pollError.current = true; setError("Status temporarily unavailable. Retrying…"); },
      onStop: reason => {
        if (reason === "errors" || reason === "max_age") {
          pollError.current = true;
          setError("Automatic status checks stopped. Reload the page to check this run again.");
        }
      },
    });
    const onVisible = () => { if (document.visibilityState === "visible") poller.wake(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); poller.stop(); };
  }, [currentId, currentActive, selection, applyRun, refreshHistory, refreshReadiness]);

  const selectModel = useCallback((slug: string) => {
    const m = findModel(slug); if (!m || m.slug === modelRef.current.slug) return;
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
        body: JSON.stringify({ template: model.slug, idempotency_key: pendingKey.current, params: submissionParams(manifest, values, reference?.path ?? null) }),
      }));
      pendingKey.current = null;
      selection.select(d.run_id);
      setCurrent({ id: d.run_id, status: "queued", error_code: null, generation_seconds: null, created_at: new Date().toISOString(), params_effective: values, assets: [], template_version: `${model.slug}@${manifest.version}` });
      setQuery({ run: d.run_id });
      if (!d.dispatched) setNotice("Run reserved. Dispatch is pending — use Retry dispatch; no new run is created.");
      void refreshHistory(); void refreshReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation unavailable");
      if (e instanceof Error && /refused|Invalid|policy|supported/i.test(e.message)) pendingKey.current = null;
    } finally { setBusy("idle"); }
  }, [canGenerate, manifest, model.slug, reference, refreshHistory, refreshReadiness, selection, values]);

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

  // Comparison is per displayed run: switching runs resets it.
  useEffect(() => setCompareWith(null), [current?.id]);

  /** Completed runs of the same template, with an original, other than `runId`. */
  const compareCandidates = useCallback((runId: string) => {
    const template = (history ?? []).find(r => r.id === runId)?.template_version ?? current?.template_version;
    return (history ?? []).filter(r => r.id !== runId && r.status === "done" && r.template_version === template
      && (r.assets ?? []).some(a => a.role === "raw"));
  }, [current?.template_version, history]);

  const applyValues = useCallback((next: ParamValues) => setValues(v => ({ ...v, ...next })), []);
  /** Full replacement (assistant accept): a cleared seed must disappear, not be merged back. */
  const replaceValues = useCallback((next: ParamValues) => setValues({ ...next }), []);

  // C2a assistant: proposals over the current form only; accepting never generates.
  const assistantCtx = useMemo(() => manifest && model.availability === "available"
    ? { model, manifest, values, hasReference: !!reference, referenceName: reference?.name ?? null } : null,
  [manifest, model, reference, values]);
  const assistant = useStudioAssistant(assistantCtx, replaceValues);

  return {
    model, manifest, values, setValue, applyValues, selectModel, errors, variant,
    reference, uploadReference, clearReference,
    readiness, history, historyError, refreshHistory, current, openRun, activeRun,
    generate, canGenerate, blockers, busy, error, setError, notice, setNotice, retryDispatch,
    media, signMedia, download, reuse, compareWith, setCompareWith, compareCandidates,
    assistant,
  };
}

export type StudioState = ReturnType<typeof useStudio>;
