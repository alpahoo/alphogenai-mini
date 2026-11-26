import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Video lot acceptance: reopening a generation by id after a reload (GET /api/admin/comfy/runs/[id]).
 * The fake database applies the route's own filters, so a missing owner or tombstone filter turns a test red:
 * a run is only found when every `eq` / `is` the route sends matches the stored row.
 */
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

type Row = Record<string, unknown>;
const CALLER = "admin-1", OTHER = "admin-2";
let runs: Row[] = [];
let assets: Row[] = [];
const queried: string[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

const read = (row: Row, key: string): unknown => key.includes("->>") ? (row[key.split("->>")[0]] as Row | undefined)?.[key.split("->>")[1]] : row[key];
beforeEach(() => {
  vi.clearAllMocks(); queried.length = 0; rpcs.length = 0;
  runs = [
    { id: "run-mine", user_id: CALLER, status: "done", template_version: "minimax-h3@1", runtime: "h3-video@1", modal_call_id: "fc-secret-call", finance_status: "awaiting_reconciliation", params_effective: { prompt: "p" } },
    { id: "run-queued", user_id: CALLER, status: "queued", template_version: "minimax-h3@1", runtime: "h3-video@1", modal_call_id: null, finance_status: "reserved", params_effective: { prompt: "p" } },
    { id: "run-theirs", user_id: OTHER, status: "done", template_version: "minimax-h3@1", runtime: "h3-video@1", modal_call_id: "fc-other", finance_status: "awaiting_reconciliation", params_effective: { prompt: "secret" } },
    { id: "run-deleted", user_id: CALLER, status: "done", template_version: "minimax-h3@1", runtime: "h3-video@1", modal_call_id: null, finance_status: "awaiting_reconciliation", params_effective: { deleted_at: "2026-11-22T00:00:00Z" } },
  ];
  assets = ["run-mine", "run-queued", "run-theirs", "run-deleted"].flatMap(run_id => [
    { id: `${run_id}-final`, run_id, role: "final", mime: "video/mp4", storage_key: `private/${run_id}/final.mp4`, withdrawn_at: null },
    { id: `${run_id}-raw`, run_id, role: "raw", mime: "video/mp4", storage_key: `private/${run_id}/raw.mp4`, withdrawn_at: null },
  ]);
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: CALLER, email: "a@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue({
    rpc: (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return Promise.resolve({ error: null }); },
    from: (table: string) => {
      queried.push(table);
      const filters: [string, unknown][] = [], nulls: string[] = [];
      let columns: string[] | null = null;
      // Like the real database: only the selected columns come back.
      const project = (row: Row): Row => columns ? Object.fromEntries(columns.map(c => [c, row[c]])) : row;
      const source = () => (table === "comfy_runs" ? runs : table === "comfy_assets" ? assets : []).filter(row =>
        filters.every(([k, v]) => read(row, k) === v) && nulls.every(k => read(row, k) == null)).map(project);
      const q = {
        select: (cols?: string) => { columns = cols && cols !== "*" ? cols.split(",").map(c => c.trim()) : null; return q; }, in: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        is: (k: string) => { nulls.push(k); return q; },
        single: () => { const found = source()[0]; return Promise.resolve(found ? { data: found, error: null } : { data: null, error: { message: "no rows" } }); },
        then: (resolve: (v: unknown) => void) => resolve({ data: table === "comfy_dispatch_outbox" ? [] : source(), error: null }),
      };
      return q;
    },
  } as unknown as ReturnType<typeof createServiceClient>);
});
const open = (id: string) => GET(new Request("http://localhost/api/admin/comfy/runs/" + id), { params: Promise.resolve({ id }) });

describe("Reopening a generation after a reload", () => {
  it("returns the caller's own finished run with its files, and nothing that is private to the server", async () => {
    const res = await open("run-mine"); const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.run.id).toBe("run-mine");
    expect(body.run.executor_started).toBe(true);
    expect(body.assets.map((a: { id: string }) => a.id).sort()).toEqual(["run-mine-final", "run-mine-raw"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("fc-secret-call");
    expect(text).not.toContain("modal_call_id");
    expect(text).not.toContain("storage_key");
    expect(text).not.toContain("private/");
    expect(text).not.toMatch(/https?:\/\//);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("answers 404, like a missing run, for another account's run, and reads none of its files", async () => {
    const res = await open("run-theirs");
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
    expect(queried).not.toContain("comfy_assets");
  });

  it("treats a deleted generation (tombstone) as missing", async () => {
    expect((await open("run-deleted")).status).toBe(404);
    expect(queried).not.toContain("comfy_assets");
  });

  it("cannot be used to expire someone else's run: the expiry call always carries the caller's id", async () => {
    await open("run-theirs");
    expect(rpcs).toEqual([{ fn: "expire_comfy_admin_run", args: { p_run: "run-theirs", p_user: CALLER } }]);
  });

  it("lists files only once the run is finished", async () => {
    const body = await (await open("run-queued")).json();
    expect(body.run.status).toBe("queued");
    expect(body.assets).toEqual([]);
  });

  it("refuses a non-admin before touching the database", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("Denied", { status: 403 }) as never });
    expect((await open("run-mine")).status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
