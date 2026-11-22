"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Download, Film, Image as ImageIcon, Loader2, RefreshCw, Shuffle, SplitSquareHorizontal, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, formatElapsed, isActive } from "@/lib/studio/status";
import { financeView, stageView, type StageInput } from "@/lib/studio/stage";
import { modelForTemplateVersion } from "@/lib/studio/catalog";
import { ImageCompare, ImageDownloads, PrivateImage } from "./image-result";
import { PrivateVideo } from "./private-video";
import { AudioCaution, AudioInfo, VersionCompare, VideoRunCompare } from "./video-compare";
import { videoCompareCandidates } from "@/lib/studio/video-compare";
import type { StudioRun } from "./types";
import type { StudioState } from "./use-studio";

const ROLE_LABEL: Record<string, string> = { final: "Corrected", raw: "Original" };

export function StatusPill({ status, run }: { status: string; run?: Omit<StageInput, "status"> }) {
  const v = stageView({ ...run, status });
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

export function ResultStage({ s }: { s: StudioState }) {
  const run = s.current;
  const now = useNow(!!run && isActive(run.status));
  const [view, setView] = useState<"final" | "raw" | "compare" | "runs">("final");
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
  const view_ = stageView(run);
  const finance = run.status === "loading" ? null : financeView(run.finance_status);
  const err = errorMessage(run.error_code);

  const runModel = modelForTemplateVersion(run.template_version);
  const isImage = runModel.kind === "image";

  const singleVideo = run.status === "done" && !isImage && !!final && (view === "final" || view === "raw");
  const videoDone = run.status === "done" && !isImage && assets.length > 0;
  const comparing = videoDone && (view === "runs" || view === "compare");
  const videoOthers = isImage ? [] : videoCompareCandidates(s.history, run.id);
  const showView = (v: typeof view) => { setView(v); s.setCompareWith(v === "runs" ? (s.compareWith ?? videoOthers[0]?.id ?? null) : null); };

  return (
    <div className={cn("flex h-full flex-col", videoDone && "max-lg:overflow-y-auto")}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill status={run.status} run={run} />
          <span className="text-xs text-muted-foreground">
            {isActive(run.status) && run.created_at ? `${formatElapsed(run.created_at, now)} elapsed` : run.generation_seconds ? `${Math.round(run.generation_seconds)} s generation` : null}
          </span>
        </div>
        {run.status === "done" && isImage && <ImageTabs s={s} run={run} />}
        {run.status === "done" && !isImage && (
          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1" role="tablist" aria-label="Result version">
            {(["final", "raw", "compare", "runs"] as const).filter(v => v !== "compare" || (final && raw)).map(v => {
              const noOther = v === "runs" && videoOthers.length === 0;
              return (
                <button key={v} type="button" role="tab" aria-selected={view === v} disabled={noOther} onClick={() => showView(v)}
                  title={noOther ? "Generate another video to compare two runs" : v === "runs" ? "Compare with another generation" : v === "compare" ? "Original and Corrected side by side" : undefined}
                  className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition disabled:opacity-40 lg:min-h-7", view === v ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                  {v === "compare" && <SplitSquareHorizontal className="h-3.5 w-3.5" />}{v === "runs" && <Columns2 className="h-3.5 w-3.5" />}
                  {v === "compare" ? "Compare" : v === "runs" ? "Compare runs" : ROLE_LABEL[v]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", videoDone && "lg:overflow-y-auto")}>
      <div className={cn("flex flex-1 justify-center p-5", videoDone ? "min-h-[260px]" : "min-h-0", comparing ? "items-start" : "items-center")}>
        {run.status === "done" && assets.length > 0 && isImage ? (
          s.compareWith && raw ? <ImageCompare s={s} run={run} />
            : raw ? <PrivateImage asset={raw} s={s} sizes={runModel.manifest?.resolutions} aspect={aspect} className="max-h-full max-w-full rounded-2xl shadow-2xl shadow-black/40" /> : null
        ) : run.status === "done" && assets.length > 0 ? (
          view === "runs" ? <VideoRunCompare s={s} run={run as StudioRun} onClose={() => showView("final")} />
          : view === "compare" && final && raw ? <VersionCompare s={s} run={run as StudioRun} />
          : (() => { const a = view === "raw" ? raw : final ?? raw; return a ? <PrivateVideo asset={a} s={s} label={view === "raw" ? "Original" : "Corrected"} className={cn("max-h-full w-auto max-w-full rounded-2xl shadow-2xl shadow-black/40", ratio, "h-full")} /> : null; })()
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

      {singleVideo && (
        <div className="space-y-2 px-5 pb-2"><AudioCaution run={run as StudioRun} /><AudioInfo /></div>
      )}
      </div>

      {finance && <p className="px-5 pb-2 text-xs text-muted-foreground" title={finance.description}>{finance.label}: {finance.description}</p>}
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
