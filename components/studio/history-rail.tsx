"use client";

import { useState } from "react";
import { Clapperboard, History, Image as ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { isActive } from "@/lib/studio/status";
import { modelForTemplateVersion } from "@/lib/studio/catalog";
import { PrivateImage } from "./image-result";
import { cn } from "@/lib/utils";
import { StatusPill } from "./result-stage";
import type { StudioState } from "./use-studio";

function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HistoryRail({ s, layout = "row" }: { s: StudioState; layout?: "row" | "list" }) {
  const items = s.history;
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <section aria-label="Generation history" className={cn(layout === "row" ? "border-t border-border/50" : "h-full overflow-y-auto")}>
      <div className="flex items-center justify-between px-5 pb-2 pt-3">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><History className="h-3.5 w-3.5" />History</h2>
        <button type="button" onClick={() => void s.refreshHistory()} aria-label="Refresh history" className="grid h-11 w-11 place-items-center lg:h-7 lg:w-7 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {items === null ? (
        <div className={cn("gap-3 px-5 pb-4", layout === "row" ? "flex" : "grid")}>
          {[0, 1, 2].map(i => <div key={i} className="h-[72px] w-56 shrink-0 animate-pulse rounded-2xl bg-muted/40" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-muted-foreground">{s.historyError || "No generations yet. Your private runs will appear here."}</p>
      ) : (
        <ul className={cn("gap-2 px-5 pb-4", layout === "row" ? "flex overflow-x-auto [scrollbar-width:thin]" : "grid grid-cols-[minmax(0,1fr)]")}>
          {items.map(run => {
            const active = s.current?.id === run.id;
            const p = run.params_effective ?? {};
            const isImage = modelForTemplateVersion(run.template_version).kind === "image";
            const thumb = isImage && run.status === "done" ? run.assets?.find(a => a.role === "raw") : undefined;
            return (
              <li key={run.id} className={cn("relative", layout === "row" ? "w-60 shrink-0" : "")}>
                {confirming === run.id ? (
                  <div role="alertdialog" aria-label="Confirm deletion" className="flex h-full min-h-[72px] flex-col justify-between gap-2 rounded-2xl border border-red-500/40 bg-red-500/[0.06] p-2.5 text-xs">
                    <p className="leading-snug text-foreground">Delete this generation and its files? This cannot be undone.{run.finance_status === "awaiting_reconciliation" ? " Billing is not reconciled yet: its record is erased, the budget is unchanged." : ""}</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={deleting === run.id} onClick={async () => { setDeleting(run.id); await s.removeRun(run.id); setDeleting(null); setConfirming(null); }}
                        className="min-h-10 flex-1 rounded-lg bg-red-500/90 px-2 text-white hover:bg-red-500 disabled:opacity-60 lg:min-h-8">{deleting === run.id ? "Deleting…" : "Delete"}</button>
                      <button type="button" disabled={deleting === run.id} onClick={() => setConfirming(null)} className="min-h-10 flex-1 rounded-lg border border-border/60 px-2 text-muted-foreground hover:bg-muted/50 lg:min-h-8">Cancel</button>
                    </div>
                  </div>
                ) : (<>
                  <button type="button" onClick={() => void s.openRun(run.id)} aria-current={active}
                    className={cn("flex w-full gap-3 rounded-2xl border p-2.5 pr-10 text-left transition",
                      active ? "border-primary/50 bg-primary/[0.07]" : "border-border/50 hover:border-foreground/20 hover:bg-muted/30")}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/60 text-muted-foreground">
                    {thumb ? <PrivateImage asset={thumb} s={s} alt="" className="h-12 w-12 object-cover" />
                      : isImage ? <ImageIcon className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="line-clamp-1 text-xs text-foreground">{String(p.prompt ?? "Untitled")}</span>
                    <span className="flex items-center gap-2"><StatusPill status={run.status} run={run} /></span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{[modelForTemplateVersion(run.template_version).title, p.aspect, p.seconds && `${p.seconds}s`, p.quality, when(run.created_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
                  {!isActive(run.status) && run.status !== "loading" && (
                    <button type="button" onClick={() => setConfirming(run.id)} aria-label="Delete this generation" title="Delete this generation"
                      className="absolute right-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground/70 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400/60 lg:h-8 lg:w-8">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
