"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isActive } from "@/lib/studio/status";
import { ResultStage } from "../result-stage";
import type { StudioState } from "../use-studio";

/**
 * The details of one generation in a dialog: its private player, Corrected and Original downloads, settings reuse and
 * deletion.
 *
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/detail.tsx. Differences: the body is the Studio's own result stage (private signed links,
 * Corrected/Original/Compare, finance status), Parallax's publish and favourite actions are not carried (this is a
 * private admin tool), and the dialog sits inside the Studio frame so it keeps the Studio theme. See ./LICENSE-parallax.txt.
 */
export function VideoDetail({ s, open, onClose }: { s: StudioState; open: boolean; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const run = s.current;
  const canDelete = !!run && run.status !== "loading" && !isActive(run.status);

  useEffect(() => { setConfirming(false); }, [run?.id, open]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); before?.focus?.(); };
  }, [open, onClose]);
  // A new "Reuse settings" / "New seed" loads the form: the dialog has done its job. Reacting to the action counter (not
  // to the notice text, which lingers) keeps details openable afterwards.
  const seenReuses = useRef(s.reuses);
  useEffect(() => {
    if (s.reuses === seenReuses.current) return;
    seenReuses.current = s.reuses;
    if (open) onClose();
  }, [open, s.reuses, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Video details">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[min(92vh,860px)] w-full max-w-3xl flex-col overflow-clip rounded-t-3xl border border-border/60 bg-background text-foreground shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-tight">Video details</h2>
          <div className="flex items-center gap-1.5">
            {canDelete && !confirming && (
              <button type="button" onClick={() => setConfirming(true)} aria-label="Delete this generation"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />Delete
              </button>
            )}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {confirming && run && (
          <div role="alertdialog" aria-label="Confirm deletion" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-red-500/30 bg-red-500/[0.06] px-4 py-2.5 text-xs">
            <p className="min-w-0 flex-1 leading-snug">Delete this generation and its files? This cannot be undone.{run.finance_status === "awaiting_reconciliation" ? " Billing is not reconciled yet; the reservation record is kept." : ""}</p>
            <div className="flex gap-2">
              <button type="button" disabled={deleting} onClick={async () => { setDeleting(true); const ok = await s.removeRun(run.id); setDeleting(false); if (ok) onClose(); else setConfirming(false); }}
                className="min-h-9 rounded-lg bg-red-500/90 px-3 text-white hover:bg-red-500 disabled:opacity-60">{deleting ? "Deleting…" : "Delete"}</button>
              <button type="button" disabled={deleting} onClick={() => setConfirming(false)} className="min-h-9 rounded-lg border border-border/60 px-3 text-muted-foreground hover:bg-muted/50">Keep it</button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1"><ResultStage s={s} /></div>
      </div>
    </div>
  );
}
