import type { SupabaseClient } from "@supabase/supabase-js";
import { isActive } from "@/lib/studio/status";
import { isLibraryPath } from "@/lib/studio/reference-library";
import { isTombstone, tombstone } from "./tombstone";

export type DeleteResult = { ok: true } | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Deletes one of the administrator's own finished runs: the media files, the prompt and every record that
 * describes the content. What accounting, security and quotas need is kept as a tombstone: the run row (status,
 * error code, finance status, reserved cost, timestamps, runtime) with its parameters replaced by a deletion
 * mark, and the job row with its prompt cleared. The job row stays because the daily quota counts jobs: deleting a
 * generation never gives a quota back.
 *
 * It never touches the authorization gates, the budgets, the reservations or any RPC. A queued or running run
 * cannot be deleted. Reference images of the permanent library are never removed here. Files go first: if storage
 * fails nothing else changes, and a retry finishes the job (missing files are not an error).
 */
export async function deleteRun(db: SupabaseClient, userId: string, runId: string): Promise<DeleteResult> {
  const { data: run } = await db.from("comfy_runs").select("id,job_id,status,reference_path,params_effective").eq("id", runId).eq("user_id", userId).single();
  if (!run || isTombstone(run.params_effective)) return { ok: false, status: 404, error: "Run not found" };
  if (isActive(run.status)) return { ok: false, status: 409, error: "This run is still active and cannot be deleted" };
  const fail = (error: string): DeleteResult => ({ ok: false, status: 503, error });

  const { data: assets, error: assetError } = await db.from("comfy_assets").select("storage_key").eq("run_id", runId).eq("owner_id", userId);
  if (assetError) return fail("Could not read this run's files; nothing was deleted");
  const keys = (assets ?? []).map(a => String(a.storage_key)).filter(Boolean);
  if (keys.length) {
    const { error } = await db.storage.from("comfy-outputs").remove(keys);
    if (error) return fail("Could not delete the files; nothing else was deleted");
  }
  // A one-off upload is removed with its last run. A library reference is permanent and is never touched.
  if (run.reference_path && !isLibraryPath(userId, String(run.reference_path))) {
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
  const { error: runError } = await db.from("comfy_runs").update({ params_effective: tombstone(), reference_path: null }).eq("id", runId).eq("user_id", userId);
  if (runError) return fail("Could not delete the run; run again to finish");
  if (run.job_id) {
    const { error: jobError } = await db.from("jobs").update({ prompt: null }).eq("id", run.job_id).eq("user_id", userId).like("engine_used", "comfy:%");
    if (jobError) return fail("The run was deleted but its prompt could not be cleared from the job record");
  }
  return { ok: true };
}
