"use client";

import { Sparkles } from "lucide-react";
import { builtinPresetsFor, type BuiltinPreset } from "@/lib/studio/builtin-presets";

/**
 * Built-in presets for the selected model, visible in the Create panel (no need to open Advanced).
 * Applying one fills settings the model really has and, only when the prompt is empty, a starting prompt.
 * It never generates and never authorizes anything.
 */
export function PresetPicker({ slug, onApply }: { slug: string; onApply: (preset: BuiltinPreset) => void }) {
  const presets = builtinPresetsFor(slug);
  if (!presets.length) return null;
  return (
    <div className="space-y-2" data-testid="builtin-presets">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />Presets</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button key={p.id} type="button" onClick={() => onApply(p)} title={p.hint} aria-label={`${p.label}: ${p.hint}`}
            className="min-h-10 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60 lg:min-h-8">
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground/80">Sets format, duration and quality where the model has them. You can still change everything.</p>
    </div>
  );
}
