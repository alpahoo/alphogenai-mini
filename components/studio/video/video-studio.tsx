"use client";

import { Clapperboard, FolderClosed, LayoutGrid, Moon, Sparkles, Sun, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { modelsFor } from "@/lib/studio/catalog";
import { useStudioDark } from "@/lib/studio/theme";
import { videoRuns } from "@/lib/studio/video-screen";
import type { VideoExample } from "@/lib/studio/video-examples";
import { useStudio } from "../use-studio";
import { Examples } from "./examples";
import { Segmented } from "./segmented";
import { VideoDetail } from "./video-detail";
import { VideoForm } from "./video-form";
import { HistorySkeleton, VideoHistory } from "./video-history";

type View = "examples" | "history";

/**
 * The Studio Video screen: the shot plan on the left, and on the right either the administrator's own videos or the
 * example gallery. On a phone the two stack and the page scrolls as one.
 *
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/video-studio.tsx. Differences: it runs on the Studio's own state (`useStudio`): the same
 * admin check, H3 gate, reservation, idempotent admission, private history and signed links as the main Studio.
 * Sign-in dialogs, credits and the community gallery are not carried. See ./LICENSE-parallax.txt.
 */
export function VideoStudio() {
  const s = useStudio();
  const [dark, toggleTheme] = useStudioDark();
  const [chosen, setChosen] = useState<View | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const galleryRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const runs = videoRuns(s.history);

  // This screen is for video: a run or a link that switched the shared state to an image model puts it back.
  const { selectModel } = s;
  useEffect(() => {
    if (s.model.kind !== "video") { const first = modelsFor("video")[0]; if (first) selectModel(first.slug); }
  }, [s.model.kind, selectModel]);

  // A link with ?run= opens that generation's details once the shared state has started loading it.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("run")) setDetailOpen(true); }, []);

  // A new run (this tab just submitted one) goes to the front of the gallery.
  const currentId = s.current?.id;
  const currentStatus = s.current?.status;
  useEffect(() => {
    if (currentId && currentStatus === "queued") {
      setChosen("history");
      if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentId, currentStatus]);

  const view: View = chosen ?? ((runs && runs.length > 0) || s.busy === "submitting" ? "history" : "examples");
  const closeDetail = useCallback(() => setDetailOpen(false), []);
  const open = (id: string) => { void s.openRun(id); setDetailOpen(true); };

  function applyExample(example: VideoExample) {
    s.setValue("prompt", example.prompt);
    const box = formRef.current?.querySelector("textarea");
    box?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    box?.focus({ preventScroll: true });
  }

  return (
    <div className={cn(dark && "dark", "h-full")}>
      <div className="studio-root relative flex h-full min-w-0 flex-col overflow-clip bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-md shadow-primary/30"><Clapperboard className="h-4 w-4" /></span>
            <div className="min-w-0 leading-tight">
              <h1 className="text-sm font-semibold tracking-tight">Studio · Video</h1>
              <p className="truncate text-[11px] text-muted-foreground">{s.model.title} · Private admin</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex",
              s.readiness.ready ? "border-emerald-500/30 text-emerald-400" : "border-border/60 text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", s.readiness.ready ? "bg-emerald-400" : "bg-muted-foreground/60")} />
              {s.readiness.ready ? "GPU authorized" : "GPU locked"}
            </span>
            <Link href="/admin/studio" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
              <Sparkles className="h-4 w-4" />Full Studio
            </Link>
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
            <button type="button" aria-label="Dismiss" onClick={() => { s.setError(""); s.setNotice(""); }} className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="scroll-smooth flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div ref={formRef} className="shrink-0 border-border/50 lg:w-[400px] lg:overflow-y-auto lg:border-r">
            <VideoForm s={s} />
          </div>
          <section ref={galleryRef} aria-label="Gallery" className="flex min-w-0 flex-1 flex-col lg:min-h-0">
            <div className="flex h-14 shrink-0 items-center px-4">
              <Segmented label="Gallery" value={view} onChange={v => setChosen(v as View)}
                items={[{ value: "examples", label: "Examples", icon: LayoutGrid }, { value: "history", label: "History", icon: FolderClosed }]} />
            </div>
            <div className="min-h-0 flex-1 px-4 pb-8 lg:overflow-y-auto">
              {view === "examples" ? (
                <Examples onUse={applyExample} />
              ) : runs === null ? (
                <HistorySkeleton />
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
                  <p className="text-lg font-semibold tracking-tight">Your videos will appear here</p>
                  <p className="max-w-[360px] text-sm leading-5 text-muted-foreground">{s.historyError || "Write a prompt on the left and press Generate to make your first clip. Every result stays private."}</p>
                  <button type="button" onClick={() => setChosen("examples")} className="inline-flex min-h-9 items-center rounded-xl border border-border/60 px-3 text-xs hover:bg-muted/50">Browse examples</button>
                </div>
              ) : (
                <VideoHistory s={s} onOpen={open} />
              )}
            </div>
          </section>
        </div>

        <VideoDetail s={s} open={detailOpen} onClose={closeDetail} />
      </div>
    </div>
  );
}
