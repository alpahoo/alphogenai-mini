import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRun } from "./delete-run";

type Row = Record<string, unknown>;
function fakeDb(opts: { run?: Row | null; assets?: Row[]; storageError?: boolean; tableError?: string; sharedRef?: boolean } = {}) {
  const log: string[] = [];
  const run = opts.run === undefined ? { id: "r1", job_id: "j1", status: "done", reference_path: null, user_id: "me" } : opts.run;
  const db = {
    rpc: (fn: string) => { log.push(`rpc:${fn}`); return Promise.resolve({ error: null }); },
    storage: { from: (bucket: string) => ({ remove: (keys: string[]) => { log.push(`storage:${bucket}:${keys.join(",")}`); return Promise.resolve({ error: opts.storageError ? { message: "x" } : null }); } }) },
    from: (table: string) => {
      const filters: string[] = []; let mode = "select";
      const q: Record<string, unknown> = {
        select: () => q, delete: () => { mode = "delete"; return q; },
        eq: (k: string, v: string) => { filters.push(`${k}=${v}`); return q; }, neq: () => q, like: () => q, limit: () => q,
        single: () => { log.push(`select:${table}:${filters.join("&")}`); const mine = filters.includes("user_id=me"); return Promise.resolve({ data: table === "comfy_runs" && mine ? run : null }); },
        then: (resolve: (v: unknown) => void) => {
          if (mode === "delete") { log.push(`delete:${table}:${filters.join("&")}`); return resolve({ error: opts.tableError === table ? { message: "x" } : null }); }
          log.push(`select:${table}:${filters.join("&")}`);
          if (table === "comfy_assets") return resolve({ data: opts.assets ?? [], error: null });
          if (table === "comfy_runs") return resolve({ data: opts.sharedRef ? [{ id: "other" }] : [], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, log };
}

describe("deleteRun", () => {
  it("deletes files first, then records, then the job, in that order", async () => {
    const { db, log } = fakeDb({ assets: [{ storage_key: "a/raw.mp4" }, { storage_key: "a/final.mp4" }] });
    expect(await deleteRun(db, "me", "r1")).toEqual({ ok: true });
    const order = log.filter(l => l.startsWith("storage") || l.startsWith("delete"));
    expect(order).toEqual([
      "storage:comfy-outputs:a/raw.mp4,a/final.mp4",
      "delete:comfy_dispatch_outbox:run_id=r1", "delete:comfy_run_graphs:run_id=r1", "delete:comfy_assets:run_id=r1",
      "delete:comfy_runs:id=r1&user_id=me", "delete:jobs:id=j1&user_id=me",
    ]);
  });

  it("never touches the gates, budgets, reservations or any RPC", async () => {
    const { db, log } = fakeDb({ assets: [{ storage_key: "k" }] });
    await deleteRun(db, "me", "r1");
    expect(log.filter(l => l.startsWith("rpc"))).toEqual([]);
    expect(log.some(l => /gate|budget|reserv/i.test(l))).toBe(false);
    const src = readFileSync("lib/comfy/delete-run.ts", "utf8");
    expect(src).not.toMatch(/comfy_admin_gate|comfy_runtime_gates|rpc\(|committed_usd|finance_status\s*=/);
  });

  it("refuses another administrator's run and deletes nothing", async () => {
    const { db, log } = fakeDb();
    expect(await deleteRun(db, "someone-else", "r1")).toMatchObject({ ok: false, status: 404 });
    expect(log.some(l => l.startsWith("delete") || l.startsWith("storage"))).toBe(false);
  });

  it("refuses a queued or running run", async () => {
    for (const status of ["queued", "running"]) {
      const { db, log } = fakeDb({ run: { id: "r1", job_id: "j1", status, reference_path: null } });
      expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 409 });
      expect(log.some(l => l.startsWith("delete") || l.startsWith("storage"))).toBe(false);
    }
  });

  it("allows failed, expired, cancelled and done runs, including unreconciled ones", async () => {
    for (const status of ["failed", "expired", "cancelled", "done"]) {
      const { db } = fakeDb({ run: { id: "r1", job_id: null, status, finance_status: "awaiting_reconciliation", reference_path: null } });
      expect(await deleteRun(db, "me", "r1")).toEqual({ ok: true });
    }
  });

  it("stops before removing any record when the files cannot be deleted", async () => {
    const { db, log } = fakeDb({ assets: [{ storage_key: "k" }], storageError: true });
    expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 503 });
    expect(log.some(l => l.startsWith("delete"))).toBe(false);
  });

  it("reports a failure on a record step and does not claim success", async () => {
    const { db } = fakeDb({ tableError: "comfy_runs" });
    expect(await deleteRun(db, "me", "r1")).toMatchObject({ ok: false, status: 503 });
  });

  it("removes the reference image only when no other run uses it", async () => {
    const own = fakeDb({ run: { id: "r1", job_id: "j1", status: "done", reference_path: "me/ref.png" } });
    await deleteRun(own.db, "me", "r1");
    expect(own.log).toContain("storage:references:me/ref.png");
    const shared = fakeDb({ run: { id: "r1", job_id: "j1", status: "done", reference_path: "me/ref.png" }, sharedRef: true });
    await deleteRun(shared.db, "me", "r1");
    expect(shared.log.some(l => l.startsWith("storage:references"))).toBe(false);
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
  it("tells the administrator that an unreconciled run loses its record but not its budget", () => {
    expect(rail).toMatch(/awaiting_reconciliation/);
    expect(rail).toMatch(/budget is unchanged/);
  });
});
