"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EXAMPLE_CATEGORIES, examplesIn, type ExampleCategory, type ExampleShape, type VideoExample } from "@/lib/studio/video-examples";
import { Masonry } from "./masonry";

/**
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/examples.tsx. Differences: tiles are plain text on a category tint (Parallax's artwork is not
 * copied), and choosing one only fills the prompt. See ./LICENSE-parallax.txt.
 */
const SHAPE: Record<ExampleShape, string> = { wide: "aspect-[328/184]", photo: "aspect-[328/218]", tall: "aspect-[328/420]" };

const TINT: Record<ExampleCategory, string> = {
  nature: "from-emerald-500/20 to-sky-500/10",
  city: "from-fuchsia-500/20 to-indigo-500/10",
  people: "from-amber-500/20 to-rose-500/10",
  product: "from-slate-400/20 to-zinc-500/10",
  motion: "from-orange-500/20 to-red-500/10",
  stylised: "from-violet-500/20 to-teal-500/10",
};

function Tile({ example, onUse }: { example: VideoExample; onUse: (e: VideoExample) => void }) {
  return (
    <button type="button" onClick={() => onUse(example)} aria-label={`Use this prompt: ${example.prompt}`}
      className={cn("group relative flex w-full flex-col justify-end overflow-clip rounded-2xl border border-border/60 bg-gradient-to-br p-3 text-left transition hover:border-foreground/25",
        TINT[example.category], SHAPE[example.shape])}>
      <span className="mb-auto text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{example.category}</span>
      <span className="line-clamp-4 text-sm font-medium leading-5 text-foreground">{example.prompt}</span>
      <span className="mt-2 inline-flex h-7 items-center gap-1 self-start rounded-lg bg-background/70 px-2 text-xs font-medium text-foreground opacity-80 backdrop-blur-sm transition group-hover:opacity-100">
        Use this prompt <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

/** The example gallery: a heading, category tabs, and columns of starter prompts. */
export function Examples({ onUse }: { onUse: (example: VideoExample) => void }) {
  const [category, setCategory] = useState("all");
  const shown = examplesIn(category);
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-2 px-4 pb-4 pt-5 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">One idea, many shots</h2>
        <p className="max-w-[580px] text-sm leading-5 text-muted-foreground">
          Start from a sample prompt, add a first frame from your private library, and turn a still picture into a moving scene. Choosing an example only fills the form: nothing is generated until you press Generate.
        </p>
      </div>
      <div role="tablist" aria-label="Categories" className="mb-3 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {EXAMPLE_CATEGORIES.map(c => {
          const on = c.id === category;
          return (
            <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => setCategory(c.id)}
              className={cn("relative flex h-10 shrink-0 items-center px-2 text-sm font-medium transition", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {c.label}
              {on && <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 bg-foreground" />}
            </button>
          );
        })}
      </div>
      <Masonry label="Examples" items={shown.map(example => ({ key: example.id, node: <Tile example={example} onUse={onUse} /> }))} />
    </div>
  );
}
