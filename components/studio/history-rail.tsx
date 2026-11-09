"use client";

import { Clapperboard, History, RefreshCw } from "lucide-react";
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
  return (
    <section aria-label="Generation history" className={cn(layout === "row" ? "border-t border-border/50" : "h-full overflow-y-auto")}>
      <div className="flex items-center justify-between px-5 pb-2 pt-3">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><History className="h-3.5 w-3.5" />History</h2>
        <button type="button" onClick={() => void s.refreshHistory()} aria-label="Refresh history" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {items === null ? (
        <div className={cn("gap-3 px-5 pb-4", layout === "row" ? "flex" : "grid")}>
          {[0, 1, 2].map(i => <div key={i} className="h-[72px] w-56 shrink-0 animate-pulse rounded-2xl bg-muted/40" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-muted-foreground">{s.historyError || "No generations yet. Your private runs will appear here."}</p>
      ) : (
        <ul className={cn("gap-2 px-5 pb-4", layout === "row" ? "flex overflow-x-auto [scrollbar-width:thin]" : "grid")}>
          {items.map(run => {
            const active = s.current?.id === run.id;
            const p = run.params_effective ?? {};
            return (
              <li key={run.id} className={layout === "row" ? "w-60 shrink-0" : ""}>
                <button type="button" onClick={() => void s.openRun(run.id)} aria-current={active}
                  className={cn("flex w-full gap-3 rounded-2xl border p-2.5 text-left transition",
                    active ? "border-primary/50 bg-primary/[0.07]" : "border-border/50 hover:border-foreground/20 hover:bg-muted/30")}>
                  <span className="grid h-12 w-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground"><Clapperboard className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="line-clamp-1 text-xs text-foreground">{String(p.prompt ?? "Untitled")}</span>
                    <span className="flex items-center gap-2"><StatusPill status={run.status} /></span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{[p.aspect, p.seconds && `${p.seconds}s`, p.quality, when(run.created_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
