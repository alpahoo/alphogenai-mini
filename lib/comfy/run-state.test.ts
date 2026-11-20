import { describe, expect, it, vi } from "vitest";
import { deliveredRunIds, expireOverdueRuns, publicRun } from "./run-state";
import { readFileSync } from "node:fs";

type Db = Parameters<typeof expireOverdueRuns>[0];
function fakeDb(overdue: { id: string }[], opts: { listError?: boolean; rpcError?: boolean } = {}) {
  const rpc = vi.fn(() => Promise.resolve({ error: opts.rpcError ? { message: "x" } : null }));
  const filters: string[] = [];
  const q = { select: () => q, eq: (k: string, v: string) => { filters.push(`${k}=${v}`); return q; }, in: (k: string, v: string[]) => { filters.push(`${k} in ${v.join(",")}`); return q; },
    lte: (k: string) => { filters.push(`${k}<=now`); return Promise.resolve({ data: overdue, error: opts.listError ? { message: "x" } : null }); } };
  return { db: { from: () => q, rpc } as unknown as Db, rpc, filters };
}

describe("expireOverdueRuns", () => {
  it("expires each overdue run of the caller, through the existing function only", async () => {
    const { db, rpc, filters } = fakeDb([{ id: "a" }, { id: "b" }]);
    expect(await expireOverdueRuns(db, "u1")).toBe(true);
    expect(rpc.mock.calls).toEqual([["expire_comfy_admin_run", { p_run: "a", p_user: "u1" }], ["expire_comfy_admin_run", { p_run: "b", p_user: "u1" }]]);
    expect(filters).toContain("user_id=u1"); expect(filters).toContain("status in queued,running");
  });
  it("does nothing when no run is overdue", async () => {
    const { db, rpc } = fakeDb([]); expect(await expireOverdueRuns(db, "u1")).toBe(true); expect(rpc).not.toHaveBeenCalled();
  });
  it("reports a failed read or expiry without throwing", async () => {
    expect(await expireOverdueRuns(fakeDb([], { listError: true }).db, "u1")).toBe(false);
    expect(await expireOverdueRuns(fakeDb([{ id: "a" }], { rpcError: true }).db, "u1")).toBe(false);
  });
  it("never admits, claims or dispatches: no reservation, no GPU", () => {
    const src = readFileSync("lib/comfy/run-state.ts", "utf8");
    expect(src).not.toMatch(/admit_comfy|claim_comfy|finish_comfy|dispatchRun|committed_usd|remaining_runs/);
  });
});

describe("run state helpers", () => {
  it("lists only acknowledged dispatches", async () => {
    const q = { select: () => q, in: () => Promise.resolve({ data: [{ run_id: "a", delivered_at: "t" }, { run_id: "b", delivered_at: null }], error: null }) };
    const db = { from: () => q } as unknown as Db;
    expect([...(await deliveredRunIds(db, ["a", "b"]))]).toEqual(["a"]);
    expect((await deliveredRunIds(db, [])).size).toBe(0);
  });
  it("hides the Modal call id", () => {
    const out = publicRun({ id: "a", modal_call_id: "fc-1", status: "running" }, new Set(["a"]));
    expect(out).toEqual({ id: "a", status: "running", dispatched: true, executor_started: true });
    expect(publicRun({ id: "b", modal_call_id: null }, new Set()).executor_started).toBe(false);
  });
});
