import { statusView, type StatusView } from "./status";

/**
 * Lifecycle shown in the Studio, derived only from columns that really exist:
 * `status`, the dispatch outbox acknowledgement (`dispatched`), whether Modal confirmed a call (`executor_started`)
 * and `finance_status`. Nothing here is invented, and nothing here authorizes or triggers a run.
 */
export interface StageInput {
  status: string;
  dispatched?: boolean;
  executor_started?: boolean;
  finance_status?: string | null;
}

export function stageView(run: StageInput): StatusView {
  if (run.status === "queued") {
    return run.dispatched
      ? { label: "Sent to Modal", tone: "neutral", description: "The executor accepted the request and has not started the run yet." }
      : { label: "Reserved", tone: "neutral", description: "Budget reserved. The run has not been confirmed as sent to the executor yet." };
  }
  if (run.status === "running") {
    return { label: "Running", tone: "progress",
      description: run.executor_started ? "The GPU call is confirmed. Generating and post-processing." : "Claimed by the executor. Waiting for the GPU call to be confirmed." };
  }
  return statusView(run.status);
}

/** Billing line. A reservation is an application commitment, never an invoice. */
export function financeView(financeStatus: string | null | undefined): { label: string; description: string } | null {
  switch (financeStatus) {
    case "reserved": return { label: "Reserved", description: "Budget reserved for this run." };
    case "awaiting_reconciliation": return { label: "Billing to reconcile", description: "The reservation stays committed until the Modal invoice is checked. It is not the invoiced cost." };
    case "closed": return { label: "Billing closed", description: "Reconciled against the invoice." };
    default: return null;
  }
}
