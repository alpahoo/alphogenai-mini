import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const calls: string[] = [];
let runs: unknown[] = [];
let assets: unknown[] = [];
let limitSeen = 0;
beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0;
  runs = [{ id: "r1", status: "done", params_effective: { prompt: "a" } }, { id: "r2", status: "failed", params_effective: {} }];
  assets = [{ id: "a1", run_id: "r1", role: "final", mime: "video/mp4" }, { id: "a2", run_id: "r2", role: "raw", mime: "video/mp4" }];
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "owner", email: "admin@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue({ from: (table: string) => {
    const q = {
      select: () => q, order: () => q, in: () => q,
      eq: (k: string, v: string) => { calls.push(`${table}.${k}=${v}`); return q; },
      is: (k: string) => { calls.push(`${table}.${k}=null`); return q; },
      limit: (n: number) => { limitSeen = n; return Promise.resolve({ data: runs, error: null }); },
      then: (resolve: (v: unknown) => void) => resolve({ data: assets, error: null }),
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
});
