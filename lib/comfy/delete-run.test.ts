import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRun } from "./delete-run";
import { isTombstone } from "./tombstone";
import { fileNameFor, libraryPath } from "@/lib/studio/reference-library";

type Row = Record<string, unknown>;
const LIB = libraryPath("me", fileNameFor("Luz", "11111111-1111-4111-8111-111111111111", "png"));
function fakeDb(opts: { run?: Row | null; assets?: Row[]; storageError?: boolean; tableError?: string; sharedRef?: boolean } = {}) {
  const log: string[] = []; const updates: { table: string; values: Row }[] = [];
  const run = opts.run === undefined ? { id: "r1", job_id: "j1", status: "done", reference_path: null, params_effective: { prompt: "p" }, user_id: "me" } : opts.run;
  const db = {
    rpc: (fn: string) => { log.push(`rpc:${fn}`); return Promise.resolve({ error: null }); },
    storage: { from: (bucket: string) => ({ remove: (keys: string[]) => { log.push(`storage:${bucket}:${keys.join(",")}`); return Promise.resolve({ error: opts.storageError ? { message: "x" } : null }); } }) },
    from: (table: string) => {
      const filters: string[] = []; let mode = "select";
      const q: Record<string, unknown> = {
        select: () => q, delete: () => { mode = "delete"; return q; },
        update: (values: Row) => { mode = "update"; updates.push({ table, values }); return q; },
        eq: (k: string, v: string) => { filters.push(`${k}=${v}`); return q; }, neq: () => q, like: () => q, limit: () => q,
        single: () => { log.push(`select:${table}:${filters.join("&")}`); return Promise.resolve({ data: table === "comfy_runs" && filters.includes("user_id=me") ? run : null }); },
        then: (resolve: (v: unknown) => void) => {
          if (mode === "delete" || mode === "update") { log.push(`${mode}:${table}:${filters.join("&")}`); return resolve({ error: opts.tableError === table ? { message: "x" } : null }); }
          if (table === "comfy_assets") return resolve({ data: opts.assets ?? [], error: null });
          if (table === "comfy_runs") return resolve({ data: opts.sharedRef ? [{ id: "other" }] : [], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, log, updates };
}

describe("deleteRun", () => {
  it("removes files and content records, then keeps a tombstone and clears the job prompt, in that order", async () => {
    const { db, log, updates } = fakeDb({ assets: [{ storage_key: "a/raw.mp4" }, { storage_key: "a/final.mp4" }] });
    expect(await deleteRun(db, "me", "r1")).toEqual({ ok: true });
    expect(log.filter(l => /^(storage|delete|update)/.test(l))).toEqual([
      "storage:comfy-outputs:a/raw.mp4,a/final.mp4",
      "delete:comfy_dispatch_outbox:run_id=r1", "delete:comfy_run_graphs:run_id=r1", "delete:comfy_assets:run_id=r1",
      "update:comfy_runs:id=r1&user_id=me", "update:jobs:id=j1&user_id=me",
    ]);
    expect(isTombstone(updates[0].values.params_effective)).toBe(true);
    expect(updates[0].values.reference_path).toBeNull();
    expect(updates[1].values).toEqual({ prompt: null });
  });

  it("keeps the accounting row and the job row: no run row is deleted, no job row is deleted (the daily quota counts jobs)", async () => {
    const { db, log, updates } = fakeDb();
    await deleteRun(db, "me", "r1");
    expect(log.some(l => l.startsWith("delete:comfy_runs") || l.startsWith("delete:jobs"))).toBe(false);
    // Only the parameters and the reference path of the run change; status, error, finance, cost and dates are untouched.
    expect(Object.keys(updates[0].values).sort()).toEqual(["params_effective", "reference_path"]);
    const src = readFileSync("lib/comfy/delete-run.ts", "utf8");
    expect(src).not.toMatch(/from\("jobs"\)\.delete|from\("comfy_runs"\)\.delete/);
  });

  it("never touches the gates, budgets, reservations or any RPC", async () => {
    const { db, log } = fakeDb({ assets: [{ storage_key: "k" }] });
    await deleteRun(db, "me", "r1");
    expect(log.filter(l => l.startsWith("rpc"))).toEqual([]);
    expect(log.some(l => /gate|budget|reserv/i.test(l))).toBe(false);
    const src = readFileSync("lib/comfy/delete-run.ts", "utf8");
    expect(src).not.toMatch(/comfy_admin_gate|comfy_runtime_gates|rpc\(|committed_usd|finance_status|reserved_cost/);
  });

  it("refuses another administrator's run and deletes nothing", async () => {
    const { db, log } = fakeDb();
    expect(await deleteRun(db, "someone-else", "r1")).toMatchObject({ ok: false, status: 404 });
    expect(log.some(l => /^(delete|update|storage)/.test(l))).toBe(false);
  });

  it("treats an already deleted run as not found", async () => {
    const { db } = fakeDb({ run: { id: "r1", job_id: "j1", status: "done", reference_path: null, params_effective: { deleted_at: "2026-11-21T00:00:00Z" } } });
    expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a queued or running run", async () => {
    for (const status of ["queued", "running"]) {
      const { db, log } = fakeDb({ run: { id: "r1", job_id: "j1", status, reference_path: null, params_effective: {} } });
      expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 409 });
      expect(log.some(l => /^(delete|update|storage)/.test(l))).toBe(false);
    }
  });

  it("allows failed, expired, cancelled and done runs, including unreconciled ones", async () => {
    for (const status of ["failed", "expired", "cancelled", "done"]) {
      const { db } = fakeDb({ run: { id: "r1", job_id: null, status, finance_status: "awaiting_reconciliation", reference_path: null, params_effective: {} } });
      expect(await deleteRun(db, "me", "r1")).toEqual({ ok: true });
    }
  });

  it("stops before changing any record when the files cannot be deleted", async () => {
    const { db, log } = fakeDb({ assets: [{ storage_key: "k" }], storageError: true });
    expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 503 });
    expect(log.some(l => /^(delete|update)/.test(l))).toBe(false);
  });

  it("reports a failure on the tombstone step and does not claim success", async () => {
    const { db } = fakeDb({ tableError: "comfy_runs" });
    expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 503 });
  });

  it("removes a one-off upload only when no other run uses it", async () => {
    const run = { id: "r1", job_id: "j1", status: "done", reference_path: "me/one-off.png", params_effective: {} };
    const own = fakeDb({ run });
    await deleteRun(own.db, "me", "r1");
    expect(own.log).toContain("storage:references:me/one-off.png");
    const shared = fakeDb({ run, sharedRef: true });
    await deleteRun(shared.db, "me", "r1");
    expect(shared.log.some(l => l.startsWith("storage:references"))).toBe(false);
  });

  it("never deletes a permanent library reference, even when it is the last run that uses it", async () => {
    const { db, log, updates } = fakeDb({ run: { id: "r1", job_id: "j1", status: "done", reference_path: LIB, params_effective: {} } });
    expect(await deleteRun(db, "me", "r1")).toEqual({ ok: true });
    expect(log.some(l => l.startsWith("storage:references"))).toBe(false);
    // The tombstone forgets the link, the library file is untouched and can be attached to a new generation.
    expect(updates[0].values.reference_path).toBeNull();
  });
});

describe("delete in the Studio history", () => {
  const rail = readFileSync("components/studio/history-rail.tsx", "utf8");
  it("asks for confirmation before deleting and hides the button for active runs", () => {
    expect(rail).toMatch(/onClick=\{\(\) => setConfirming\(run\.id\)\}/);
    expect(rail).toMatch(/!isActive\(run\.status\)/);
    expect(rail.indexOf("removeRun")).toBeGreaterThan(rail.indexOf("Confirm deletion"));
    expect(rail).toMatch(/cannot be undone/);
  });
  it("tells the administrator that an unreconciled run loses its content but not its accounting row", () => {
    expect(rail).toMatch(/awaiting_reconciliation/);
    expect(rail).toMatch(/budget is unchanged/);
  });
});
