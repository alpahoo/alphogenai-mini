import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST } from "./route";
import { DELETE, GET } from "../route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveTemplate } from "@/lib/comfy/template";
import { fileNameFor, isLibraryPath, parseFileName } from "@/lib/studio/reference-library";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const ASSET = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", RUN = "run-1";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let assets: Record<string, unknown>[]; let runs: Record<string, unknown>[];
let objects: Map<string, Buffer>;      // "bucket:path" -> bytes
let thumbFails = false, downloadFails = false;
const filters: string[] = []; const tables: string[] = []; const calls: string[] = [];

function fake() {
  const storage = { from: (bucket: string) => ({
    download: (key: string) => { calls.push(`download:${bucket}:${key}`); const b = objects.get(`${bucket}:${key}`); return Promise.resolve(downloadFails || !b ? { data: null, error: { message: "x" } } : { data: new Blob([new Uint8Array(b)]), error: null }); },
    list: (dir: string) => Promise.resolve({ data: [...objects.keys()].filter(k => k.startsWith(`${bucket}:${dir}/`) && !k.slice(bucket.length + dir.length + 2).includes("/")).map(k => ({ name: k.slice(bucket.length + dir.length + 2), created_at: "2026-11-22T10:00:00Z" })), error: null }),
    upload: (path: string, body: Buffer) => { calls.push(`upload:${bucket}:${path}`); if (thumbFails && path.includes("/thumbs/")) return Promise.resolve({ error: { message: "x" } }); objects.set(`${bucket}:${path}`, Buffer.from(body)); return Promise.resolve({ error: null }); },
    remove: (paths: string[]) => { calls.push(`remove:${bucket}:${paths.join(",")}`); for (const p of paths) objects.delete(`${bucket}:${p}`); return Promise.resolve({ error: null }); },
    createSignedUrl: (p: string) => Promise.resolve({ data: { signedUrl: `https://signed/${p}` }, error: null }),
    createSignedUrls: (ps: string[]) => Promise.resolve({ data: ps.map(p => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }),
  }) };
  const from = (table: string) => {
    tables.push(table);
    const f: Record<string, unknown> = {}; const rows = () => (table === "comfy_assets" ? assets : runs);
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push(`${table}.${k}=${v}`); f[k] = v; return q; },
      is: (k: string) => { filters.push(`${table}.${k}=null`); return q; },
      in: () => q,
      limit: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({ data: rows().find(r => Object.entries(f).every(([k, v]) => r[k] === v)) ?? null }),
    };
    return q;
  };
  return { storage, from, rpc: (fn: string) => { calls.push(`rpc:${fn}`); return Promise.resolve({ error: null }); } } as unknown as ReturnType<typeof createServiceClient>;
}

const post = (body: unknown) => POST(new Request("http://x/api/admin/studio/references/promote", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const ok = { asset_id: ASSET, name: "Cour de Luz" };
const libFiles = () => [...objects.keys()].filter(k => k.startsWith("references:me/library/") && !k.includes("/thumbs/"));

beforeEach(() => {
  vi.clearAllMocks(); filters.length = 0; tables.length = 0; calls.length = 0; thumbFails = false; downloadFails = false;
  assets = [{ id: ASSET, owner_id: "me", run_id: RUN, storage_key: "me/run-1/raw.png", mime: "image/png", role: "raw" }];
  runs = [{ id: RUN, user_id: "me", status: "done" }];
  objects = new Map([["comfy-outputs:me/run-1/raw.png", PNG]]);
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "me", email: "a@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue(fake());
});

describe("promote an image result to the reference library", () => {
  it("is admin only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await post(ok)).status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("copies a finished image of the caller into the library under their own folder, with a thumbnail", async () => {
    const res = await post(ok);
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.name).toBe("Cour de Luz");
    expect(item.path).toMatch(/^me\/library\/[0-9a-f]+_[0-9a-f-]{36}\.png$/);
    expect(isLibraryPath("me", item.path)).toBe(true);
    expect(parseFileName(item.path.split("/").pop())?.name).toBe("Cour de Luz");
    expect(libFiles()).toHaveLength(1);
    expect([...objects.keys()].some(k => k.startsWith("references:me/library/thumbs/"))).toBe(true);
    expect(res.headers.get("cache-control")).toContain("no-store");
    // The storage path is built by the server: nothing from the request is used in it.
    expect(calls.filter(c => c.startsWith("upload:")).every(c => c.startsWith("upload:references:me/library/"))).toBe(true);
  });

  it("only reads the result file: the original stays, nothing is removed from the output bucket", async () => {
    await post(ok);
    expect(objects.has("comfy-outputs:me/run-1/raw.png")).toBe(true);
    expect(calls.some(c => c.startsWith("remove:comfy-outputs"))).toBe(false);
    expect(calls.filter(c => c.startsWith("download:"))).toEqual(["download:comfy-outputs:me/run-1/raw.png"]);
  });

  it("scopes the asset and its run to the caller, excluding withdrawn assets and deleted runs", async () => {
    await post(ok);
    expect(filters).toEqual(expect.arrayContaining(["comfy_assets.owner_id=me", "comfy_assets.withdrawn_at=null", "comfy_runs.user_id=me", "comfy_runs.params_effective->>deleted_at=null"]));
  });

  it("refuses another administrator's image exactly like a missing one, without reading any file", async () => {
    assets = [{ ...assets[0], owner_id: "someone-else" }];
    const res = await post(ok);
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
    expect(libFiles()).toHaveLength(0);
  });

  it("refuses an image whose run is not finished or belongs to someone else", async () => {
    for (const run of [{ ...runs[0], status: "running" }, { ...runs[0], status: "failed" }, { ...runs[0], user_id: "other" }]) {
      runs = [run];
      expect((await post(ok)).status).toBe(404);
    }
    expect(calls.filter(c => c.startsWith("download"))).toEqual([]);
  });

  it("refuses a result that is not an image (a video), before reading it", async () => {
    assets = [{ ...assets[0], mime: "video/mp4" }];
    const res = await post(ok);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Only image results/);
    expect(calls.filter(c => c.startsWith("download"))).toEqual([]);
  });

  it("validates the request: malformed id, missing or invalid name, invalid JSON", async () => {
    expect((await post({ asset_id: "../../x", name: "X" })).status).toBe(400);
    expect((await post({ name: "X" })).status).toBe(400);
    expect((await post({ asset_id: ASSET, name: "   " })).status).toBe(400);
    expect((await post({ asset_id: ASSET, name: "x".repeat(41) })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("follows the library rules: unique names, a limit, no half-saved copy", async () => {
    expect((await post(ok)).status).toBe(201);
    expect((await post({ ...ok, name: "cour de luz" })).status).toBe(409);
    for (let i = 0; i < 59; i++) objects.set(`references:me/library/${fileNameFor(`n${i}`, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, "png")}`, PNG);
    expect((await post({ ...ok, name: "One more" })).status).toBe(409);
    objects = new Map([["comfy-outputs:me/run-1/raw.png", PNG]]); thumbFails = true; calls.length = 0;
    expect((await post(ok)).status).toBe(503);
    expect(libFiles()).toHaveLength(0);
  });

  it("reports an unreadable or oversized result instead of saving it", async () => {
    downloadFails = true;
    expect((await post(ok)).status).toBe(503);
    downloadFails = false; objects.set("comfy-outputs:me/run-1/raw.png", Buffer.from("not an image"));
    expect((await post(ok)).status).toBe(400);
    objects.set("comfy-outputs:me/run-1/raw.png", Buffer.alloc(10 * 1024 * 1024 + 1));
    const res = await post(ok);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 MB/);
    expect(libFiles()).toHaveLength(0);
  });

  it("never touches a gate, a budget, a reservation or any RPC, and starts nothing", async () => {
    await post(ok);
    expect(calls.some(c => c.startsWith("rpc"))).toBe(false);
    expect([...new Set(tables)].sort()).toEqual(["comfy_assets", "comfy_runs"]);
    for (const f of ["app/api/admin/studio/references/promote/route.ts", "lib/studio/reference-library-store.ts", "components/studio/promote-reference.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\.rpc\(|comfy_admin_gate|comfy_runtime_gates|committed_usd|dispatch|idempotency|admit_|generate\(/i);
    }
  });
});

describe("the promoted copy behaves like any library image and H3 accepts it", () => {
  it("is listed, then deleted with the library's own delete, independently of its source run", async () => {
    const { item } = await (await post(ok)).json();
    const list = await (await GET()).json();
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([item.id]);
    expect((await DELETE(new Request(`http://x/?id=${item.id}`, { method: "DELETE" }))).status).toBe(200);
    expect(libFiles()).toHaveLength(0);
    expect(objects.has("comfy-outputs:me/run-1/raw.png")).toBe(true);
  });

  it("is accepted by the unchanged H3 server validation as the first frame, in image-to-video", async () => {
    const { item } = await (await post({ ...ok, name: "Luz" })).json();
    const userId = "me";
    const params = { prompt: "A woman in a sunlit courtyard", aspect: "9:16", seconds: 5, quality: "turbo", audio_shift_s: 0.4, first_frame_path: item.path };
    const server = resolveTemplate(params, userId);
    expect(server.referencePath).toBe(item.path);
    expect(server.variant).toBe("i2v");
    expect(() => resolveTemplate(params, "someone-else")).toThrow(/Invalid private reference/);
  });
});
