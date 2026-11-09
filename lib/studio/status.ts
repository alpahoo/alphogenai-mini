/** Display mapping of real `comfy_runs.status` values. No invented intermediate stages. */
export type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "expired";

export const ACTIVE_STATUSES: readonly string[] = ["queued", "running"];

export function isActive(status: string | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.includes(status);
}

export interface StatusView { label: string; tone: "neutral" | "progress" | "success" | "danger" | "muted"; description: string }

export function statusView(status: string): StatusView {
  switch (status) {
    case "loading": return { label: "Loading", tone: "muted", description: "Opening this private run…" };
    case "queued": return { label: "Queued", tone: "neutral", description: "Reserved and waiting for the GPU executor." };
    case "running": return { label: "Generating", tone: "progress", description: "Loading models, generating and post-processing on the GPU." };
    case "done": return { label: "Completed", tone: "success", description: "Original and corrected files are stored privately." };
    case "failed": return { label: "Failed", tone: "danger", description: "The generation did not complete." };
    case "expired": return { label: "Expired", tone: "danger", description: "No result before the execution deadline." };
    case "cancelled": return { label: "Cancelled", tone: "muted", description: "The run was cancelled." };
    default: return { label: status, tone: "muted", description: "" };
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: "The run exceeded its execution deadline.",
  AUTHORIZATION_EXPIRED: "The GPU authorization expired before the run started.",
  MISSING_OUTPUTS: "The executor did not return both files.",
};

export function errorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? `Error code: ${code}`;
}

export function formatElapsed(fromIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Polling interval: fast while running, slower when queued long, none when finished. */
export function pollDelay(status: string, ageMs: number): number | null {
  if (!isActive(status)) return null;
  if (ageMs < 120_000) return 3_000;
  return 6_000;
}
