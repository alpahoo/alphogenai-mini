"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReferenceImage } from "./types";

export function ReferenceDrop({ label, accept, reference, uploading, supported, unsupportedReason, onFile, onClear }: {
  label: string; accept: readonly string[]; reference: ReferenceImage | null; uploading: boolean;
  supported: boolean; unsupportedReason: string; onFile: (f: File) => void; onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (reference) {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
        <img src={reference.previewUrl} alt={`${label} preview`} className="h-40 w-full object-contain" />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs text-white">
          <span className="truncate"><span className="opacity-70">{label} · </span>{reference.name}</span>
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 backdrop-blur transition hover:bg-white/25" aria-label={`Remove ${label.toLowerCase()}`}>
            <X className="h-3 w-3" />Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" disabled={!supported || uploading}
      onClick={() => input.current?.click()}
      onDragOver={e => { e.preventDefault(); if (supported) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && supported) onFile(f); }}
      title={supported ? undefined : unsupportedReason}
      className={cn("flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5 text-left transition",
        over ? "border-primary bg-primary/10" : "border-border/70 hover:border-foreground/30 hover:bg-muted/30",
        !supported && "cursor-not-allowed opacity-50 hover:border-border/70 hover:bg-transparent")}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{uploading ? "Uploading privately…" : `Add ${label.toLowerCase()}`}</span>
        <span className="block truncate text-xs text-muted-foreground">{supported ? "Drop or browse · PNG, JPEG, WebP · 10 MB" : unsupportedReason}</span>
      </span>
      <input ref={input} type="file" hidden accept={accept.join(",")} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </button>
  );
}
