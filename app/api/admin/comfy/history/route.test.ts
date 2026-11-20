import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const calls: string[] = [];
const rpcCalls: { fn: string; args: unknown }[] = [];
let overdue: { id: string }[] = [];
let rpcFails = false;
let overdueReadFails = false;
let outbox: { run_id: string; delivered_at: string | null }[] = [];
let runs: unknown[] = [];
let assets: unknown[] = [];
let limitSeen = 0;
beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0;
  runs = [{ id: "r1", status: "done", params_effective: { prompt: "a" } }, { id: "r2", status: "failed", params_effective: {} }];
  assets = [{ id: "a1", run_id: "r1", role: "final", mime: "video/mp4" }, { id: "a2", run_id: "r2", role: "raw", mime: "video/mp4" }];
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "owner", email: "admin@example.com" } });
  rpcCalls.length = 0; overdue = []; outbox = []; rpcFails = false; overdueReadFails = false;
  vi.mocked(createServiceClient).mockReturnValue({
    rpc: (fn: string, args: unknown) => { rpcCalls.push({ fn, args }); return Promise.resolve({ error: rpcFails ? { message: "rpc down" } : null }); },
    from: (table: string) => {
      let lte = false;
      const q = {
        select: () => q, order: () => q, in: () => q,
        eq: (k: string, v: string) => { calls.push(`${table}.${k}=${v}`); return q; },
        is: (k: string) => { calls.push(`${table}.${k}=null`); return q; },
        lte: () => { lte = true; return q; },
        limit: (n: number) => { limitSeen = n; return Promise.resolve({ data: runs, error: null }); },
        then: (resolve: (v: unknown) => void) => resolve(lte && overdueReadFails ? { data: null, error: { message: "read down" } } : { data: lte ? overdue : table === "comfy_dispatch_outbox" ? outbox : assets, error: null }),
      };
      return q;
    } } as unknown as ReturnType<typeof createServiceClient>);
});
const get = (q = "") => GET(new Request(`http://localhost/api/admin/comfy/history${q}`));

describe("Studio history", () => {
  it("denies non-admins before any query", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("Denied", { status: 403 }) as never });
    expect((await get()).status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });
  it("scopes runs and assets to the caller, excludes withdrawn assets, never returns URLs", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(calls).toContain("comfy_runs.user_id=owner");
    expect(calls).toContain("comfy_assets.owner_id=owner");
    expect(calls).toContain("comfy_assets.withdrawn_at=null");
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/storage_key|https?:/);
    expect(body.items[0].assets).toEqual([{ id: "a1", role: "final", mime: "video/mp4" }]);
    // Outputs of non-completed runs are not listed.
    expect(body.items[1].assets).toEqual([]);
  });
  it("caps the page size", async () => {
    await get("?limit=5000"); expect(limitSeen).toBe(50);
    await get("?limit=abc"); expect(limitSeen).toBe(30);
  });
  it("expires only the caller's overdue runs through the existing SQL function, and nothing else", async () => {
    overdue = [{ id: "r-old" }];
    await get();
    expect(rpcCalls).toEqual([{ fn: "expire_comfy_admin_run", args: { p_run: "r-old", p_user: "owner" } }]);
  });
  it("does not call the database to expire anything when no run is overdue", async () => {
    await get(); expect(rpcCalls).toEqual([]);
  });
  it("exposes dispatch and executor state without the Modal call id", async () => {
    runs = [{ id: "r1", status: "queued", params_effective: {}, finance_status: "reserved", modal_call_id: "fc-secret-call" },
      { id: "r2", status: "running", params_effective: {}, finance_status: "reserved", modal_call_id: "fc-other" }];
    outbox = [{ run_id: "r1", delivered_at: "2026-11-20T10:00:00Z" }, { run_id: "r2", delivered_at: null }];
    const body = await (await get()).json();
    expect(JSON.stringify(body)).not.toMatch(/fc-|modal_call_id/);
    expect(body.items[0]).toMatchObject({ dispatched: true, executor_started: true, finance_status: "reserved" });
    expect(body.items[1]).toMatchObject({ dispatched: false, executor_started: true });
  });
  it("fails explicitly, without listing possibly stale runs, when the expiry call fails", async () => {
    overdue = [{ id: "r-old" }]; rpcFails = true;
    const res = await get();
    expect(res.status).toBe(503); expect((await res.json()).error).toBe("History unavailable");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("fails explicitly when the overdue runs cannot be read", async () => {
    overdueReadFails = true;
    const res = await get();
    expect(res.status).toBe(503); expect(rpcCalls).toEqual([]);
  });
});
