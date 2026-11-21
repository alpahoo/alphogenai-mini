import type { SupabaseClient } from "@supabase/supabase-js";
import { isActive } from "@/lib/studio/status";

export type DeleteResult = { ok: true } | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Permanently deletes one of the administrator's own finished runs: its files, its records and its job.
 *
 * It never touches the authorization gates, the budgets, the reservations or any RPC: the gates keep their own
 * counters (their counters are not recalculated from runs), so deleting a run changes no allowance and no budget.
 * A queued or running run cannot be deleted. Files go first: if storage fails nothing else is removed, so no
 * file is left without a record, and a retry finishes the job (missing files are not an error).
 */
export async function deleteRun(db: SupabaseClient, userId: string, runId: string): Promise<DeleteResult> {
  const { data: run } = await db.from("comfy_runs").select("id,job_id,status,reference_path").eq("id", runId).eq("user_id", userId).single();
  if (!run) return { ok: false, status: 404, error: "Run not found" };
  if (isActive(run.status)) return { ok: false, status: 409, error: "This run is still active and cannot be deleted" };
  const fail = (error: string): DeleteResult => ({ ok: false, status: 503, error });

  const { data: assets, error: assetError } = await db.from("comfy_assets").select("storage_key").eq("run_id", runId).eq("owner_id", userId);
  if (assetError) return fail("Could not read this run's files; nothing was deleted");
  const keys = (assets ?? []).map(a => String(a.storage_key)).filter(Boolean);
  if (keys.length) {
    const { error } = await db.storage.from("comfy-outputs").remove(keys);
    if (error) return fail("Could not delete the files; nothing else was deleted");
  }
  if (run.reference_path) {
    const { data: others, error: shareError } = await db.from("comfy_runs").select("id").eq("reference_path", run.reference_path).neq("id", runId).limit(1);
    if (shareError) return fail("Could not check the reference image; nothing else was deleted");
    if (!others?.length) {
      const { error } = await db.storage.from("references").remove([String(run.reference_path)]);
      if (error) return fail("Could not delete the reference image; nothing else was deleted");
    }
  }
  for (const table of ["comfy_dispatch_outbox", "comfy_run_graphs", "comfy_assets"] as const) {
    const { error } = await db.from(table).delete().eq("run_id", runId);
    if (error) return fail("Could not delete this run's records; run again to finish");
  }
  const { error: runError } = await db.from("comfy_runs").delete().eq("id", runId).eq("user_id", userId);
  if (runError) return fail("Could not delete the run; run again to finish");
  if (run.job_id) {
    const { error: jobError } = await db.from("jobs").delete().eq("id", run.job_id).eq("user_id", userId).like("engine_used", "comfy:%");
    if (jobError) return fail("The run was deleted but its job record could not be removed");
  }
  return { ok: true };
}
