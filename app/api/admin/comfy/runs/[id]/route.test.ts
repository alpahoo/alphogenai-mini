import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchRun } from "@/lib/comfy/admin";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/comfy/admin", () => ({ dispatchRun: vi.fn(), privateHeaders: { "Cache-Control": "private, no-store" } }));

const rpcCalls: string[] = [];
let run: Record<string, unknown> | null = null;
let delivered = false;
const ctx = { params: Promise.resolve({ id: "run-1" }) };
beforeEach(() => {
  vi.clearAllMocks(); rpcCalls.length = 0; delivered = false;
  run = { id: "run-1", status: "queued", template_version: "minimax-h3@1", runtime: "h3-video@1", modal_call_id: null, finance_status: "reserved" };
  vi.stubEnv("COMFY_ADMIN_ENABLED", ""); vi.stubEnv("COMFY_MOSS_ENABLED", "");
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1", email: "a@example.com" } });
  vi.mocked(dispatchRun).mockResolvedValue(undefined);
  vi.mocked(createServiceClient).mockReturnValue({
    rpc: (fn: string) => { rpcCalls.push(fn); return Promise.resolve({ error: null }); },
    from: (table: string) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, in: () => q,
        single: () => Promise.resolve(run ? { data: run, error: null } : { data: null, error: { message: "none" } }),
        then: (resolve: (v: unknown) => void) => resolve({ data: table === "comfy_dispatch_outbox" ? [{ run_id: "run-1", delivered_at: delivered ? "x" : null }] : [], error: null }),
      };
      return q;
    } } as unknown as ReturnType<typeof createServiceClient>);
});
const post = () => POST(new Request("http://localhost/api/admin/comfy/runs/run-1", { method: "POST" }), ctx);

describe("Retry dispatch", () => {
  it("uses the MOSS switch for a MOSS run, not the H3 switch", async () => {
    run = { ...run, template_version: "moss-image@1", runtime: "moss-image@1" };
    vi.stubEnv("COMFY_ADMIN_ENABLED", "true");
    expect((await post()).status).toBe(503); expect(dispatchRun).not.toHaveBeenCalled();
    vi.stubEnv("COMFY_ADMIN_ENABLED", ""); vi.stubEnv("COMFY_MOSS_ENABLED", "true");
    expect((await post()).status).toBe(200); expect(dispatchRun).toHaveBeenCalledWith("run-1");
  });
  it("uses the H3 switch for an H3 run, not the MOSS switch", async () => {
    vi.stubEnv("COMFY_MOSS_ENABLED", "true");
    expect((await post()).status).toBe(503); expect(dispatchRun).not.toHaveBeenCalled();
    vi.stubEnv("COMFY_ADMIN_ENABLED", "true");
    expect((await post()).status).toBe(200);
  });
  it("only re-sends the same run id: no admission, no new reservation", async () => {
    vi.stubEnv("COMFY_ADMIN_ENABLED", "true");
    await post(); await post();
    expect(dispatchRun).toHaveBeenCalledTimes(2);
    expect(dispatchRun).toHaveBeenNthCalledWith(1, "run-1"); expect(dispatchRun).toHaveBeenNthCalledWith(2, "run-1");
    expect(rpcCalls.every(fn => fn === "expire_comfy_admin_run")).toBe(true);
    expect(rpcCalls).not.toContain("admit_comfy_admin_run"); expect(rpcCalls).not.toContain("admit_comfy_runtime_run");
  });
  it("expires an overdue run first and never dispatches a run that is no longer queued", async () => {
    vi.stubEnv("COMFY_ADMIN_ENABLED", "true");
    run = { ...run, status: "expired" };
    expect((await post()).status).toBe(409); expect(rpcCalls[0]).toBe("expire_comfy_admin_run"); expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("refuses a run that is already running", async () => {
    vi.stubEnv("COMFY_ADMIN_ENABLED", "true"); run = { ...run, status: "running" };
    expect((await post()).status).toBe(409); expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("keeps the reservation message when the executor is unavailable", async () => {
    vi.stubEnv("COMFY_ADMIN_ENABLED", "true"); vi.mocked(dispatchRun).mockRejectedValue(new Error("offline"));
    const res = await post(); expect(res.status).toBe(503); expect((await res.json()).error).toMatch(/reservation preserved/);
  });
  it("rejects non-admins before any database access", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await post()).status).toBe(403); expect(createServiceClient).not.toHaveBeenCalled();
  });
});

describe("Run status", () => {
  it("expires an overdue run and exposes executor state without the Modal call id", async () => {
    run = { ...run, status: "running", modal_call_id: "fc-secret", finance_status: "awaiting_reconciliation" };
    delivered = true;
    const res = await GET(new Request("http://localhost/api/admin/comfy/runs/run-1"), ctx);
    const body = await res.json();
    expect(rpcCalls).toEqual(["expire_comfy_admin_run"]);
    expect(JSON.stringify(body)).not.toMatch(/fc-secret|modal_call_id/);
    expect(body.run).toMatchObject({ dispatched: true, executor_started: true, finance_status: "awaiting_reconciliation" });
  });
});
