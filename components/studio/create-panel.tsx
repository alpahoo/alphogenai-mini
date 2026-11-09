"use client";

import { Clapperboard, Image as ImageIcon, Loader2, SlidersHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { modelsFor, type OutputKind } from "@/lib/studio/catalog";
import { optionSupported, paramsByTier, referenceSupported } from "@/lib/studio/manifest";
import { ParamControl } from "./param-control";
import { ReferenceDrop } from "./reference-drop";
import { AspectPicker } from "./aspect-picker";
import type { StudioState } from "./use-studio";

export function CreatePanel({ s, onOpenAdvanced, advancedOpen }: { s: StudioState; onOpenAdvanced: () => void; advancedOpen: boolean }) {
  const { model, manifest, values } = s;
  const kind = model.kind as OutputKind;
  const prompt = manifest?.params.find(p => p.key === "prompt");
  const promptValue = String(values.prompt ?? "");
  const maxLen = prompt?.maxLength ?? 2000;
  const ref = manifest?.studio?.reference;
  const refOk = manifest ? referenceSupported(manifest, values) : false;
  const generating = s.busy === "submitting";
  const advancedCount = manifest ? paramsByTier(manifest, "advanced").length : 0;

  return (
    <form className="flex h-full flex-col" onSubmit={e => { e.preventDefault(); void s.generate(); }}>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-5">
        {/* Output type */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1" role="tablist" aria-label="Output type">
          {([["video", "Video", Clapperboard], ["image", "Image", ImageIcon]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k}
              onClick={() => { const first = modelsFor(k)[0]; if (first) s.selectModel(first.slug); }}
              className={cn("flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition",
                kind === k ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* Model */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Model</p>
          <div className="space-y-1.5">
            {modelsFor(kind).map(m => {
              const active = m.slug === model.slug;
              return (
                <button key={m.slug} type="button" onClick={() => s.selectModel(m.slug)} aria-pressed={active}
                  className={cn("flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
                    active ? "border-primary/50 bg-primary/[0.07] ring-1 ring-primary/30" : "border-border/60 hover:border-foreground/20 hover:bg-muted/30")}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", active ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground")}>
                    {m.kind === "video" ? <Clapperboard className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">{m.title}
                      {(m.availability === "pending" || (m.requiresValidation && !(active && s.readiness.licence_confirmed))) &&
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-500">Validation pending</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{m.tagline}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {model.availability !== "available" || !manifest ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm leading-relaxed">
            <p className="font-medium text-foreground">{model.title} is not runnable yet</p>
            <p className="mt-1 text-muted-foreground">{model.pendingReason}</p>
          </div>
        ) : (
          <>
            {/* Prompt */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="studio-prompt" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Prompt</label>
                <span className={cn("font-mono text-[11px] tabular-nums", promptValue.length > maxLen ? "text-red-400" : "text-muted-foreground/70")}>{promptValue.length}/{maxLen}</span>
              </div>
              <textarea id="studio-prompt" value={promptValue} rows={4} maxLength={maxLen + 200}
                onChange={e => s.setValue("prompt", e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void s.generate(); } }}
                placeholder={prompt?.help ?? "Describe what you want to create…"}
                className="block w-full resize-y rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
              {s.errors.prompt && promptValue.length > 0 && <p className="text-xs text-red-400">{s.errors.prompt}</p>}
            </div>

            {ref && (
              <ReferenceDrop label={ref.label} accept={ref.accept} reference={s.reference} uploading={s.busy === "uploading"}
                supported={refOk || !!s.reference} unsupportedReason="Not available with the current settings"
                onFile={f => void s.uploadReference(f)} onClear={s.clearReference} />
            )}

            {paramsByTier(manifest, "simple").map(p => (
              p.key === "aspect" && p.options ? (
                <div key={p.key} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{p.label}</p>
                  <AspectPicker options={p.options} value={String(values[p.key] ?? "")} onChange={v => s.setValue(p.key, v)}
                    labels={p.optionLabels} sizes={manifest.resolutions} />
                  <p className="text-xs text-muted-foreground/80">{p.optionLabels?.[String(values[p.key])]} · {manifest.resolutions?.[String(values[p.key])]?.join(" × ")} px</p>
                </div>
              ) : (
                <ParamControl key={p.key} param={p} value={values[p.key]} error={s.errors[p.key]} onChange={v => s.setValue(p.key, v)}
                  isOptionSupported={o => optionSupported(manifest, values, !!s.reference, p.key, o)} />
              )
            ))}

            <button type="button" onClick={onOpenAdvanced} aria-expanded={advancedOpen}
              className={cn("flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition",
                advancedOpen ? "border-primary/40 bg-primary/[0.06] text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")}>
              <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Advanced settings</span>
              <span className="text-xs">{advancedCount} settings · presets</span>
            </button>
          </>
        )}
      </div>

      {/* Sticky generate bar */}
      <div className="border-t border-border/50 bg-background/80 px-5 py-4 backdrop-blur">
        {model.availability === "available" && (
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Reserves <span className="font-medium text-foreground">${model.reservationUsd?.toFixed(2)}</span> per run</span>
            {s.readiness.allowance && <span>{s.readiness.allowance.remaining_runs} run{s.readiness.allowance.remaining_runs === 1 ? "" : "s"} · ${s.readiness.allowance.available_usd.toFixed(2)} left</span>}
          </div>
        )}
        <button type="submit" disabled={!s.canGenerate}
          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Reserving…" : "Generate"}
          <kbd className="ml-1 hidden rounded-md border border-white/20 px-1.5 py-0.5 font-mono text-[10px] font-normal opacity-70 sm:inline">Ctrl ↵</kbd>
        </button>
        {s.blockers.length > 0 && s.busy === "idle" && <p className="mt-2 text-center text-xs text-muted-foreground">{s.blockers[0]}</p>}
        {model.costNote && model.availability === "available" && <p className="mt-1 text-center text-[11px] text-muted-foreground/70">{model.costNote}</p>}
      </div>
    </form>
  );
}
