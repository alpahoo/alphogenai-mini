import type { SupabaseClient } from "@supabase/supabase-js";
import { isActive } from "@/lib/studio/status";
import { isLibraryPath } from "@/lib/studio/reference-library";
import { isTombstone, tombstone } from "./tombstone";

/** `reference_removed` is the one-off upload deleted with the run (null when none, or when it belongs to the library). */
export type DeleteResult = { ok: true; reference_removed: string | null } | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Deletes one of the administrator's own finished runs: the media files, the prompt and every record that
 * describes the content. What accounting, security and quotas need is kept as a tombstone: the run row (status,
 * error code, finance status, reserved cost, timestamps, runtime) with its parameters replaced by a deletion
 * mark, and the job row with its prompt cleared. The job row stays because the daily quota counts jobs: deleting a
 * generation never gives a quota back.
 *
 * It never touches the authorization gates, the budgets, the reservations or any RPC. A queued or running run
 * cannot be deleted. Reference images of the permanent library are never removed here.
 *
 * Recoverable by construction. The tombstone is the LAST step and the single commit point: until it is written
 * the run is still listed and can be deleted again, so a failure at any earlier step (files, reference, records,
 * job prompt) is simply retried, and every step is safe to repeat (a file or row that is already gone is not an
 * error). Success is returned only after every mandatory step succeeded; any failure returns an error and the
 * caller must not report the generation as deleted.
 */
export async function deleteRun(db: SupabaseClient, userId: string, runId: string): Promise<DeleteResult> {
  const { data: run } = await db.from("comfy_runs").select("id,job_id,status,reference_path,params_effective").eq("id", runId).eq("user_id", userId).single();
  if (!run || isTombstone(run.params_effective)) return { ok: false, status: 404, error: "Run not found" };
  if (isActive(run.status)) return { ok: false, status: 409, error: "This run is still active and cannot be deleted" };
  const fail = (error: string): DeleteResult => ({ ok: false, status: 503, error: `${error}. The generation is not fully deleted: delete it again to finish` });

  // 1. Media files.
  const { data: assets, error: assetError } = await db.from("comfy_assets").select("storage_key").eq("run_id", runId).eq("owner_id", userId);
  if (assetError) return fail("Could not read this generation's files");
  const keys = (assets ?? []).map(a => String(a.storage_key)).filter(Boolean);
  if (keys.length) {
    const { error } = await db.storage.from("comfy-outputs").remove(keys);
    if (error) return fail("Could not delete the files");
  }

  // 2. A one-off upload goes with its last run. A library reference is permanent and is never touched.
  let referenceRemoved: string | null = null;
  const ref = run.reference_path ? String(run.reference_path) : null;
  if (ref && !isLibraryPath(userId, ref)) {
    const { data: others, error: shareError } = await db.from("comfy_runs").select("id").eq("reference_path", ref).neq("id", runId).limit(1);
    if (shareError) return fail("Could not check the reference image");
    if (!others?.length) {
      const { error } = await db.storage.from("references").remove([ref]);
      if (error) return fail("Could not delete the reference image");
      referenceRemoved = ref;
    }
  }

  // 3. Content records (the stored graph holds the prompt).
  for (const table of ["comfy_dispatch_outbox", "comfy_run_graphs", "comfy_assets"] as const) {
    const { error } = await db.from(table).delete().eq("run_id", runId);
    if (error) return fail("Could not delete this generation's records");
  }

  // 4. The prompt copied into the job. Before the tombstone, so a failure here can still be retried.
  if (run.job_id) {
    const { error } = await db.from("jobs").update({ prompt: null }).eq("id", run.job_id).eq("user_id", userId).like("engine_used", "comfy:%");
    if (error) return fail("Could not clear the prompt from the job record");
  }

  // 5. Commit point: from here the run is hidden everywhere and the accounting row stays.
  const { error: runError } = await db.from("comfy_runs").update({ params_effective: tombstone(), reference_path: null }).eq("id", runId).eq("user_id", userId);
  if (runError) return fail("Could not finish the deletion");
  return { ok: true, reference_removed: referenceRemoved };
}
