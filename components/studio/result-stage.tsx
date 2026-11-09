"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, Download, Film, Image as ImageIcon, Loader2, Play, RefreshCw, Shuffle, SplitSquareHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, formatElapsed, isActive, statusView } from "@/lib/studio/status";
import { modelForTemplateVersion } from "@/lib/studio/catalog";
import { ImageCompare, ImageDownloads, PrivateImage } from "./image-result";
import type { StudioAsset, StudioRun } from "./types";
import type { StudioState } from "./use-studio";

const ROLE_LABEL: Record<string, string> = { final: "Corrected", raw: "Original" };

export function StatusPill({ status }: { status: string }) {
  const v = statusView(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
      v.tone === "progress" && "bg-primary/15 text-primary", v.tone === "neutral" && "bg-sky-500/10 text-sky-400",
      v.tone === "success" && "bg-emerald-500/10 text-emerald-400", v.tone === "danger" && "bg-red-500/10 text-red-400",
      v.tone === "muted" && "bg-muted text-muted-foreground")}>
      {isActive(status) ? <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" /></span> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {v.label}
    </span>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);
  return now;
}

/** Private video with signed-URL refresh when a link expires. */
function PrivateVideo({ asset, s, videoRef, muted, className }: { asset: StudioAsset; s: StudioState; videoRef?: React.Ref<HTMLVideoElement>; muted?: boolean; className?: string }) {
  const [url, setUrl] = useState<string | null>(s.media[asset.id]?.url ?? null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  const { signMedia } = s;
  useEffect(() => {
    let live = true; retried.current = false; setFailed(false);
    signMedia(asset.id).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sign once per asset; refresh handled on error
  }, [asset.id]);
  const onError = useCallback(async () => {
    if (retried.current) { setFailed(true); return; }
    retried.current = true;
    try { setUrl(await signMedia(asset.id, { force: true })); } catch { setFailed(true); }
  }, [asset.id, signMedia]);
  if (failed) return <div className={cn("grid place-items-center bg-black/40 text-sm text-muted-foreground", className)}>Private link unavailable</div>;
  if (!url) return <div className={cn("grid place-items-center bg-black/40", className)}><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  return <video ref={videoRef} key={url} src={url} controls playsInline muted={muted} preload="metadata" onError={onError} className={cn("bg-black object-contain", className)} />;
}

export function ResultStage({ s }: { s: StudioState }) {
  const run = s.current;
  const now = useNow(!!run && isActive(run.status));
  const [view, setView] = useState<"final" | "raw" | "compare">("final");
  const left = useRef<HTMLVideoElement>(null), right = useRef<HTMLVideoElement>(null);
  useEffect(() => setView("final"), [run?.id]);

  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl" />
          <div className="grid h-16 w-16 place-items-center rounded-3xl border border-border/60 bg-card/60">{s.model.kind === "image" ? <ImageIcon className="h-7 w-7 text-primary" /> : <Film className="h-7 w-7 text-primary" />}</div>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Your canvas is empty</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Write a prompt, pick a format and generate. Every result stays private and appears in your history.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          {[...s.model.capabilities.slice(0, 3), "Private by default"].map(t => <span key={t} className="rounded-full border border-border/60 px-3 py-1">{t}</span>)}
        </div>
      </div>
    );
  }

  const assets = run.assets ?? [];
  const byRole = (role: string) => assets.find(a => a.role === role);
  const final = byRole("final"), raw = byRole("raw");
  const params = run.params_effective ?? {};
  const aspect = String(params.aspect ?? "9:16");
  const ratio = aspect === "16:9" ? "aspect-video" : aspect === "1:1" ? "aspect-square" : "aspect-[9/16]";
  const view_ = statusView(run.status);
  const err = errorMessage(run.error_code);

  const runModel = modelForTemplateVersion(run.template_version);
  const isImage = runModel.kind === "image";

  const playBoth = () => {
    for (const v of [left.current, right.current]) if (v) { v.currentTime = 0; void v.play().catch(() => undefined); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill status={run.status} />
          <span className="text-xs text-muted-foreground">
            {isActive(run.status) && run.created_at ? `${formatElapsed(run.created_at, now)} elapsed` : run.generation_seconds ? `${Math.round(run.generation_seconds)} s generation` : null}
          </span>
        </div>
        {run.status === "done" && isImage && <ImageTabs s={s} run={run} />}
        {run.status === "done" && !isImage && (
          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1" role="tablist" aria-label="Result version">
            {(["final", "raw", "compare"] as const).filter(v => v !== "compare" || (final && raw)).map(v => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition", view === v ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                {v === "compare" && <SplitSquareHorizontal className="h-3.5 w-3.5" />}{v === "compare" ? "Compare" : ROLE_LABEL[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-5">
        {run.status === "done" && assets.length > 0 && isImage ? (
          s.compareWith && raw ? <ImageCompare s={s} run={run} />
            : raw ? <PrivateImage asset={raw} s={s} sizes={runModel.manifest?.resolutions} aspect={aspect} className="max-h-full max-w-full rounded-2xl shadow-2xl shadow-black/40" /> : null
        ) : run.status === "done" && assets.length > 0 ? (
          view === "compare" && final && raw ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <div className="grid h-full max-h-[70vh] w-full grid-cols-2 gap-3">
                {[raw, final].map((a, i) => (
                  <figure key={a.id} className="flex min-h-0 flex-col gap-2">
                    <PrivateVideo asset={a} s={s} videoRef={i === 0 ? left : right} muted={i === 0} className="min-h-0 w-full flex-1 rounded-2xl" />
                    <figcaption className="text-center text-xs text-muted-foreground">{ROLE_LABEL[a.role]}{i === 0 ? " · muted" : ""}</figcaption>
                  </figure>
                ))}
              </div>
              <button type="button" onClick={playBoth} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"><Play className="h-3.5 w-3.5" />Play both from start</button>
            </div>
          ) : (
            (() => { const a = view === "raw" ? raw : final ?? raw; return a ? <PrivateVideo asset={a} s={s} className={cn("max-h-full w-auto max-w-full rounded-2xl shadow-2xl shadow-black/40", ratio, "h-full")} /> : null; })()
          )
        ) : run.status === "loading" ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading run" />
        ) : isActive(run.status) ? (
          <div className={cn("relative flex max-h-full w-auto items-center justify-center overflow-hidden rounded-2xl border border-border/50 bg-card/40", !isImage && ratio, "h-[min(70vh,640px)]")}
            style={isImage ? { aspectRatio: (runModel.manifest?.resolutions?.[aspect] ?? [1, 1]).join("/") } : undefined}>
            <div className="studio-shimmer absolute inset-0" aria-hidden />
            <div className="relative space-y-2 px-6 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="text-sm font-medium">{view_.label}</p>
              <p className="text-xs text-muted-foreground">{view_.description}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-sm rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-red-400" />
            <p className="font-medium">{view_.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{err ?? view_.description}</p>
            <p className="mt-3 text-xs text-muted-foreground/80">The reservation stays committed until invoice reconciliation. A new run needs a fresh authorization.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-5 py-3">
        <p className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground" title={String(params.prompt ?? "")}>{String(params.prompt ?? "")}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {run.status === "queued" && <ActionButton icon={RefreshCw} label="Retry dispatch" onClick={() => void s.retryDispatch(run.id)} />}
          {run.status === "done" && isImage && raw && <ImageDownloads s={s} run={run} asset={raw} />}
          {run.status === "done" && !isImage && final && <ActionButton icon={Download} label="Corrected" onClick={() => void s.download(final.id)} />}
          {run.status === "done" && !isImage && raw && <ActionButton icon={Download} label="Original" onClick={() => void s.download(raw.id)} />}
          {run.status !== "loading" && <>
            <ActionButton icon={Copy} label="Reuse settings" onClick={() => s.reuse(run as StudioRun, true)} />
            <ActionButton icon={Shuffle} label="New seed" onClick={() => s.reuse(run as StudioRun, false)} />
          </>}
        </div>
      </div>
    </div>
  );
}

function ImageTabs({ s, run }: { s: StudioState; run: StudioRun }) {
  const others = s.compareCandidates(run.id);
  const tab = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition", active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1" role="tablist" aria-label="Result view">
      <button type="button" role="tab" aria-selected={!s.compareWith} onClick={() => s.setCompareWith(null)} className={tab(!s.compareWith)}>Image</button>
      <button type="button" role="tab" aria-selected={!!s.compareWith} disabled={others.length === 0}
        title={others.length ? undefined : "Generate another image to compare"}
        onClick={() => s.setCompareWith(s.compareWith ?? others[0].id)} className={cn(tab(!!s.compareWith), "disabled:opacity-40")}>
        <SplitSquareHorizontal className="h-3.5 w-3.5" />Compare
      </button>
    </div>
  );
}

export function ActionButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground">
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );
}
