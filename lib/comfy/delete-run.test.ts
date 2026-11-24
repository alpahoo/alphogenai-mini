import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRun } from "./delete-run";
import { isTombstone } from "./tombstone";
import { fileNameFor, libraryPath, referenceAfterRunDelete } from "@/lib/studio/reference-library";

type Row = Record<string, unknown>;
const LIB = libraryPath("me", fileNameFor("Luz", "11111111-1111-4111-8111-111111111111", "png"));
/** Every mandatory step of a deletion, in order. A failure can be injected at each one. */
const STEPS = ["read-assets", "files", "reference-check", "reference", "outbox", "graphs", "assets", "job", "tombstone"] as const;
type Step = typeof STEPS[number];

/** A small stateful database: rows really change, so a retry after a failure is simulated for real. */
function world(opts: { runs?: Row[]; assets?: Row[]; failOnce?: Step[]; failAlways?: Step[] } = {}) {
  const runs: Row[] = (opts.runs ?? [{ id: "r1", job_id: "j1", status: "done", reference_path: null, params_effective: { prompt: "secret prompt" }, user_id: "me" }]).map(r => ({ ...r }));
  const assets: Row[] = (opts.assets ?? []).map(a => ({ ...a }));
  const jobs: Row[] = [{ id: "j1", user_id: "me", prompt: "secret prompt", status: "done", engine_used: "comfy:minimax-h3", created_at: "2026-11-21T10:00:00Z" }];
  const graphs: Row[] = [{ run_id: "r1" }], outbox: Row[] = [{ run_id: "r1" }];
  const files = new Set<string>(); for (const a of assets) files.add(`comfy-outputs:${a.storage_key}`);
  for (const r of runs) if (r.reference_path) files.add(`references:${r.reference_path}`);
  const log: string[] = []; const failOnce = new Set(opts.failOnce ?? []); const failAlways = new Set(opts.failAlways ?? []);
  const gateWrites: string[] = [];
  const blocked = (s: Step) => { if (failAlways.has(s)) return true; if (failOnce.has(s)) { failOnce.delete(s); return true; } return false; };
  const err = { message: "down" };
  const db = {
    rpc: (fn: string) => { gateWrites.push(`rpc:${fn}`); return Promise.resolve({ error: null }); },
    storage: { from: (bucket: string) => ({ remove: (keys: string[]) => {
      const step: Step = bucket === "comfy-outputs" ? "files" : "reference";
      if (blocked(step)) return Promise.resolve({ error: err });
      for (const k of keys) files.delete(`${bucket}:${k}`); log.push(`storage:${bucket}`); return Promise.resolve({ error: null });
    } }) },
    from: (table: string) => {
      const f: Record<string, unknown> = {}; let mode = "select"; let patch: Row = {}; let neqId: unknown;
      const match = (row: Row) => Object.entries(f).every(([k, v]) => row[k] === v) && (neqId === undefined || row.id !== neqId);
      const q: Record<string, unknown> = {
        select: () => q, delete: () => { mode = "delete"; return q; }, update: (v: Row) => { mode = "update"; patch = v; return q; },
        eq: (k: string, v: unknown) => { f[k] = v; return q; }, neq: (_k: string, v: unknown) => { neqId = v; return q; }, like: () => q, limit: () => q,
        single: () => Promise.resolve({ data: table === "comfy_runs" ? runs.find(match) ?? null : null }),
        then: (resolve: (v: unknown) => void) => {
          if (mode === "select") {
            if (table === "comfy_assets") return resolve(blocked("read-assets") ? { data: null, error: err } : { data: assets.filter(match), error: null });
            if (table === "comfy_runs") return resolve(blocked("reference-check") ? { data: null, error: err } : { data: runs.filter(r => match(r) && r.id !== undefined), error: null });
            return resolve({ data: [], error: null });
          }
          if (mode === "delete") {
            const step: Record<string, Step> = { comfy_dispatch_outbox: "outbox", comfy_run_graphs: "graphs", comfy_assets: "assets" };
            if (blocked(step[table])) return resolve({ error: err });
            const rows = table === "comfy_assets" ? assets : table === "comfy_run_graphs" ? graphs : outbox;
            for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
            log.push(`delete:${table}`); return resolve({ error: null });
          }
          if (table === "jobs") { if (blocked("job")) return resolve({ error: err }); if ("prompt" in patch && patch.prompt === null) return resolve({ error: { message: "null value in column \"prompt\" of relation \"jobs\" violates not-null constraint", code: "23502" } }); for (const j of jobs) if (match(j)) Object.assign(j, patch); log.push("update:jobs"); return resolve({ error: null }); }
          if (blocked("tombstone")) return resolve({ error: err });
          for (const r of runs) if (match(r)) Object.assign(r, patch); log.push("update:comfy_runs"); return resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, runs, jobs, graphs, outbox, assets, files, log, gateWrites };
}

const ASSETS = [{ run_id: "r1", owner_id: "me", storage_key: "a/raw.mp4" }, { run_id: "r1", owner_id: "me", storage_key: "a/final.mp4" }];
const ONE_OFF = "me/one-off.png";
const withRef = (path: string | null) => ({ runs: [{ id: "r1", job_id: "j1", status: "done", reference_path: path, params_effective: { prompt: "secret prompt" }, user_id: "me" }], assets: ASSETS });

describe("deleteRun: what is kept and what is removed", () => {
  it("removes files, content records and the job prompt, then keeps a tombstone; the commit point is the last write", async () => {
    const w = world({ assets: ASSETS });
    expect(await deleteRun(w.db, "me", "r1")).toEqual({ ok: true, reference_removed: null });
    expect(w.log).toEqual(["storage:comfy-outputs", "delete:comfy_dispatch_outbox", "delete:comfy_run_graphs", "delete:comfy_assets", "update:jobs", "update:comfy_runs"]);
    expect([...w.files]).toEqual([]);
    expect(w.graphs).toEqual([]); expect(w.outbox).toEqual([]); expect(w.assets).toEqual([]);
    expect(isTombstone(w.runs[0].params_effective)).toBe(true);
    expect(w.runs[0].reference_path).toBeNull();
    expect(w.jobs[0].prompt).toBe("[deleted]");
  });

  it("keeps the accounting row and the job row: quota is never restored", async () => {
    const w = world({ assets: ASSETS });
    await deleteRun(w.db, "me", "r1");
    expect(w.runs).toHaveLength(1); expect(w.jobs).toHaveLength(1);
    expect(w.runs[0]).toMatchObject({ id: "r1", status: "done" });
    expect(w.jobs[0]).toMatchObject({ status: "done", engine_used: "comfy:minimax-h3", created_at: "2026-11-21T10:00:00Z", user_id: "me" });
    const src = readFileSync("lib/comfy/delete-run.ts", "utf8");
    expect(src).not.toMatch(/from\("jobs"\)\.delete|from\("comfy_runs"\)\.delete/);
  });

  it("never touches the gates, budgets, reservations or any RPC", async () => {
    const w = world({ assets: ASSETS });
    await deleteRun(w.db, "me", "r1");
    expect(w.gateWrites).toEqual([]);
    const src = readFileSync("lib/comfy/delete-run.ts", "utf8");
    expect(src).not.toMatch(/comfy_admin_gate|comfy_runtime_gates|rpc\(|committed_usd|finance_status|reserved_cost/);
  });

  it("refuses another administrator's run, an active run and an already deleted run, and changes nothing", async () => {
    const w = world({ assets: ASSETS });
    expect(await deleteRun(w.db, "someone-else", "r1")).toMatchObject({ ok: false, status: 404 });
    for (const status of ["queued", "running"]) {
      const a = world({ assets: ASSETS, runs: [{ id: "r1", job_id: "j1", status, reference_path: null, params_effective: {}, user_id: "me" }] });
      expect(await deleteRun(a.db, "me", "r1")).toMatchObject({ ok: false, status: 409 });
      expect(a.log).toEqual([]);
    }
    expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: true });
    expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: false, status: 404 });
  });

  it("allows failed, expired, cancelled and done runs, including unreconciled ones", async () => {
    for (const status of ["failed", "expired", "cancelled", "done"]) {
      const w = world({ runs: [{ id: "r1", job_id: null, status, finance_status: "awaiting_reconciliation", reference_path: null, params_effective: {}, user_id: "me" }] });
      expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: true });
    }
  });
});

describe("deleteRun: a failure at any step is reported and the deletion can be resumed", () => {
  for (const step of STEPS) {
    it(`fails at "${step}": no success is announced, nothing after the failure runs, a retry finishes the job`, async () => {
      const w = world({ ...withRef(ONE_OFF), failOnce: [step] });
      const first = await deleteRun(w.db, "me", "r1");
      expect(first).toMatchObject({ ok: false, status: 503 });
      expect((first as { error: string }).error).toMatch(/not fully deleted/);
      // Until the tombstone is written the run is still listed, so it can be deleted again.
      if (step !== "tombstone") expect(isTombstone(w.runs[0].params_effective)).toBe(false);
      // The retry succeeds and leaves the same final state as an uninterrupted deletion.
      const second = await deleteRun(w.db, "me", "r1");
      expect(second).toEqual({ ok: true, reference_removed: ONE_OFF });
      expect(isTombstone(w.runs[0].params_effective)).toBe(true);
      expect(w.jobs[0].prompt).toBe("[deleted]");
      expect(w.assets).toEqual([]); expect(w.graphs).toEqual([]); expect(w.outbox).toEqual([]);
      expect([...w.files]).toEqual([]);
      expect(w.gateWrites).toEqual([]);
    });
  }

  it("the job prompt is cleared before the tombstone, so a failure there is never abandoned", async () => {
    const w = world({ ...withRef(null), failAlways: ["job"] });
    expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: false, status: 503 });
    // Not tombstoned: a later retry still finds the run and can clear the prompt.
    expect(isTombstone(w.runs[0].params_effective)).toBe(false);
    expect(w.jobs[0].prompt).toBe("secret prompt");
    expect(w.log).not.toContain("update:comfy_runs");
  });

  it("a failure on the tombstone leaves the prompt already cleared and the run retryable", async () => {
    const w = world({ ...withRef(null), failOnce: ["tombstone"] });
    expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: false });
    expect(w.jobs[0].prompt).toBe("[deleted]");
    expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: true });
  });

  it("a permanent failure is reported every time and never reported as complete", async () => {
    for (const step of STEPS) {
      const w = world({ ...withRef(ONE_OFF), failAlways: [step] });
      for (let i = 0; i < 2; i++) expect(await deleteRun(w.db, "me", "r1")).toMatchObject({ ok: false, status: 503 });
      expect(isTombstone(w.runs[0].params_effective)).toBe(false);
    }
  });
});

describe("deleteRun and reference images", () => {
  it("removes a one-off upload with its last run and reports which one, so the form can detach it", async () => {
    const w = world(withRef(ONE_OFF));
    expect(await deleteRun(w.db, "me", "r1")).toEqual({ ok: true, reference_removed: ONE_OFF });
    expect(w.files.has(`references:${ONE_OFF}`)).toBe(false);
  });

  it("keeps a one-off upload while another run still uses it", async () => {
    const other = { id: "r2", job_id: null, status: "done", reference_path: ONE_OFF, params_effective: {}, user_id: "me" };
    const w = world({ ...withRef(ONE_OFF), runs: [{ id: "r1", job_id: "j1", status: "done", reference_path: ONE_OFF, params_effective: {}, user_id: "me" }, other] });
    expect(await deleteRun(w.db, "me", "r1")).toEqual({ ok: true, reference_removed: null });
    expect(w.files.has(`references:${ONE_OFF}`)).toBe(true);
  });

  it("never deletes a permanent library reference, and does not report it as removed", async () => {
    const w = world(withRef(LIB));
    expect(await deleteRun(w.db, "me", "r1")).toEqual({ ok: true, reference_removed: null });
    expect(w.files.has(`references:${LIB}`)).toBe(true);
    expect(w.log).not.toContain("storage:references");
  });

  it("a library image survives the deletion of several generations and can be used again", async () => {
    const mk = (id: string) => ({ id, job_id: null, status: id === "r2" ? "failed" : "done", reference_path: LIB, params_effective: { prompt: id }, user_id: "me" });
    const w = world({ runs: [mk("r1"), mk("r2"), mk("r3")] });
    w.files.add(`references:${LIB}`);
    for (const id of ["r1", "r2", "r3"]) expect(await deleteRun(w.db, "me", id)).toEqual({ ok: true, reference_removed: null });
    expect(w.files.has(`references:${LIB}`)).toBe(true);
    expect(w.runs.every(r => isTombstone(r.params_effective) && r.reference_path === null)).toBe(true);
  });
});

describe("the form after a deletion", () => {
  const luz = { path: LIB, name: "Luz", previewUrl: "https://signed/luz" };
  const temp = { path: ONE_OFF, name: "x.png", previewUrl: "blob:local" };
  it("detaches the one-off upload that was removed", () => { expect(referenceAfterRunDelete(temp, ONE_OFF)).toBeNull(); });
  it("keeps a library reference, even if a path in the library were reported", () => {
    expect(referenceAfterRunDelete(luz, null)).toBe(luz);
    expect(referenceAfterRunDelete(luz, undefined)).toBe(luz);
    expect(referenceAfterRunDelete(luz, LIB)).toBe(luz);
  });
  it("keeps a different reference and an empty form", () => {
    expect(referenceAfterRunDelete(luz, ONE_OFF)).toBe(luz);
    expect(referenceAfterRunDelete(temp, "me/other.png")).toBe(temp);
    expect(referenceAfterRunDelete(null, ONE_OFF)).toBeNull();
  });
  it("the Studio uses it after a delete and detaches at generation when the server says the image is gone", () => {
    const hook = readFileSync("components/studio/use-studio.ts", "utf8");
    expect(hook).toMatch(/referenceAfterRunDelete\(prev, removed\)/);
    expect(hook).toMatch(/no longer exists\/i\.test\(e\.message\)\) setReference\(null\)/);
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
  it("does not announce a deletion when the server refused it", () => {
    const hook = readFileSync("components/studio/use-studio.ts", "utf8");
    const block = hook.slice(hook.indexOf("const removeRun"), hook.indexOf("const signMedia"));
    expect(block.indexOf("if (!res.ok) throw")).toBeGreaterThan(-1);
    expect(block.indexOf("if (!res.ok) throw")).toBeLessThan(block.indexOf('setNotice("Generation deleted.")'));
  });
});
