"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Download, Loader2, Mic, RefreshCw, Trash2, Upload, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatElapsed, isActive } from "@/lib/studio/status";
import { avatarErrorMessage } from "@/lib/avatar/messages";
import { MAX_AUDIO_SECONDS } from "@/lib/avatar/audio-library";
import { StatusPill } from "../result-stage";
import type { StudioAsset, StudioRun } from "../types";
import { useAvatar, type AvatarState } from "./use-avatar";

const box = "rounded-2xl border border-border/60 bg-card/40 p-4";
const label = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

function PrivateVideo({ asset, sign }: { asset: StudioAsset; sign: AvatarState["signMedia"] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  useEffect(() => {
    let live = true; retried.current = false; setFailed(false); setUrl(null);
    sign(asset.id).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [asset.id, sign]);
  const onError = useCallback(async () => {
    if (retried.current) { setFailed(true); return; }
    retried.current = true;
    try { setUrl(await sign(asset.id)); } catch { setFailed(true); }
  }, [asset.id, sign]);
  if (failed) return <div className="grid aspect-[3/4] place-items-center rounded-xl bg-black/40 text-sm text-muted-foreground">Private link unavailable</div>;
  if (!url) return <div className="grid aspect-[3/4] place-items-center rounded-xl bg-black/40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  return <video key={url} src={url} controls playsInline preload="metadata" onError={onError} className="max-h-[70vh] w-full rounded-xl bg-black object-contain" />;
}

function Portraits({ s }: { s: AvatarState }) {
  const [name, setName] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const f = file.current?.files?.[0]; if (!f || !name.trim()) return;
    setBusy(true); s.setError("");
    try {
      const form = new FormData(); form.append("file", f); form.append("name", name.trim());
      const res = await fetch("/api/admin/studio/references", { method: "POST", body: form });
      const d = await res.json().catch(() => ({})) as { error?: string; item?: { path: string } };
      if (!res.ok || !d.item) throw new Error(d.error ?? "Upload failed");
      setName(""); if (file.current) file.current.value = "";
      await s.refreshPortraits(); s.choosePortrait(d.item.path);
    } catch (e) { s.setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  };
  return (
    <section className={box} aria-labelledby="portrait-h">
      <h2 id="portrait-h" className={cn(label, "mb-3 flex items-center gap-1.5")}><UserRound className="h-3.5 w-3.5" />Portrait</h2>
      {s.portraits.length === 0 ? <p className="text-sm text-muted-foreground">No portrait yet. Add a front-facing photo with the mouth clearly visible.</p> : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Portrait">
          {s.portraits.map(p => (
            <li key={p.id}>
              <button type="button" role="radio" aria-checked={s.portraitPath === p.path} onClick={() => s.choosePortrait(p.path)}
                className={cn("group relative block w-full overflow-hidden rounded-xl border text-left", s.portraitPath === p.path ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-border")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed private URL */}
                {p.thumb_url ? <img src={p.thumb_url} alt={p.name} className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-muted" />}
                <span className="block truncate px-1.5 py-1 text-[11px]">{p.name}</span>
                {s.portraitPath === p.path && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Portrait file" className="max-w-[12rem] text-xs" />
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Name" aria-label="Portrait name" className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-xs" />
        <button type="button" onClick={add} disabled={busy || !name.trim()} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Add</button>
      </div>
    </section>
  );
}

function Audios({ s }: { s: AvatarState }) {
  const [name, setName] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const add = async () => {
    const f = file.current?.files?.[0]; if (!f || !name.trim()) return;
    if (await s.uploadAudio(f, name.trim())) { setName(""); if (file.current) file.current.value = ""; }
  };
  return (
    <section className={box} aria-labelledby="audio-h">
      <h2 id="audio-h" className={cn(label, "mb-3 flex items-center gap-1.5")}><Mic className="h-3.5 w-3.5" />Audio</h2>
      {s.audios.length === 0 ? <p className="text-sm text-muted-foreground">No audio yet. Add a WAV or MP3 of 1 to {MAX_AUDIO_SECONDS} seconds.</p> : (
        <ul className="space-y-2" role="radiogroup" aria-label="Audio">
          {s.audios.map(a => (
            <li key={a.id} className={cn("flex items-center gap-2 rounded-xl border p-2", s.audioPath === a.path ? "border-primary ring-2 ring-primary/40" : "border-border/60")}>
              <button type="button" role="radio" aria-checked={s.audioPath === a.path} onClick={() => s.chooseAudio(a.path)} className="min-w-0 flex-1 truncate text-left text-sm">
                {s.audioPath === a.path && <Check className="mr-1 inline h-3.5 w-3.5 text-primary" />}{a.name} <span className="text-xs text-muted-foreground">.{a.ext}</span>
              </button>
              {a.url && <audio controls preload="none" src={a.url} className="h-8 max-w-[11rem]" aria-label={`Listen to ${a.name}`} />}
              <button type="button" aria-label={`Delete ${a.name}`} disabled={s.busy === "audio"} onClick={() => { if (confirm(`Delete the audio “${a.name}”?`)) void s.deleteAudio(a); }}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" aria-label="Audio file" className="max-w-[12rem] text-xs" />
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Name" aria-label="Audio name" className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-xs" />
        <button type="button" onClick={add} disabled={s.busy === "audio" || !name.trim()} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Add</button>
      </div>
    </section>
  );
}

function Result({ s, run }: { s: AvatarState; run: StudioRun }) {
  const [, tick] = useState(0);
  const active = isActive(run.status);
  useEffect(() => { if (!active) return; const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, [active]);
  const video = run.assets?.find(a => a.role === "final") ?? run.assets?.[0];
  const message = avatarErrorMessage(run.error_code);
  const p = (run.params_effective ?? {}) as Record<string, unknown>;
  const download = async () => {
    try { const u = await s.signMedia(video!.id, true); const a = document.createElement("a"); a.href = u; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
    catch { s.setError("Download unavailable"); }
  };
  return (
    <section className={box} aria-live="polite">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><StatusPill status={run.status} run={run} />
          {run.created_at && <span className="text-xs text-muted-foreground">{active ? `${formatElapsed(run.created_at)} elapsed` : run.generation_seconds ? `${Math.round(run.generation_seconds)} s on the GPU` : ""}</span>}</div>
        <span className="truncate text-xs text-muted-foreground">{String(p.image_label ?? "")} · {String(p.audio_label ?? "")}</span>
      </div>
      {active && <p className="mb-3 text-sm text-muted-foreground">{run.status === "queued" ? "Waiting for the GPU. " : "Rendering. "}Expect about 6 to 8 minutes: the model loads first, then three short segments are generated. You can leave this page; the render continues.</p>}
      {run.status === "queued" && run.dispatched === false && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <span>Saved but not sent to the GPU yet.</span>
          <button type="button" onClick={() => void s.retryDispatch(run.id)} disabled={s.busy === "dispatch"} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" />Retry dispatch</button>
        </div>)}
      {!active && run.status !== "done" && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{message ?? "The render did not complete."}</p>)}
      {run.status === "done" && video && <PrivateVideo asset={video} sign={s.signMedia} />}
      {run.status === "done" && !video && <p className="text-sm text-muted-foreground">The video is not available.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {run.status === "done" && video && <button type="button" onClick={download} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" />Download MP4</button>}
        {!active && <button type="button" disabled={s.busy === "delete"} onClick={() => { if (confirm("Delete this render? The video and its prompt are removed for good. Your portrait and audio stay in their libraries.")) void s.removeRun(run.id); }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="h-4 w-4" />Delete render</button>}
      </div>
    </section>
  );
}

export function AvatarStudio() {
  const s = useAvatar();
  const [adv, setAdv] = useState(false);
  const cost = s.readiness.cost;
  const blocker = s.blocker;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/studio" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Studio</Link>
          <h1 className="text-lg font-semibold tracking-tight">Talking avatar</h1>
          <p className="text-xs text-muted-foreground">One portrait + one audio → one MP4 of about 10 seconds · private admin</p>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", s.readiness.ready ? "border-emerald-500/30 text-emerald-400" : "border-border/60 text-muted-foreground")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", s.readiness.ready ? "bg-emerald-400" : "bg-muted-foreground/60")} />{s.readiness.ready ? "GPU authorized" : "GPU locked"}
        </span>
      </header>

      {(s.error || s.notice) && (
        <div role={s.error ? "alert" : "status"} className={cn("flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm", s.error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-primary/20 bg-primary/[0.06]")}>
          <span>{s.error || s.notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => { s.setError(""); s.setNotice(""); }} className="opacity-70 hover:opacity-100">×</button>
        </div>)}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Portraits s={s} />
          <Audios s={s} />
          <section className={box}>
            <button type="button" onClick={() => setAdv(a => !a)} aria-expanded={adv} className={cn(label, "w-full text-left")}>Advanced {adv ? "▾" : "▸"}</button>
            {adv && (<div className="mt-3 space-y-2">
              <label className="block text-xs text-muted-foreground" htmlFor="avatar-prompt">Scene prompt (optional)</label>
              <textarea id="avatar-prompt" value={s.prompt} onChange={e => s.setPrompt(e.target.value)} maxLength={600} rows={4} placeholder={s.defaultPrompt}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm" />
              <p className="text-xs text-muted-foreground">Fixed: 480p · INT8 · 8 steps · H100. The video length follows the audio (3.72, 6.92 or 10.12 s).</p>
            </div>)}
          </section>
          <div className={box}>
            <button type="button" onClick={() => void s.render()} disabled={!s.canSubmit}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50">
              {s.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{s.submitting ? "Starting…" : "Render avatar"}
            </button>
            {blocker && <p className="mt-2 text-xs text-muted-foreground">{blocker}</p>}
            {cost && (<p className="mt-2 text-xs text-muted-foreground">
              {cost.gpu ? `GPU ${cost.gpu}` : "GPU not confirmed"}
              {cost.estimate ? ` · estimated ${cost.estimate.low_usd.toFixed(2)}–${cost.estimate.high_usd.toFixed(2)} USD${cost.estimate.measured ? " (measured)" : ""}` : ""}
              {cost.reservation_usd != null ? ` · ${cost.reservation_usd.toFixed(2)} USD reserved per render (not an invoice)` : ""}
            </p>)}
            {s.readiness.allowance && <p className="mt-1 text-xs text-muted-foreground">{s.readiness.allowance.remaining_runs} authorized render(s) left</p>}
          </div>
        </div>

        <div className="space-y-4">
          {s.current ? <Result s={s} run={s.current} /> : <section className={cn(box, "text-sm text-muted-foreground")}>Your render appears here. Choose a portrait and an audio, then render.</section>}
          <section className={box} aria-labelledby="hist-h">
            <h2 id="hist-h" className={cn(label, "mb-3")}>Library</h2>
            {s.history.length === 0 ? <p className="text-sm text-muted-foreground">No avatar render yet.</p> : (
              <ul className="divide-y divide-border/50">
                {s.history.map(r => {
                  const p = (r.params_effective ?? {}) as Record<string, unknown>;
                  return (
                    <li key={r.id}><button type="button" onClick={() => void s.openRun(r.id)} aria-current={s.current?.id === r.id}
                      className={cn("flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-muted/40", s.current?.id === r.id && "bg-muted/40")}>
                      <span className="min-w-0 truncate">{String(p.image_label ?? "Portrait")} · {String(p.audio_label ?? "Audio")}<span className="block text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</span></span>
                      <StatusPill status={r.status} run={r} />
                    </button></li>);
                })}
              </ul>)}
          </section>
        </div>
      </div>
    </div>
  );
}
