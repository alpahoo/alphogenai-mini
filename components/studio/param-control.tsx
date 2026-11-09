"use client";

import { Dices, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { optionLabel, randomSeed, type ManifestParam } from "@/lib/studio/manifest";

interface Props {
  param: ManifestParam;
  value: string | number | undefined;
  error?: string;
  onChange: (value: string | number) => void;
  isOptionSupported?: (option: string) => boolean;
  disabled?: boolean;
}

export function FieldShell({ label, help, error, htmlFor, aside, children }: { label: string; help?: string; error?: string; htmlFor?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</label>
        {aside}
      </div>
      {children}
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : help ? <p className="text-xs leading-relaxed text-muted-foreground/80">{help}</p> : null}
    </div>
  );
}

export function Segmented({ options, value, onChange, labelFor, supported, disabled, name }: {
  options: readonly string[]; value: string; onChange: (v: string) => void; labelFor: (o: string) => string;
  supported?: (o: string) => boolean; disabled?: boolean; name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
      style={{ gridTemplateColumns: options.length <= 3 ? `repeat(${options.length}, minmax(0, 1fr))` : "repeat(auto-fit, minmax(6.5rem, 1fr))" }}>
      {options.map(option => {
        const ok = supported ? supported(option) : true;
        const active = value === option;
        return (
          <button key={option} type="button" role="radio" aria-checked={active} disabled={disabled || !ok}
            title={ok ? undefined : "No validated workflow for this combination"}
            onClick={() => onChange(option)}
            className={cn("truncate rounded-lg px-2.5 py-1.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              !ok && "cursor-not-allowed line-through decoration-muted-foreground/40 opacity-40")}>
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
}

export function ParamControl({ param, value, error, onChange, isOptionSupported, disabled }: Props) {
  const id = `param-${param.key}`;
  if (param.widget === "select" && param.options) {
    return (
      <FieldShell label={param.label} help={param.help} error={error}>
        <Segmented name={param.label} options={param.options} value={String(value ?? "")} onChange={onChange}
          labelFor={o => optionLabel(param, o)} supported={isOptionSupported} disabled={disabled} />
      </FieldShell>
    );
  }
  if (param.widget === "text") {
    const text = String(value ?? "");
    const max = param.maxLength ?? 2000;
    return (
      <FieldShell label={param.label} help={param.help} error={error} htmlFor={id}
        aside={<span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">{text.length}/{max}</span>}>
        <textarea id={id} rows={3} value={text} disabled={disabled} maxLength={max + 100}
          onChange={e => onChange(e.target.value)}
          className="block w-full resize-y rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
      </FieldShell>
    );
  }
  if (param.widget === "number" && param.key === "seed") {
    const locked = value !== undefined && value !== "";
    return (
      <FieldShell label={param.label} help={param.help} error={error} htmlFor={id}
        aside={<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">{locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}{locked ? "Locked" : "Random each run"}</span>}>
        <div className="flex gap-2">
          <input id={id} inputMode="numeric" disabled={disabled} value={value ?? ""} placeholder="Random"
            onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); onChange(v === "" ? "" : Number(v)); }}
            className="h-10 min-w-0 flex-1 rounded-xl border border-border/60 bg-background/60 px-3 font-mono text-sm tabular-nums outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
          <button type="button" disabled={disabled} onClick={() => onChange(randomSeed())} aria-label="Pick a random seed and lock it"
            className="grid h-10 w-10 place-items-center rounded-xl border border-border/60 text-muted-foreground transition hover:text-foreground hover:bg-muted/60"><Dices className="h-4 w-4" /></button>
          {locked && <button type="button" disabled={disabled} onClick={() => onChange("")} aria-label="Unlock seed (random each run)"
            className="grid h-10 w-10 place-items-center rounded-xl border border-border/60 text-muted-foreground transition hover:text-foreground hover:bg-muted/60"><Unlock className="h-4 w-4" /></button>}
        </div>
      </FieldShell>
    );
  }
  if (param.widget === "number") {
    const min = param.min ?? 0, max = param.max ?? 100, step = param.step ?? 1;
    const n = value === "" || value === undefined ? Number(param.default ?? min) : Number(value);
    const slider = (max - min) / step <= 100;
    const decimals = String(step).split(".")[1]?.length ?? 0;
    return (
      <FieldShell label={param.label} help={param.help} error={error} htmlFor={id}
        aside={<span className="font-mono text-sm tabular-nums text-foreground">{n.toFixed(decimals)}{param.unit ?? ""}</span>}>
        {slider ? (
          <input id={id} type="range" min={min} max={max} step={step} value={n} disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}
            className="studio-range w-full" aria-valuetext={`${n}${param.unit ?? ""}`} />
        ) : (
          <input id={id} type="number" min={min} max={max} step={step} value={value ?? ""} disabled={disabled}
            onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-10 w-full rounded-xl border border-border/60 bg-background/60 px-3 font-mono text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
        )}
        {slider && <div className="flex justify-between font-mono text-[10px] text-muted-foreground/60"><span>{min}{param.unit}</span><span>{max}{param.unit}</span></div>}
      </FieldShell>
    );
  }
  // Unknown widget types are shown read-only rather than silently ignored.
  return <FieldShell label={param.label} help="This control type is not supported by the Studio yet."><p className="text-sm text-muted-foreground">{String(value ?? "—")}</p></FieldShell>;
}
