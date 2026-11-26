"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/segmented.tsx. Differences: the Studio's theme tokens replace Parallax's glass styling.
 * See ./LICENSE-parallax.txt.
 *
 * A row of two or three choices with one lit. `wide` is the boxed, full-width version; without it the segments
 * size to their words, as in the gallery header.
 */
export function Segmented({ label, items, value, onChange, wide }: {
  label: string;
  items: { value: string; label: string; icon: ComponentType<{ className?: string }> }[];
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className={cn("flex items-center gap-1", wide && "w-full rounded-2xl border border-border/60 bg-muted/40 p-1")}>
      {items.map(item => {
        const on = item.value === value;
        return (
          <button key={item.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(item.value)}
            className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium transition",
              wide && "min-w-0 flex-1",
              on ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
