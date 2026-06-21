"use client";

/**
 * ExplainerPreview — low-fi, client-side, WYSIWYG preview of an explainer.
 *
 * Renders the exact composition HTML produced by lib/explainer/composition.ts
 * (the same templates + GSAP timeline build.js uses for the final render) inside
 * an <iframe srcdoc>, then drives the in-frame GSAP timeline for play / pause /
 * scrub. It is FREE and LOCAL: no Modal, no network render, no cost. Only the
 * explicit "Render explainer" action ever spends money. See
 * docs/product/t1120-preview-spike.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import {
  buildCompositionHtml,
  compositionDurationSec,
  COMPOSITION_HEIGHT,
  COMPOSITION_WIDTH,
  type CompositionAssets,
} from "@/lib/explainer/composition";
import type { ExplainerStoryboard } from "@/lib/explainer/storyboard";

interface GsapTimeline {
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  /** GSAP time() is a getter (no arg) and a setter (with arg). */
  time: (t?: number) => number;
  duration: () => number;
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ExplainerPreview({
  storyboard,
  assets,
  className,
}: {
  storyboard: ExplainerStoryboard;
  assets?: CompositionAssets;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tlRef = useRef<GsapTimeline | null>(null);
  // Playback is driven by the PARENT clock (parent rAF runs at full speed), not the
  // iframe's GSAP ticker — an offscreen/throttled iframe rAF would otherwise freeze
  // playback. We only ever seek the in-frame timeline via time(t) to render a frame.
  const startWallRef = useRef(0);
  const startPosRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [scale, setScale] = useState(0.25);

  // The composition HTML is pure + deterministic; only rebuild when inputs change.
  const html = useMemo(() => buildCompositionHtml(storyboard, assets), [storyboard, assets]);
  const duration = useMemo(() => compositionDurationSec(storyboard, assets), [storyboard, assets]);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Scale the fixed 1920x1080 stage down to the available width.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      if (w > 0) setScale(w / COMPOSITION_WIDTH);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // New composition → reset playback state; the iframe reloads via srcdoc.
  useEffect(() => {
    setReady(false);
    setPlaying(false);
    setPos(0);
    tlRef.current = null;
  }, [html]);

  // After the iframe loads, wait for the (CDN-loaded) GSAP timeline to appear.
  const onIframeLoad = useCallback(() => {
    let tries = 0;
    const grab = () => {
      const win = iframeRef.current?.contentWindow as
        | (Window & { __timelines?: Record<string, GsapTimeline> })
        | null
        | undefined;
      const tl = win?.__timelines?.main;
      if (tl) {
        tl.pause(); // we drive it ourselves via time(t)
        tl.time(0);
        tlRef.current = tl;
        setReady(true);
        return;
      }
      if (tries++ < 120) requestAnimationFrame(grab); // ~2s budget for GSAP CDN
    };
    grab();
  }, []);

  // Drive playback from the parent clock: each parent rAF frame computes elapsed time
  // and seeks the in-frame timeline. Robust to iframe rAF throttling.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const tl = tlRef.current;
      if (tl) {
        const t = startPosRef.current + (performance.now() - startWallRef.current) / 1000;
        if (t >= duration) {
          tl.time(duration);
          setPos(duration);
          setPlaying(false);
          return;
        }
        tl.time(t);
        setPos(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stopRaf;
  }, [playing, duration, stopRaf]);

  useEffect(() => stopRaf, [stopRaf]);

  const toggle = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (playing) {
      setPlaying(false);
    } else {
      startPosRef.current = pos >= duration - 0.05 ? 0 : pos;
      startWallRef.current = performance.now();
      tl.time(startPosRef.current);
      setPos(startPosRef.current);
      setPlaying(true);
    }
  }, [playing, pos, duration]);

  const onScrub = useCallback((value: number) => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.time(value);
    setPlaying(false);
    setPos(value);
  }, []);

  return (
    <div className={className}>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-black"
        style={{ aspectRatio: `${COMPOSITION_WIDTH} / ${COMPOSITION_HEIGHT}` }}
      >
        <iframe
          ref={iframeRef}
          title="Explainer preview"
          srcDoc={html}
          onLoad={onIframeLoad}
          // allow-same-origin is required so the parent can drive the in-frame GSAP
          // timeline (play/pause/scrub). Safe here: all dynamic text in the composition
          // is HTML-escaped by composition.ts (esc()), so there is no markup injection.
          sandbox="allow-scripts allow-same-origin"
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: COMPOSITION_WIDTH,
            height: COMPOSITION_HEIGHT,
            transform: `scale(${scale})`,
          }}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!ready}
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-neutral-950 text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={playing ? "Pause preview" : "Play preview"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={pos}
          disabled={!ready}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-neutral-900 disabled:cursor-not-allowed"
          aria-label="Scrub preview"
        />
        <span className="flex-none font-mono text-xs tabular-nums text-neutral-500">
          {fmt(pos)} / {fmt(duration)}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-neutral-400">
        Live preview — same layout &amp; motion as the final render, no voice-over or live
        screenshot. Free and local; nothing is rendered or charged until you click Render.
      </p>
    </div>
  );
}
