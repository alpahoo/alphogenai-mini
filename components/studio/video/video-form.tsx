"use client";

import { Clapperboard, ExternalLink, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { optionSupported, outputSize, paramsByTier, referenceReachable, referenceSupported } from "@/lib/studio/manifest";
import { videoFormatParams } from "@/lib/studio/video-screen";
import { generationPreview } from "@/lib/studio/preview";
import { AspectPicker } from "../aspect-picker";
import { GenerateBlockers } from "../generate-blockers";
import { CostSummary, GenerationPreviewCard } from "../generation-preview";
import { ParamControl } from "../param-control";
import { ReferenceDrop } from "../reference-drop";
import { ReferenceLibrary } from "../reference-library";
import type { StudioState } from "../use-studio";

/**
 * The Video form: the model, the prompt, the start frame and the shot settings, then Generate.
 *
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/video-form.tsx (model card, prompt card, start-frame slot, option rows, generate bar).
 * Differences: the only model is the admin H3 pilot, the settings come from its manifest, the start frame is a private
 * library image or a one-off upload, and Generate shows the real GPU reservation and the gate's blockers instead of
 * Parallax's credit price. Nothing is sent until Generate is pressed. See ./LICENSE-parallax.txt.
 */
export function VideoForm({ s }: { s: StudioState }) {
  const { model, manifest, values } = s;
  const prompt = manifest?.params.find(p => p.key === "prompt");
  const promptValue = String(values.prompt ?? "");
  const maxLen = prompt?.maxLength ?? 2000;
  const ref = manifest?.studio?.reference;
  const refNow = manifest ? referenceSupported(manifest, values) : false;
  const refOk = manifest ? referenceReachable(manifest, values) : false;
  const generating = s.busy === "submitting";
  const preview = manifest && model.availability === "available" ? generationPreview(model, manifest, values, s.reference) : null;

  return (
    <form aria-label="Shot plan" className="flex min-h-0 min-w-0 flex-col" onSubmit={e => { e.preventDefault(); void s.generate(); }}>
      <div className="min-w-0 space-y-5 px-4 pb-5 pt-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Clapperboard className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-medium">{model.title}
              {model.requiresValidation && !s.readiness.licence_confirmed && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-500">Validation pending</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{model.tagline}</span>
          </span>
        </div>

        {model.availability !== "available" || !manifest ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm leading-relaxed">
            <p className="font-medium">{model.title} is not runnable yet</p>
            <p className="mt-1 text-muted-foreground">{model.pendingReason}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="video-prompt" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Prompt</label>
                <span className={cn("font-mono text-[11px] tabular-nums", promptValue.length > maxLen ? "text-red-400" : "text-muted-foreground/70")}>{promptValue.length}/{maxLen}</span>
              </div>
              <textarea id="video-prompt" value={promptValue} rows={Math.min(10, Math.max(4, Math.ceil(promptValue.length / 44)))} maxLength={maxLen + 200}
                onChange={e => s.setValue("prompt", e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void s.generate(); } }}
                placeholder="Describe the shot: who, where, how the camera moves"
                className="block w-full min-w-0 resize-y rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
              {s.errors.prompt && promptValue.length > 0 && <p className="text-xs text-red-400">{s.errors.prompt}</p>}
            </div>

            {ref && (
              <div className="space-y-2">
                <ReferenceDrop label={ref.label} accept={ref.accept} reference={s.reference} uploading={s.busy === "uploading"}
                  supported={refOk || !!s.reference} unsupportedReason="Not available with the current settings"
                  note={refOk && !refNow && !s.reference ? "Adding a first frame switches quality to Turbo" : undefined}
                  onFile={f => void s.uploadReference(f)} onClear={s.clearReference} />
                <ReferenceLibrary s={s} label={ref.label} enabled={refOk || !!s.reference} />
              </div>
            )}

            {paramsByTier(manifest, "simple").map(p => (
              p.key === "aspect" && p.options ? (
                <div key={p.key} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{p.label}</p>
                  <AspectPicker options={p.options} value={String(values[p.key] ?? "")} onChange={v => s.setValue(p.key, v)} labels={p.optionLabels} sizes={manifest.resolutions} />
                  <p className="text-xs text-muted-foreground/80">{p.optionLabels?.[String(values[p.key])]} · {outputSize(manifest, values)?.join(" × ")} px</p>
                  {s.errors[p.key] && <p className="text-xs text-destructive">{s.errors[p.key]}</p>}
                </div>
              ) : (
                <ParamControl key={p.key} param={p} value={values[p.key]} error={s.errors[p.key]} onChange={v => s.setValue(p.key, v)}
                  isOptionSupported={o => optionSupported(manifest, values, !!s.reference, p.key, o)} />
              )
            ))}

            {/* The output format is part of this screen: H3 480p, or 704p (Turbo, up to 5 s, portrait or landscape). */}
            {videoFormatParams(manifest).map(p => (
              <ParamControl key={p.key} param={p} value={values[p.key]} error={s.errors[p.key]} onChange={v => s.setValue(p.key, v)}
                isOptionSupported={o => optionSupported(manifest, values, !!s.reference, p.key, o)} />
            ))}

            <Link href={`/admin/studio?model=${encodeURIComponent(model.slug)}`} onClick={s.handOff} className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3 text-sm text-muted-foreground transition hover:bg-muted/30 hover:text-foreground">
              <span>More settings, presets and the assistant</span><ExternalLink className="h-4 w-4" aria-hidden />
            </Link>

            {preview && <GenerationPreviewCard preview={preview} />}
          </>
        )}
      </div>

      <div className="sticky bottom-0 min-w-0 border-t border-border/50 bg-background/90 px-4 py-4 backdrop-blur">
        {model.availability === "available" && (
          <div className="mb-3 space-y-2">
            <CostSummary cost={s.readiness.cost} loaded={s.readiness.loaded} />
            {s.readiness.allowance && (
              <p className="text-right text-xs text-muted-foreground">
                Authorization: {s.readiness.allowance.remaining_runs} run{s.readiness.allowance.remaining_runs === 1 ? "" : "s"} · ${s.readiness.allowance.available_usd.toFixed(2)} unreserved
              </p>
            )}
          </div>
        )}
        <button type="submit" disabled={!s.canGenerate}
          className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Reserving…" : "Generate"}
        </button>
        {s.blockerList.length > 0 && s.busy === "idle" && <GenerateBlockers blockers={s.blockerList} />}
        {model.availability === "available" && s.readiness.cost?.estimate && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground/70">{s.readiness.cost.estimate.basis} Reservations are application provisions, not Modal billing limits.</p>
        )}
      </div>
    </form>
  );
}
