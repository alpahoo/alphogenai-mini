"use client";

import { cn } from "@/lib/utils";

/** Aspect ratio tiles with a true-proportion preview. Pure presentation; values come from the manifest. */
export function AspectPicker({ options, value, onChange, labels, sizes }: {
  options: readonly string[]; value: string; onChange: (v: string) => void;
  labels?: Record<string, string>; sizes?: Record<string, readonly number[]>;
}) {
  return (
    <div role="radiogroup" aria-label="Format" className={cn("grid gap-1.5", options.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
      {options.map(option => {
        const [w, h] = option.split(":").map(Number);
        const scale = 22 / Math.max(w, h);
        const active = option === value;
        return (
          <button key={option} type="button" role="radio" aria-checked={active} onClick={() => onChange(option)}
            title={[labels?.[option], sizes?.[option]?.join(" × ")].filter(Boolean).join(" · ")}
            className={cn("flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary/50 bg-primary/[0.08] text-foreground" : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground")}>
            <span className="grid h-6 w-6 place-items-center">
              <span className={cn("rounded-[3px] border-[1.5px]", active ? "border-primary" : "border-current")} style={{ width: w * scale, height: h * scale }} />
            </span>
            <span className="font-mono tabular-nums">{option}</span>
          </button>
        );
      })}
    </div>
  );
}
