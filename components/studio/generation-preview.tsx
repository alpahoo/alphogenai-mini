"use client";

import { ChevronDown, Cpu, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationPreview } from "@/lib/studio/preview";
import type { CostInfo } from "./types";

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Three separate facts: application reservation, configured GPU, labelled cost estimate. */
export function CostSummary({ cost, loaded }: { cost: CostInfo | null | undefined; loaded: boolean }) {
  const reservation = cost?.reservation_usd;
  const est = cost?.estimate;
  return (
    <dl className="grid grid-cols-3 gap-2 text-[11px] leading-tight">
      <div className="rounded-xl border border-border/50 px-2.5 py-2" title="Application provision held by the server gate for one run. It is not an invoice and not a Modal billing limit.">
        <dt className="flex items-center gap-1 text-muted-foreground"><Wallet className="h-3 w-3" />Reservation</dt>
        <dd className="mt-1 font-medium text-foreground">{reservation != null ? `${usd(reservation)} / run` : loaded ? "Unavailable" : "…"}</dd>
      </div>
      <div className="rounded-xl border border-border/50 px-2.5 py-2"
        title={cost?.gpu_source === "server_config" ? "From the server configuration (mirror of the Modal deployment)." : cost?.gpu_source === "executor_code" ? "Fixed in the executor definition." : "No server configuration confirms the GPU."}>
        <dt className="flex items-center gap-1 text-muted-foreground"><Cpu className="h-3 w-3" />GPU</dt>
        <dd className={cn("mt-1 font-medium", cost?.gpu ? "text-foreground" : "text-amber-500")}>{cost?.gpu ?? (loaded ? "Not confirmed" : "…")}</dd>
      </div>
      <div className="rounded-xl border border-border/50 px-2.5 py-2" title={est?.basis ?? "No estimate without a confirmed GPU."}>
        <dt className="flex items-center gap-1 text-muted-foreground"><Receipt className="h-3 w-3" />{est?.measured ? "Measured" : "Estimate"}</dt>
        <dd className="mt-1 font-medium text-foreground">
          {est ? (est.low_usd === est.high_usd ? `≈ ${usd(est.low_usd)}` : `${usd(est.low_usd)}–${usd(est.high_usd)}`) : loaded ? "—" : "…"}
        </dd>
      </div>
    </dl>
  );
}

/** Collapsible review of what will be submitted: workflow, output, every parameter and what differs from defaults. */
export function GenerationPreviewCard({ preview }: { preview: GenerationPreview }) {
  const { changed, rows } = preview;
  return (
    <details className="group rounded-2xl border border-border/60 bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-muted-foreground hover:text-foreground">
        <span className="font-medium text-foreground">Review before generating</span>
        <span className="flex items-center gap-2 text-xs">
          {changed.length === 0 ? "Default settings" : `${changed.length} change${changed.length === 1 ? "" : "s"} from defaults`}
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 border-t border-border/50 px-4 py-3 text-xs">
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Workflow</dt>
          <dd className={cn("font-medium", preview.variant ? "text-foreground" : "text-red-400")}>{preview.variant ?? "No validated workflow for this combination"}</dd>
          {preview.output && <><dt className="text-muted-foreground">Output</dt><dd className="text-foreground">{preview.output}</dd></>}
          {preview.reference && <><dt className="text-muted-foreground">Reference</dt><dd className="truncate text-foreground">{preview.reference}</dd></>}
        </dl>
        {changed.length > 0 && (
          <div>
            <p className="mb-1 font-medium uppercase tracking-[0.08em] text-muted-foreground">Changes</p>
            <ul className="space-y-1">
              {changed.map(r => (
                <li key={r.key} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-muted-foreground">{r.label}:</span>
                  <span className="text-muted-foreground/70 line-through">{r.defaultValue ?? "—"}</span>
                  <span aria-hidden>→</span>
                  <span className="font-medium text-foreground">{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="mb-1 font-medium uppercase tracking-[0.08em] text-muted-foreground">Submitted settings</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            {rows.map(r => (
              <div key={r.key} className="contents">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className={cn("break-words", r.error ? "text-red-400" : r.changed ? "font-medium text-foreground" : "text-foreground/80")}>
                  {r.key === "prompt" && r.value.length > 160 ? `${r.value.slice(0, 160)}…` : r.value || "—"}{r.error ? ` · ${r.error}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {preview.locked.length > 0 && (
          <p className="text-muted-foreground/80">Fixed by the workflow: {preview.locked.map(l => `${l.label} ${l.value}`).join(" · ")}</p>
        )}
      </div>
    </details>
  );
}
