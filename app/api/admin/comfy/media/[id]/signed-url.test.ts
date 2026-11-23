import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Video lot acceptance: private downloads. A signed URL is a short-lived capability issued on request:
 * every request signs a fresh one, nothing is stored, and a run that is not the caller's finished run gives none.
 */
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const sign = vi.fn();
const writes: string[] = [];
let asset: Record<string, unknown> | null;
let run: Record<string, unknown> | null;
const filters: string[] = [];
beforeEach(() => {
  vi.clearAllMocks(); writes.length = 0; filters.length = 0;
  asset = { storage_key: "private/run/final.mp4", run_id: "11111111-aaaa", role: "final", mime: "video/mp4" };
  run = { status: "done" };
  let n = 0;
  sign.mockImplementation(async () => ({ data: { signedUrl: `https://private.example/signed-${++n}` }, error: null }));
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "owner", email: "admin@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: string) => { filters.push(`${table}.${k}=${v}`); return q; },
        is: () => q,
        single: async () => ({ data: table === "comfy_assets" ? asset : run }),
      };
      // Any write would be recorded: a signed URL must never be persisted.
      for (const w of ["insert", "update", "upsert", "delete"]) q[w] = () => { writes.push(`${table}.${w}`); return q; };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: sign }) },
  } as unknown as ReturnType<typeof createServiceClient>);
});
const get = (qs = "") => GET(new Request("http://localhost/api/admin/comfy/media/a" + qs), { params: Promise.resolve({ id: "a" }) });

describe("Private video downloads", () => {
  it("signs a new short-lived URL for every request and stores nothing (renewal after expiry)", async () => {
    const first = await (await get()).json(); const second = await (await get()).json();
    expect(first.url).not.toBe(second.url);
    expect(sign).toHaveBeenCalledTimes(2);
    for (const call of sign.mock.calls) expect(call[1]).toBe(600);
    expect(first.expires_in).toBe(600);
    expect(writes).toEqual([]);
  });

  it("scopes both the file and its run to the caller", async () => {
    await get();
    expect(filters).toContain("comfy_assets.owner_id=owner");
    expect(filters).toContain("comfy_runs.user_id=owner");
  });

  it("gives no link when the run behind the file is not the caller's (the lookup finds nothing)", async () => {
    run = null;
    const res = await get();
    expect(res.status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });

  it("names the Corrected and Original downloads on the server, never from the request", async () => {
    await get("?download=1&name=../../evil.mp4");
    expect(sign.mock.calls[0][2]).toEqual({ download: "alphogen-11111111-corrected.mp4" });
    asset = { ...asset, role: "raw" };
    await get("?download=1");
    expect(sign.mock.calls[1][2]).toEqual({ download: "alphogen-11111111-original.mp4" });
  });
});
