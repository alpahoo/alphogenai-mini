// Removal of everything a disposable account created during the rehearsal (comfy runs, Cinema rows, storage files).
// Order matters: comfy_runs.job_id and cinema_takes.run_id forbid deleting runs first; jobs/profiles cascade with the user.
async function removeTree(db, bucket, prefix) {
  const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  const files = [];
  for (const e of data ?? []) { if (e.id === null || e.metadata === null) await removeTree(db, bucket, `${prefix}/${e.name}`); else files.push(`${prefix}/${e.name}`); }
  if (files.length) await db.storage.from(bucket).remove(files);
}
export async function cleanupData(db, ids) {
  const notes = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { notes.push(`${name}: ${String(e.message ?? e).slice(0, 120)}`); } };
  for (const uid of ids) {
    const runs = ((await db.from("comfy_runs").select("id").eq("user_id", uid)).data ?? []).map((r) => r.id);
    if (runs.length) {
      await step("comfy_assets", () => db.from("comfy_assets").delete().in("run_id", runs));
      await step("outbox", () => db.from("comfy_dispatch_outbox").delete().in("run_id", runs));
      await step("graphs", () => db.from("comfy_run_graphs").delete().in("run_id", runs));
    }
    for (const t of ["cinema_takes", "cinema_shots", "cinema_elements", "cinema_scenes", "cinema_projects"]) await step(t, () => db.from(t).delete().eq("user_id", uid));
    await step("comfy_runs", () => db.from("comfy_runs").delete().eq("user_id", uid));
    for (const b of ["references", "comfy-outputs"]) await step(`storage ${b}`, () => removeTree(db, b, uid));
  }
  return notes;
}

