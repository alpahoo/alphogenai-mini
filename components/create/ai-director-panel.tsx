"use client";

/**
 * AI Director — editable pre-generation plan panel.
 *
 * Renders an editable scene plan + quality read-out. Submission is wired by the
 * page (`Generate now` → submitJob({ directorScenes }) → existing POST /api/jobs
 * `scenes[]` path). Spec: docs/product/ai-director-spec.md.
 * Provider/aggregator names must never appear here — only models/capabilities.
 */

import { Sparkles, Wand2, Clapperboard, X, Loader2 } from "lucide-react";
import type { QualityReadout, QualityTone } from "@/lib/director-quality";

export type { QualityReadout, QualityTone };

export interface DirectorSceneVM {
  index: number;
  title: string;
  prompt: string;
  durationSec: number;
  camera?: string;
  assets: { kind: "face" | "image" | "style"; label: string; thumb?: string | null }[];
  recommendedModel: string; // already provider-clean
  notes?: string[];
}

export type DirectorAction =
  | "improve"
  | "cinematic"
  | "realistic"
  | "tiktok"
  | "keep-character";

interface AIDirectorPanelProps {
  scenes: DirectorSceneVM[];
  quality: QualityReadout;
  generating?: boolean;
  onSceneChange: (index: number, patch: Partial<DirectorSceneVM>) => void;
  onGenerate: () => void;
  onAction: (action: DirectorAction) => void;
  onClose: () => void;
}

const TONE: Record<QualityTone, string> = {
  good: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  risky: "bg-red-500/15 text-red-500",
};

const ASSET_TONE: Record<DirectorSceneVM["assets"][number]["kind"], string> = {
  face: "bg-primary/15 text-primary",
  image: "bg-violet-500/15 text-violet-500",
  style: "bg-amber-500/15 text-amber-600",
};

const ACTIONS: { id: DirectorAction; label: string }[] = [
  { id: "improve", label: "Improve direction" },
  { id: "cinematic", label: "More cinematic" },
  { id: "realistic", label: "More realistic" },
  { id: "tiktok", label: "Shorter for TikTok" },
  { id: "keep-character", label: "Keep same character" },
];

function QualityChip({ label, value, tone }: { label: string; value: string; tone?: QualityTone }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-background px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
          tone ? TONE[tone] : "bg-muted text-foreground/80"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function AIDirectorPanel({
  scenes,
  quality,
  generating,
  onSceneChange,
  onGenerate,
  onAction,
  onClose,
}: AIDirectorPanelProps) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.02]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Clapperboard className="h-4 w-4 text-primary" />
          AI Director — review your plan
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground/60 hover:text-foreground"
          aria-label="Close director"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Quality read-out */}
        <div className="flex flex-wrap gap-2">
          <QualityChip label="Character" value={quality.character.label} tone={quality.character.tone} />
          <QualityChip label="Prompt" value={quality.prompt.label} tone={quality.prompt.tone} />
          <QualityChip label="Model" value={quality.model.label} tone={quality.model.tone} />
          <QualityChip label="Social" value={quality.social.label} tone={quality.social.tone} />
          <QualityChip label="Cost" value={quality.costLabel} />
          <QualityChip label="Time" value={quality.timeLabel} />
        </div>

        {/* Scene cards */}
        <div className="space-y-2.5">
          {scenes.map((s) => (
            <div key={s.index} className="rounded-lg border border-border/40 bg-background px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {s.index + 1}
                  </span>
                  {s.title}
                  {s.camera && (
                    <span className="font-normal text-muted-foreground/60">· {s.camera}</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={s.durationSec}
                    onChange={(e) =>
                      onSceneChange(s.index, {
                        durationSec: Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 3)),
                      })
                    }
                    className="w-12 rounded border border-border/40 bg-background px-1.5 py-0.5 text-right text-[11px]"
                  />
                  <span>s</span>
                </div>
              </div>

              <textarea
                value={s.prompt}
                onChange={(e) => onSceneChange(s.index, { prompt: e.target.value })}
                rows={2}
                className="w-full resize-none rounded-md border border-border/30 bg-muted/10 px-2.5 py-1.5 text-xs text-foreground focus:border-primary/40 focus:outline-none"
              />

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {s.assets.map((a, i) => (
                  <span
                    key={`${a.kind}-${a.label}-${i}`}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ASSET_TONE[a.kind]}`}
                  >
                    @{a.label}
                  </span>
                ))}
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
                  {s.recommendedModel}
                </span>
              </div>

              {s.notes && s.notes.length > 0 && (
                <p className="mt-1.5 text-[10px] text-muted-foreground/60">{s.notes.join(" · ")}</p>
              )}
            </div>
          ))}
        </div>

        {/* Direction actions */}
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAction(a.id)}
              className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <Sparkles className="h-3 w-3" />
              {a.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground/50">
          Your scene edits are sent when you press{" "}
          <span className="font-medium text-foreground/70">Generate now</span>.
        </p>

        {/* Generate */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Generate now
        </button>
      </div>
    </div>
  );
}
