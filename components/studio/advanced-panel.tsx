"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, ChevronDown, Lock, Trash2, X } from "lucide-react";
import { h3Frames, lockedSettings } from "@/lib/studio/catalog";
import { optionSupported, paramsByTier } from "@/lib/studio/manifest";
import { deletePreset, listPresets, savePreset, type Preset } from "@/lib/studio/presets";
import { ParamControl } from "./param-control";
import type { StudioState } from "./use-studio";

export function AdvancedPanel({ s, onClose }: { s: StudioState; onClose?: () => void }) {
  const { model, manifest, values } = s;
  const [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState("");
  const [techOpen, setTechOpen] = useState(false);
  useEffect(() => { setPresets(listPresets(model.slug)); }, [model.slug]);

  if (!manifest) return <div className="p-5 text-sm text-muted-foreground">No adjustable settings for this model yet.</div>;
  const locked = lockedSettings(model, s.variant);
  const resolution = manifest.resolutions?.[String(values.aspect)];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Advanced</h2>
          <p className="text-xs text-muted-foreground">Only settings declared by the workflow manifest</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close advanced settings" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>
      <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
        <section className="space-y-5">
          {paramsByTier(manifest, "advanced").map(p => (
            <ParamControl key={p.key} param={p} value={values[p.key]} error={s.errors[p.key]} onChange={v => s.setValue(p.key, v)}
              isOptionSupported={o => optionSupported(manifest, values, !!s.reference, p.key, o)} />
          ))}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Presets</h3>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const p = savePreset(model.slug, name, values); if (p) { setPresets(listPresets(model.slug)); setName(""); s.setNotice(`Preset “${p.name}” saved in this browser.`); } else s.setError("Presets cannot be saved in this browser."); }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name current settings" maxLength={60}
              className="h-9 min-w-0 flex-1 rounded-xl border border-border/60 bg-background/60 px-3 text-sm outline-none focus:border-primary/60" />
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><BookmarkPlus className="h-4 w-4" />Save</button>
          </form>
          {presets.length === 0 ? <p className="text-xs text-muted-foreground/80">No presets yet. Presets store settings (not the prompt) in this browser only.</p> : (
            <ul className="space-y-1">
              {presets.map(p => (
                <li key={p.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/40">
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { s.applyValues(p.values); s.setNotice(`Preset “${p.name}” applied.`); }}>
                    {p.name}<span className="ml-2 text-xs text-muted-foreground">{Object.entries(p.values).filter(([k]) => k !== "seed").map(([, v]) => v).join(" · ")}</span>
                  </button>
                  <button type="button" aria-label={`Delete preset ${p.name}`} onClick={() => { deletePreset(p.id); setPresets(listPresets(model.slug)); }}
                    className="opacity-0 transition group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><Lock className="h-3 w-3" />Locked by the validated workflow</h3>
          {locked.length === 0 ? <p className="text-xs text-red-400">No validated workflow for this combination.</p> : (
            <dl className="divide-y divide-border/40 rounded-2xl border border-border/50">
              {locked.map((l, i) => (
                <div key={`${l.label}-${i}`} className="flex items-center justify-between gap-4 px-3.5 py-2 text-sm">
                  <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{l.label}</dt><dd className="min-w-0 truncate font-mono text-xs" title={l.value}>{l.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-muted-foreground/80">These values come from the exported lab graph. The Studio never overrides them.</p>
        </section>

        <section>
          <button type="button" onClick={() => setTechOpen(o => !o)} aria-expanded={techOpen} className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground">
            Technical details<ChevronDown className={`h-3.5 w-3.5 transition ${techOpen ? "rotate-180" : ""}`} />
          </button>
          {techOpen && (
            <dl className="mt-3 space-y-1.5 font-mono text-xs">
              {[["Workflow", `${manifest.slug}@${manifest.version}`], ["Runtime", manifest.runtime], ["Variant", s.variant ?? "unsupported"],
                ["Resolution", resolution ? resolution.join(" × ") : "—"], ["Frames", manifest.params.some(p => p.derived === "frames_from_seconds") && values.seconds ? String(h3Frames(Number(values.seconds))) : "—"],
                ["Original kept", manifest.preserve_raw ? "yes" : "no"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
