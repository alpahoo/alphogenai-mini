"use client";

import { AlertTriangle, Copy, Film, Loader2, Play, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/studio/status";
import { stageView } from "@/lib/studio/stage";
import { needsDispatchRetry, playableAsset, tileKind, tilePrompt, tileRatio, videoRuns } from "@/lib/studio/video-screen";
import { StatusPill } from "../result-stage";
import type { StudioRun } from "../types";
import type { StudioState } from "../use-studio";
import { Masonry } from "./masonry";

/**
 * The member's own videos as tiles, newest first.
 *
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/history.tsx. Differences: the tiles read the Studio's private H3 history, not Parallax's jobs;
 * a file link is signed only when its tile comes into view (and again if it expires), never stored; a failed run
 * offers "Reuse settings", never an automatic retry, because a new run needs a new reservation. See ./LICENSE-parallax.txt.
 */
const tile = "group relative w-full overflow-clip rounded-2xl border border-border/60 bg-muted/30";

/** True once the element has been near the viewport (always true where IntersectionObserver is missing). */
function useSeen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** A finished video: its first frame at rest, playing silently while the pointer is over it. */
function DoneTile({ run, s, onOpen }: { run: StudioRun; s: StudioState; onOpen: () => void }) {
  const asset = playableAsset(run)!;
  const [ref, seen] = useSeen<HTMLButtonElement>();
  const [url, setUrl] = useState<string | null>(s.media[asset.id]?.url ?? null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const retried = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const { signMedia } = s;
  useEffect(() => {
    if (!seen || url) return;
    let live = true;
    signMedia(asset.id).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sign once per tile when it is first seen; expiry is handled on error
  }, [seen, asset.id]);
  const onError = async () => {
    if (retried.current) { setFailed(true); return; }
    retried.current = true;
    try { setUrl(await signMedia(asset.id, { force: true })); } catch { setFailed(true); }
  };
  const start = () => { setPlaying(true); void video.current?.play().catch(() => setPlaying(false)); };
  const stop = () => { setPlaying(false); video.current?.pause(); };
  return (
    <button ref={ref} type="button" onClick={onOpen} onMouseEnter={start} onMouseLeave={stop} onFocus={start} onBlur={stop}
      aria-label={`Open: ${tilePrompt(run)}`} className={cn(tile, "block text-left")} style={{ aspectRatio: tileRatio(run) }}>
      {url && !failed ? (
        <video ref={video} key={url} src={`${url}#t=0.1`} muted loop playsInline preload="metadata" onError={() => void onError()} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground">
          {failed ? <span className="px-3 text-center text-xs">Private link unavailable</span> : seen ? <Loader2 className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />}
        </span>
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
      <span className="absolute inset-x-3 bottom-3 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
        <span className="line-clamp-2 text-sm font-medium leading-5 text-white/90">{tilePrompt(run)}</span>
        <span className="text-[10px] text-white/60">{[run.params_effective?.seconds && `${run.params_effective.seconds}s`, run.params_effective?.aspect].filter(Boolean).join(" · ")}</span>
      </span>
      {!playing && <span aria-hidden className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"><Play className="h-3 w-3 fill-current" /></span>}
    </button>
  );
}

/** Queued or running: its place in the gallery, with the real status and, when needed, the dispatch retry. */
function PendingTile({ run, s, onOpen }: { run: StudioRun; s: StudioState; onOpen: () => void }) {
  const view = stageView(run);
  return (
    <div className={cn(tile, "studio-shimmer")} style={{ aspectRatio: tileRatio(run) }} data-status={run.status}>
      <button type="button" onClick={onOpen} aria-label={`Open: ${tilePrompt(run)}`} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        <StatusPill status={run.status} run={run} />
        <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{view.description}</p>
      </div>
      {needsDispatchRetry(run) && (
        <button type="button" onClick={() => void s.retryDispatch(run.id)}
          className="absolute inset-x-3 bottom-3 z-10 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/80 px-3 text-xs text-foreground backdrop-blur-sm hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" />Retry dispatch
        </button>
      )}
    </div>
  );
}

/** Ended without a result. The reservation stays committed, so the only action offered is to reuse the settings. */
function FailedTile({ run, s, onOpen }: { run: StudioRun; s: StudioState; onOpen: () => void }) {
  const unavailable = tileKind(run) === "unavailable";
  const message = unavailable ? "This run finished but no private file is listed." : errorMessage(run.error_code) ?? stageView(run).description;
  return (
    <div className={tile} style={{ aspectRatio: tileRatio(run) }} data-status={unavailable ? "unavailable" : run.status}>
      <button type="button" onClick={onOpen} aria-label={`Open: ${tilePrompt(run)}`} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center">
        <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden />
        <StatusPill status={unavailable ? "failed" : run.status} run={run} />
        <p className="line-clamp-3 text-xs leading-4 text-muted-foreground">{message}</p>
      </div>
      <button type="button" onClick={() => s.reuse(run, true)}
        className="absolute inset-x-3 bottom-3 z-10 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/80 px-3 text-xs text-foreground backdrop-blur-sm hover:bg-muted">
        <Copy className="h-3.5 w-3.5" />Reuse settings
      </button>
    </div>
  );
}

export function VideoHistory({ s, onOpen }: { s: StudioState; onOpen: (id: string) => void }) {
  const runs = videoRuns(s.history) ?? [];
  return (
    <Masonry label="Your videos" className="pt-2" items={runs.map(run => {
      const kind = tileKind(run);
      return {
        key: run.id,
        node: kind === "done" ? <DoneTile run={run} s={s} onOpen={() => onOpen(run.id)} />
          : kind === "pending" ? <PendingTile run={run} s={s} onOpen={() => onOpen(run.id)} />
          : <FailedTile run={run} s={s} onOpen={() => onOpen(run.id)} />,
      };
    })} />
  );
}

/** The quiet shapes shown while the list is on its way. */
export function HistorySkeleton() {
  return (
    <ul aria-hidden className="mx-auto grid w-full max-w-[1022px] grid-cols-2 gap-3 pt-2 xl:grid-cols-3">
      {["9 / 16", "16 / 9", "9 / 16", "1 / 1", "9 / 16", "16 / 9"].map((r, i) => (
        <li key={i}><div className="studio-shimmer w-full rounded-2xl bg-muted/30" style={{ aspectRatio: r }} /></li>
      ))}
    </ul>
  );
}
