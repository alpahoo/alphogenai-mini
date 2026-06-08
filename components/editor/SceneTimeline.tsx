"use client";

import { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Film,
} from "lucide-react";
import type { JobScene } from "@/lib/types";
import { sceneStatusMeta } from "@/lib/scene-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SceneTimelineProps {
  scenes: JobScene[];
  /** Index of the currently selected scene (-1 = none) */
  selectedIndex: number;
  /** Called when user clicks a scene */
  onSelect: (index: number) => void;
  /** Whether the job is fully complete (enables seek-on-click) */
  isDone?: boolean;
  /** Total duration of the video in seconds (for proportional widths) */
  totalDuration?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusIndicator(status: string) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-3 w-3 text-green-400" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" />;
    case "generating":
    case "encoding":
    case "uploading":
      return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
    case "skipped":
      return <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />;
    default: // pending
      return <div className="h-3 w-3 rounded-full border border-muted-foreground/40" />;
  }
}

function statusLabel(status: string): string {
  return sceneStatusMeta(status).label;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SceneTimeline({
  scenes,
  selectedIndex,
  onSelect,
  isDone = false,
  totalDuration,
}: SceneTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected scene into view
  const scrollToScene = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const child = container.children[index] as HTMLElement | undefined;
      if (child) {
        child.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    },
    [],
  );

  if (scenes.length <= 1) return null;

  // Calculate proportional widths based on duration
  const total = totalDuration ?? scenes.reduce((s, sc) => s + (sc.duration_sec ?? 5), 0);

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {scenes.length} scenes &middot; {Math.round(total)}s
        </span>
      </div>

      {/* Horizontal scrollable timeline */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      >
        {scenes.map((scene, i) => {
          const isSelected = i === selectedIndex;
          const dur = scene.duration_sec ?? 5;
          // Min width 120px, proportional scaling up to 280px
          const pct = total > 0 ? dur / total : 1 / scenes.length;
          const minW = 120;
          const maxW = 280;
          const width = Math.max(minW, Math.min(maxW, pct * scenes.length * 160));

          return (
            <motion.button
              key={scene.id ?? i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => {
                onSelect(i);
                scrollToScene(i);
              }}
              style={{ minWidth: `${width}px` }}
              className={`
                group relative flex flex-col rounded-lg border p-2.5 text-left transition-all duration-200 shrink-0
                ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                    : "border-border/30 bg-background/40 hover:border-border/60 hover:bg-background/60"
                }
              `}
            >
              {/* Thumbnail area */}
              <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-md bg-muted/30">
                {scene.clip_url ? (
                  <video
                    src={scene.clip_url}
                    className="h-full w-full object-cover"
                    preload="metadata"
                    muted
                    playsInline
                  />
                ) : scene.last_frame_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scene.last_frame_url}
                    alt={`Scene ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {scene.status === "generating" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                    ) : (
                      <Film className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </div>
                )}

                {/* Play overlay on hover (done scenes only) */}
                {isDone && scene.status === "done" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-5 w-5 text-white" fill="white" />
                  </div>
                )}

                {/* Duration badge */}
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white tabular-nums">
                  {dur}s
                </span>
              </div>

              {/* Scene info */}
              <div className="flex items-start gap-1.5">
                {statusIndicator(scene.status)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold">
                      Scene {i + 1}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {statusLabel(scene.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                    {scene.prompt}
                  </p>
                </div>
              </div>

              {/* Selected indicator bar */}
              {isSelected && (
                <motion.div
                  layoutId="timeline-indicator"
                  className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Playhead / progress bar (visual only) */}
      <div className="mt-3 flex gap-0.5">
        {scenes.map((scene, i) => {
          const dur = scene.duration_sec ?? 5;
          const pct = total > 0 ? (dur / total) * 100 : 100 / scenes.length;
          return (
            <div
              key={scene.id ?? i}
              style={{ width: `${pct}%` }}
              className={`h-1 rounded-full transition-colors duration-300 ${
                scene.status === "done"
                  ? i === selectedIndex
                    ? "bg-primary"
                    : "bg-primary/40"
                  : scene.status === "failed"
                    ? "bg-red-400/60"
                    : scene.status === "generating"
                      ? "bg-primary/30 animate-pulse"
                      : "bg-muted/40"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
