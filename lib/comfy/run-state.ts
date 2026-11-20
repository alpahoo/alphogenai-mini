import type { createServiceClient } from "@/lib/supabase/service";

type Db = ReturnType<typeof createServiceClient>;

/**
 * Marks the caller's own runs that are past their SQL execution deadline as expired, using the existing
 * `expire_comfy_admin_run` function (queued/running and deadline passed only). It never touches money: the
 * reservation stays committed and `finance_status` becomes `awaiting_reconciliation`, exactly as when a single
 * run is opened. It never dispatches or starts anything, so it cannot cause a GPU execution or a reservation.
 * Returns false when the overdue list could not be read or an expiry call failed.
 */
export async function expireOverdueRuns(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.from("comfy_runs").select("id")
    .eq("user_id", userId).in("status", ["queued", "running"]).lte("execution_deadline", new Date().toISOString());
  if (error) return false;
  let ok = true;
  for (const row of (data ?? []) as { id: string }[]) {
    const { error: expiryError } = await db.rpc("expire_comfy_admin_run", { p_run: row.id, p_user: userId });
    if (expiryError) ok = false;
  }
  return ok;
}

/** Run ids whose dispatch was acknowledged by the executor endpoint (outbox `delivered_at`). */
export async function deliveredRunIds(db: Db, runIds: string[]): Promise<Set<string>> {
  if (!runIds.length) return new Set();
  const { data, error } = await db.from("comfy_dispatch_outbox").select("run_id,delivered_at").in("run_id", runIds);
  if (error) return new Set();
  return new Set(((data ?? []) as { run_id: string; delivered_at?: string | null }[]).filter(r => !!r.delivered_at).map(r => r.run_id));
}

/** Public run shape: the Modal call id never leaves the server, only whether the executor call was confirmed. */
export function publicRun<T extends { id: string; modal_call_id?: string | null }>(run: T, delivered: Set<string>) {
  const { modal_call_id, ...rest } = run;
  return { ...rest, dispatched: delivered.has(run.id), executor_started: !!modal_call_id };
}
