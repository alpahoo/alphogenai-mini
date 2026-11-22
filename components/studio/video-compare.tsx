"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, Pause, Play, TriangleAlert, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AUDIO_EXPLANATION, FACT_ROWS, audioShiftCautionText, durationNote, formatFact, mutedFor, primaryVideoAsset,
  runFacts, speechAtStartCaution, videoCompareCandidates, createSeekMirror, nextAudibleOnVolumeChange, type AudibleTrack,
} from "@/lib/studio/video-compare";
import { PrivateVideo } from "./private-video";
import type { StudioRun } from "./types";
import type { StudioState } from "./use-studio";

/**
 * Best-effort synchronisation of two <video> elements: play, pause and seeks made on one are mirrored on the other.
 * Browsers give no frame-accurate guarantee, so this is not claimed: small drifts can appear and each file keeps its
 * own native controls. A clip that ends first stays on its last frame while the longer one continues.
 */
export function useMirroredPlayers() {
  const a = useRef<HTMLVideoElement | null>(null), b = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  // Persist across state-driven re-renders: a native seeked can arrive after effect reattachment.
  const mirrorSeek = useRef(createSeekMirror());

  useEffect(() => {
    const va = a.current, vb = b.current;
    if (!va || !vb) return;
    const mirror = (src: HTMLVideoElement, dst: HTMLVideoElement) => {
      // Idempotent checks (not flags): applying a change to the other player re-fires its event, which then does nothing.
      const onPlay = () => { setPlaying(true); if (dst.paused && !dst.ended) void dst.play().catch(() => undefined); };
      const onPause = () => { if (src.ended) return; if (!dst.paused) dst.pause(); setPlaying(false); };
      const onSeeked = () => mirrorSeek.current(src, dst);
      src.addEventListener("play", onPlay); src.addEventListener("pause", onPause); src.addEventListener("seeked", onSeeked);
      return () => { src.removeEventListener("play", onPlay); src.removeEventListener("pause", onPause); src.removeEventListener("seeked", onSeeked); };
    };
    const off1 = mirror(va, vb), off2 = mirror(vb, va);
    return () => { off1(); off2(); };
  });

  const playBothFromStart = useCallback(() => {
    for (const v of [a.current, b.current]) if (v) v.currentTime = 0;
    for (const v of [a.current, b.current]) if (v) void v.play().catch(() => undefined);
  }, []);
  const toggle = useCallback(() => {
    const vs = [a.current, b.current].filter(Boolean) as HTMLVideoElement[];
    if (vs.some(v => !v.paused)) vs.forEach(v => v.pause()); else vs.forEach(v => void v.play().catch(() => undefined));
  }, []);
  return { a, b, playing, playBothFromStart, toggle };
}

/** Keep native video controls and SoundSwitch in sync: an unmuted side becomes the only audible side. */
function useExclusiveAudio(a: React.RefObject<HTMLVideoElement | null>, b: React.RefObject<HTMLVideoElement | null>, initial: AudibleTrack) {
  const [audible, setAudible] = useState<AudibleTrack>(initial);
  const onVolumeChange = (side: "a" | "b", video: HTMLVideoElement) => {
    if (!video.muted) {
      // Enforce exclusivity immediately, not only after React commits new muted props.
      const other = side === "a" ? b.current : a.current;
      if (other && !other.muted) other.muted = true;
    }
    setAudible(previous => nextAudibleOnVolumeChange(previous, side, video.muted));
  };
  return { audible, setAudible, onVolumeChange };
}

/** One audible track at a time: two simultaneous soundtracks make the difference hard to hear. */
export function SoundSwitch({ value, onChange, labels }: { value: AudibleTrack; onChange: (v: AudibleTrack) => void; labels: { a: string; b: string } }) {
  const opts: { v: AudibleTrack; label: string }[] = [{ v: "a", label: labels.a }, { v: "b", label: labels.b }, { v: "off", label: "Off" }];
  return (
    <div role="radiogroup" aria-label="Sound: only one track plays at a time" className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
      <span className="flex items-center gap-1 px-1.5 text-xs text-muted-foreground"><Volume2 className="h-3.5 w-3.5" />Sound</span>
      {opts.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cn("min-h-9 rounded-lg px-2.5 py-1 text-xs transition lg:min-h-7", value === o.v ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const barBtn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground lg:min-h-8";

/** Non-blocking caution for prompts that seem to ask for speech without delaying it. */
export function AudioCaution({ run, label }: { run: StudioRun; label?: string }) {
  const f = runFacts(run);
  if (!speechAtStartCaution(f.prompt)) return null;
  return (
    <p role="note" data-testid="audio-caution" className="flex shrink-0 items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-200/90">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{label ? `${label}. ` : ""}{audioShiftCautionText(f.audioShiftS)}
    </p>
  );
}

/** What Original and Corrected mean, in plain words. */
export function AudioInfo() {
  return (
    <details className="group rounded-xl border border-border/50 bg-card/30 px-3 py-2 text-xs text-muted-foreground" data-testid="audio-info">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 font-medium lg:min-h-8 text-foreground/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60"><Info className="h-3.5 w-3.5" />About Original and Corrected audio</summary>
      <dl className="mt-2 space-y-1.5 leading-relaxed">
        {AUDIO_EXPLANATION.map(x => <div key={x.term}><dt className="inline font-medium text-foreground/90">{x.term}: </dt><dd className="inline">{x.text}</dd></div>)}
      </dl>
    </details>
  );
}

/** Original versus Corrected of the same run, one soundtrack at a time. */
export function VersionCompare({ s, run }: { s: StudioState; run: StudioRun }) {
  const raw = run.assets?.find(a => a.role === "raw"), final = run.assets?.find(a => a.role === "final");
  const { a, b, playBothFromStart, toggle, playing } = useMirroredPlayers();
  const { audible, setAudible, onVolumeChange } = useExclusiveAudio(a, b, "b");
  if (!raw || !final) return null;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        <SoundSwitch value={audible} onChange={setAudible} labels={{ a: "Original", b: "Corrected" }} />
        <button type="button" onClick={playBothFromStart} className={barBtn}><Play className="h-3.5 w-3.5" />Play both from start</button>
        <button type="button" onClick={toggle} className={barBtn}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? "Pause both" : "Resume both"}</button>
      </div>
      <div className="grid w-full shrink-0 grid-cols-1 gap-3 md:grid-cols-2">
        {([[raw, "Original", a, "a"], [final, "Corrected", b, "b"]] as const).map(([asset, name, ref, side]) => (
          <figure key={asset.id} className="flex min-w-0 flex-col gap-2">
            <PrivateVideo asset={asset} s={s} videoRef={ref} muted={mutedFor(audible, side)} onVolumeChange={video => onVolumeChange(side, video)} label={name}
              style={{ aspectRatio: aspectOf(run) }} className="max-h-[50vh] w-full rounded-2xl md:max-h-[48vh]" />
            <figcaption className="text-center text-xs text-muted-foreground">{name}{mutedFor(audible, side) ? " · muted" : " · sound on"}</figcaption>
          </figure>
        ))}
      </div>
      <AudioCaution run={run} />
    </div>
  );
}

function aspectOf(run: StudioRun): string {
  const aspect = String(run.params_effective?.aspect ?? "9:16");
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? `${w}/${h}` : "9/16";
}

/** Two distinct video runs from the administrator's own history, side by side. Read only. */
export function VideoRunCompare({ s, run, onClose }: { s: StudioState; run: StudioRun; onClose: () => void }) {
  const others = videoCompareCandidates(s.history, run.id);
  const other = others.find(o => o.id === s.compareWith) ?? others[0];
  if (!other) {
    return (
      <div className="max-w-sm space-y-3 text-center" data-testid="compare-empty">
        <p className="font-medium">No other video to compare yet</p>
        <p className="text-sm text-muted-foreground">Completed video runs from your history appear here. Generate another one, then come back to compare the two.</p>
        <button type="button" onClick={onClose} className={barBtn}><ArrowLeft className="h-3.5 w-3.5" />Back to single video</button>
      </div>
    );
  }
  return <RunPair key={`${run.id}:${other.id}`} s={s} runA={run} runB={other} others={others} onClose={onClose} />;
}

function RunPair({ s, runA, runB, others, onClose }: { s: StudioState; runA: StudioRun; runB: StudioRun; others: StudioRun[]; onClose: () => void }) {
  const { a, b, playBothFromStart, toggle, playing } = useMirroredPlayers();
  const { audible, setAudible, onVolumeChange } = useExclusiveAudio(a, b, "a");
  const [dur, setDur] = useState<{ a?: number; b?: number }>({});
  const assetA = primaryVideoAsset(runA), assetB = primaryVideoAsset(runB);
  const facts = [runFacts(runA), runFacts(runB)] as const;
  const note = durationNote(dur.a, dur.b);
  return (
    <div className="flex w-full flex-col gap-3" data-testid="video-run-compare">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={barBtn}><ArrowLeft className="h-3.5 w-3.5" />Back to single video</button>
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          Compare with
          <select value={runB.id} onChange={e => s.setCompareWith(e.target.value)} aria-label="Second video to compare"
            className="h-10 min-w-0 max-w-[14rem] truncate rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground lg:h-8">
            {others.map(o => { const f = runFacts(o); return <option key={o.id} value={o.id}>{(f.prompt || o.id).slice(0, 40)} · {[f.aspect, f.seconds && `${f.seconds}s`, f.quality].filter(Boolean).join(" ")}</option>; })}
          </select>
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        <SoundSwitch value={audible} onChange={setAudible} labels={{ a: "A", b: "B" }} />
        <button type="button" onClick={playBothFromStart} className={barBtn}><Play className="h-3.5 w-3.5" />Play both from start</button>
        <button type="button" onClick={toggle} className={barBtn}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? "Pause both" : "Resume both"}</button>
      </div>
      <div className="grid w-full shrink-0 grid-cols-1 gap-3 md:grid-cols-2">
        {([[assetA, "A", a, "a", runA], [assetB, "B", b, "b", runB]] as const).map(([asset, tag, ref, side, r]) => (
          <figure key={tag} className="flex min-w-0 flex-col gap-2">
            {asset && <PrivateVideo asset={asset} s={s} videoRef={ref} muted={mutedFor(audible, side)} onVolumeChange={video => onVolumeChange(side, video)} label={`Video ${tag}`}
              onMetadata={m => setDur(d => ({ ...d, [side]: m.duration }))} style={{ aspectRatio: aspectOf(r) }}
              className="max-h-[50vh] w-full rounded-2xl md:max-h-[48vh]" />}
            <figcaption className="text-center text-xs text-muted-foreground"><span className="font-semibold text-foreground">Video {tag}</span>{side === "a" ? " · current" : ""}{mutedFor(audible, side) ? " · muted" : " · sound on"}</figcaption>
          </figure>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground/80">Play, pause and seeking are mirrored on a best-effort basis. Browsers do not guarantee frame-exact sync.{note ? ` ${note}` : ""}</p>
      <div className="shrink-0 overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full min-w-[20rem] text-left text-xs" data-testid="compare-facts">
          <caption className="sr-only">Settings of video A and video B</caption>
          <thead><tr className="border-b border-border/50 text-muted-foreground"><th scope="col" className="px-3 py-2 font-medium">Setting</th><th scope="col" className="px-3 py-2 font-medium">A</th><th scope="col" className="px-3 py-2 font-medium">B</th></tr></thead>
          <tbody>
            {FACT_ROWS.map(row => {
              const [fa, fb] = [formatFact(row.key, facts[0]), formatFact(row.key, facts[1])];
              return <tr key={row.key} className="border-b border-border/30 last:border-0"><th scope="row" className="px-3 py-1.5 font-normal text-muted-foreground">{row.label}</th>
                <td className={cn("px-3 py-1.5", fa !== fb && "text-foreground")}>{fa}</td><td className={cn("px-3 py-1.5", fa !== fb && "text-foreground")}>{fb}</td></tr>;
            })}
            <tr><th scope="row" className="px-3 py-1.5 align-top font-normal text-muted-foreground">Prompt</th>
              <td className="px-3 py-1.5 align-top"><span className="line-clamp-4 break-words">{facts[0].prompt || "Not recorded"}</span></td>
              <td className="px-3 py-1.5 align-top"><span className="line-clamp-4 break-words">{facts[1].prompt || "Not recorded"}</span></td></tr>
          </tbody>
        </table>
      </div>
      <AudioCaution run={runA} label="Video A" />
      <AudioCaution run={runB} label="Video B" />
    </div>
  );
}
