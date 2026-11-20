"use client";

import { useEffect, useRef } from "react";
import { Check, History, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/lib/studio/agent/history";
import type { PatchError, Proposal } from "@/lib/studio/agent/patch";

/** Values longer than this are shown as readable blocks (a full Qwen prompt), not inline. */
export const LONG_VALUE = 120;

/** A proposed settings change: what changes, why, and the resulting workflow. Accept fills the form only. */
export function ProposalCard({ proposal, decisionError, onAccept, onReject }: {
  proposal: Proposal; decisionError?: string; onAccept: () => void; onReject: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  // A new proposal is brought into view inside the Create column (it sits below the settings).
  useEffect(() => { card.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [proposal.id]);
  return (
    <section ref={card} aria-label="Assistant proposal" className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.05] p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" />Proposed settings</p>
      {proposal.rationale && <p className="mt-1 break-words text-xs text-muted-foreground">{proposal.rationale}</p>}
      <ul className="mt-3 space-y-2 text-xs">
        {proposal.changes.map(c => (c.from.length > LONG_VALUE || c.to.length > LONG_VALUE) ? (
          <li key={c.key} className="min-w-0 space-y-1">
            <p className="text-muted-foreground">{c.label}</p>
            {c.from && <p className="line-clamp-2 break-words text-muted-foreground/70 line-through" title="Current value">{c.from}</p>}
            <p data-long-value className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border/50 bg-background/60 p-2.5 font-medium leading-relaxed text-foreground">{c.to || "—"}</p>
          </li>
        ) : (
          <li key={c.key} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-muted-foreground">{c.label}:</span>
            <span className="min-w-0 break-words text-muted-foreground/70 line-through">{c.from || "—"}</span>
            <span aria-hidden>→</span>
            <span className="min-w-0 break-words font-medium text-foreground">{c.to || "—"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Workflow {proposal.preview.variant}{proposal.preview.output ? ` · ${proposal.preview.output}` : ""}. Applying updates the form only; nothing is generated
        and no GPU run is authorized. You can still edit every value afterwards.
      </p>
      {decisionError && <p role="alert" className="mt-2 text-xs text-red-400">{decisionError}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onAccept}
          className="flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110">
          <Check className="h-3.5 w-3.5" />Apply to settings
        </button>
        <button type="button" onClick={onReject}
          className="flex min-w-[6rem] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />Reject
        </button>
      </div>
    </section>
  );
}

/** Shown after Apply: the form changed, the admin reviews it; Generate keeps its own checks. */
export function AppliedNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className="flex items-start justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-xs text-foreground">
      <p className="min-w-0 break-words">
        Settings updated from the proposal. Review them above (you can still edit any value). The run itself still needs GPU authorization.
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/** Why a proposal was refused (unknown or locked parameter, bounds, no workflow…). */
export function ProposalErrors({ errors }: { errors: PatchError[] }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-3 text-xs text-red-400">
      <p className="font-medium">Proposal refused</p>
      <ul className="mt-1 list-disc pl-4">{errors.map((e, i) => <li key={`${e.code}-${e.key ?? i}`}>{e.message}</li>)}</ul>
    </div>
  );
}

/** Local history of accepted and rejected proposals (this browser only). */
export function AssistantHistory({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return null;
  return (
    <details className="group rounded-2xl border border-border/60 text-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-2"><History className="h-3.5 w-3.5" />Assistant history</span>
        <span>{entries.length}</span>
      </summary>
      <ul className="space-y-2 border-t border-border/50 px-4 py-3">
        {entries.map(e => (
          <li key={e.id} className="space-y-0.5">
            <p className="flex items-center gap-2">
              <span className={cn("rounded-full px-1.5 py-px text-[10px] font-medium",
                e.decision === "accepted" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground")}>
                {e.decision === "accepted" ? "Applied" : "Rejected"}
              </span>
              <time className="text-muted-foreground/70" dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
            </p>
            <p className="break-words text-muted-foreground">{e.changes.map(c => `${c.label}: ${c.from || "—"} → ${c.to || "—"}`).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
