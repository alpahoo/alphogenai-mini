"use client";

import { useEffect, useState } from "react";
import { History, Moon, PanelRightClose, Sparkles, Sun, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdvancedPanel } from "./advanced-panel";
import { CreatePanel } from "./create-panel";
import { HistoryRail } from "./history-rail";
import { ResultStage } from "./result-stage";
import { useStudio } from "./use-studio";
import { useStudioDark } from "@/lib/studio/theme";

type MobileTab = "create" | "result" | "history";

export function Studio() {
  const s = useStudio();
  const [advanced, setAdvanced] = useState(false);
  const [tab, setTab] = useState<MobileTab>("create");
  const [dark, toggleTheme] = useStudioDark();

  // A new or reopened run brings the result into view on small screens.
  useEffect(() => { if (s.current) setTab("result"); }, [s.current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAdvanced(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void s.generate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  return (
    <div className={cn(dark && "dark", "h-full")}>
      <div className="studio-root relative flex h-full flex-col bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-md shadow-primary/30"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold tracking-tight">Studio</p>
              <p className="truncate text-[11px] text-muted-foreground">Create · {s.model.title} · Private admin</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex",
              s.readiness.ready ? "border-emerald-500/30 text-emerald-400" : "border-border/60 text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", s.readiness.ready ? "bg-emerald-400" : "bg-muted-foreground/60")} />
              {s.readiness.ready ? "GPU authorized" : "GPU locked"}
            </span>
            <button type="button" onClick={() => setAdvanced(a => !a)} aria-pressed={advanced}
              className={cn("hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition lg:inline-flex", advanced ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
              {advanced ? <PanelRightClose className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}Advanced
            </button>
            <button type="button" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {(s.error || s.notice) && (
          <div role={s.error ? "alert" : "status"} className={cn("flex items-start justify-between gap-3 border-b px-5 py-2.5 text-sm",
            s.error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-primary/20 bg-primary/[0.06] text-foreground")}>
            <span>{s.error || s.notice}</span>
            <button type="button" aria-label="Dismiss" onClick={() => { s.setError(""); s.setNotice(""); }} className="shrink-0 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Mobile / tablet tabs */}
        <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-border/50 p-2 lg:hidden" aria-label="Studio sections">
          {([["create", "Create", Wand2], ["result", "Result", Sparkles], ["history", "History", History]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k}
              className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm transition", tab === k ? "bg-muted text-foreground" : "text-muted-foreground")}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>

        <div className={cn("grid min-h-0 flex-1", advanced ? "lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)_340px]" : "lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]")}>
          <aside className={cn("min-h-0 border-border/50 lg:block lg:border-r", tab === "create" ? "block" : "hidden")}>
            <CreatePanel s={s} advancedOpen={advanced} onOpenAdvanced={() => setAdvanced(a => !a)} />
          </aside>
          <section className={cn("min-h-0 flex-col lg:flex", tab === "result" ? "flex" : "hidden")}>
            <div className="studio-stage min-h-0 flex-1"><ResultStage s={s} /></div>
            <div className="hidden lg:block"><HistoryRail s={s} /></div>
          </section>
          <section className={cn("min-h-0 lg:hidden", tab === "history" ? "block" : "hidden")}><HistoryRail s={s} layout="list" /></section>
          {advanced && <aside className="hidden min-h-0 border-l border-border/50 lg:block"><AdvancedPanel s={s} /></aside>}
        </div>

        {/* Advanced drawer below lg */}
        {advanced && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Advanced settings">
            <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAdvanced(false)} />
            <div className={cn(dark && "dark", "absolute inset-y-0 right-0 w-full max-w-sm")}>
              <div className="h-full border-l border-border/50 bg-background text-foreground shadow-2xl"><AdvancedPanel s={s} onClose={() => setAdvanced(false)} /></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
