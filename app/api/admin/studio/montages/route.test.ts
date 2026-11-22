import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DELETE, GET, POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { buildMontage } from "@/lib/montage/build";
import { MontageError } from "@/lib/montage/mp4-info";
import { montageFileName, montagePath } from "@/lib/montage/files";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/montage/build", () => ({ buildMontage: vi.fn() }));

const R = (n: number) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
const A = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
const OUT = Buffer.from("montage-bytes");

let runs: Record<string, unknown>[]; let assets: Record<string, unknown>[];
let objects: Map<string, Buffer>; let downloads: string[]; let downloadFails: boolean; let uploadFails: boolean;
const filters: string[] = []; const tables: string[] = []; const writes: string[] = []; const signedWith: unknown[] = []; const lists: string[] = [];

function fake() {
  const storage = { from: (bucket: string) => ({
    download: (key: string) => { downloads.push(`${bucket}:${key}`); const b = objects.get(`${bucket}:${key}`); return Promise.resolve(downloadFails || !b ? { data: null, error: { message: "x" } } : { data: new Blob([new Uint8Array(b)]), error: null }); },
    list: (dir: string) => { lists.push(dir); return Promise.resolve({ data: [...objects.keys()].filter(k => k.startsWith(`${bucket}:${dir}/`)).map(k => ({ name: k.slice(bucket.length + dir.length + 2), created_at: "2026-11-22T10:00:00Z", metadata: { size: objects.get(k)!.length } })), error: null }); },
    upload: (path: string, body: Buffer, opts: unknown) => { writes.push(`upload:${bucket}:${path}:${JSON.stringify(opts)}`); if (uploadFails) return Promise.resolve({ error: { message: "x" } }); objects.set(`${bucket}:${path}`, Buffer.from(body)); return Promise.resolve({ error: null }); },
    remove: (paths: string[]) => { writes.push(`remove:${bucket}:${paths.join(",")}`); for (const p of paths) objects.delete(`${bucket}:${p}`); return Promise.resolve({ error: null }); },
    createSignedUrl: (p: string, _s: number, opts?: unknown) => { signedWith.push(opts); return Promise.resolve({ data: { signedUrl: `https://signed/${p}` }, error: null }); },
    createSignedUrls: (ps: string[]) => Promise.resolve({ data: ps.map(p => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }),
  }) };
  const from = (table: string) => {
    tables.push(table);
    const f: Record<string, unknown> = {}; let ids: unknown[] | null = null;
    const rows = () => (table === "comfy_runs" ? runs : assets);
    const q: Record<string, unknown> = {
      select: () => q,
      in: (_k: string, v: unknown[]) => { ids = v; return q; },
      eq: (k: string, v: unknown) => { filters.push(`${table}.${k}=${v}`); f[k] = v; return q; },
      is: (k: string) => { filters.push(`${table}.${k}=null`); return q; },
      insert: () => { writes.push(`insert:${table}`); return q; }, update: () => { writes.push(`update:${table}`); return q; }, delete: () => { writes.push(`delete:${table}`); return q; },
      then: (resolve: (v: unknown) => void) => resolve({ data: rows().filter(r => (ids === null || ids.includes(r.id) || ids.includes(r.run_id)) && Object.entries(f).every(([k, v]) => r[k] === v)), error: null }),
    };
    return q;
  };
  return { storage, from, rpc: () => { writes.push("rpc"); return Promise.resolve({ error: null }); } } as unknown as ReturnType<typeof createServiceClient>;
}

const post = (body: unknown) => POST(new Request("http://x/api/admin/studio/montages", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const ok = () => ({ run_ids: [R(1), R(2), R(3)] });

beforeEach(() => {
  vi.clearAllMocks(); filters.length = 0; tables.length = 0; writes.length = 0; signedWith.length = 0; lists.length = 0; downloads = []; downloadFails = false; uploadFails = false;
  runs = [1, 2, 3].map(n => ({ id: R(n), user_id: "me", status: "done", template_version: "minimax-h3@1" }));
  assets = [1, 2, 3].flatMap(n => ["final", "raw"].map(role => ({ id: A(n), run_id: R(n), owner_id: "me", role, mime: "video/mp4", storage_key: `me/${R(n)}/${role}.mp4` })));
  objects = new Map([1, 2, 3].flatMap(n => ["final", "raw"].map(role => [`comfy-outputs:me/${R(n)}/${role}.mp4`, Buffer.from(`${role}-${n}`)] as [string, Buffer])));
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "me", email: "a@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue(fake());
  vi.mocked(buildMontage).mockResolvedValue({ bytes: OUT, frames: 372, durationS: 15.5007, clips: 3 });
});

describe("making a montage", () => {
  it("is admin only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await post(ok())).status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("joins the corrected clips in the order given and stores one private file under the administrator's own folder", async () => {
    const res = await post({ ...ok(), run_ids: [R(2), R(3), R(1)], name: "Luz test" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ frames: 372, clips: 3, audio: "corrected", duration_s: 15.501 });
    expect(body.item.name).toBe("Luz test");
    const clips = vi.mocked(buildMontage).mock.calls[0][0].map(c => Buffer.from(c).toString());
    expect(clips).toEqual(["final-2", "final-3", "final-1"]);
    expect(downloads).toEqual([`comfy-outputs:me/${R(2)}/final.mp4`, `comfy-outputs:me/${R(3)}/final.mp4`, `comfy-outputs:me/${R(1)}/final.mp4`]);
    const up = writes.filter(w => w.startsWith("upload:"));
    expect(up).toHaveLength(1);
    expect(up[0]).toMatch(/^upload:comfy-outputs:me\/montages\/[0-9a-f]+_[0-9a-f-]{36}\.mp4:\{"contentType":"video\/mp4","upsert":false\}$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("uses the original audio when asked, and a dated default name otherwise", async () => {
    const res = await post({ ...ok(), audio: "original" });
    expect((await res.json())).toMatchObject({ audio: "original" });
    expect(filters).toContain("comfy_assets.role=raw");
    expect(downloads.every(d => d.endsWith("/raw.mp4"))).toBe(true);
    const named = await (await post(ok())).json();
    expect(named.item.name).toMatch(/^Montage \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("validates the request before touching anything", async () => {
    const bad: unknown[] = [
      { run_ids: [R(1)] }, { run_ids: "x" }, {}, { run_ids: [R(1), "not-a-uuid"] }, { run_ids: [R(1), R(1)] },
      { run_ids: Array.from({ length: 11 }, (_, i) => `aaaaaaaa-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`) },
      { ...ok(), audio: "both" }, { ...ok(), name: "x".repeat(41) }, "not json",
    ];
    for (const b of bad) expect((await post(b)).status).toBe(400);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(buildMontage).not.toHaveBeenCalled();
  });

  it("scopes runs and files to the caller, excludes deleted runs and withdrawn files", async () => {
    await post(ok());
    expect(filters).toEqual(expect.arrayContaining(["comfy_runs.user_id=me", "comfy_runs.params_effective->>deleted_at=null", "comfy_assets.owner_id=me", "comfy_assets.withdrawn_at=null", "comfy_assets.role=final"]));
  });

  it("refuses another administrator's generation, an unfinished one, an image, or a missing file, naming the position, reading nothing", async () => {
    const cases: [() => void, number][] = [
      [() => { runs[1] = { ...runs[1], user_id: "someone-else" }; }, 2],
      [() => { runs[0] = { ...runs[0], status: "running" }; }, 1],
      [() => { runs[2] = { ...runs[2], template_version: "moss-image@1" }; }, 3],
      [() => { assets = assets.filter(a => a.run_id !== R(2)); }, 2],
    ];
    for (const [mutate, position] of cases) {
      beforeEachReset(); mutate();
      const res = await post(ok());
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe(`Generation ${position} is not a finished video of yours`);
      expect(downloads).toEqual([]);
      expect(buildMontage).not.toHaveBeenCalled();
    }
  });

  it("refuses a file that is not a video", async () => {
    assets = assets.map(a => (a.run_id === R(1) ? { ...a, mime: "image/png" } : a));
    expect((await post(ok())).status).toBe(400);
    expect(downloads).toEqual([]);
  });

  it("limits what is stored and read: 30 montages, a clip size, a total size, unreadable clips", async () => {
    for (let i = 0; i < 30; i++) objects.set(`comfy-outputs:me/montages/${montageFileName(`m${i}`, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)}`, Buffer.from("x"));
    expect((await post(ok())).status).toBe(409);
    beforeEachReset();
    objects.set(`comfy-outputs:me/${R(1)}/final.mp4`, Buffer.alloc(25 * 1024 * 1024 + 1));
    expect((await post(ok())).status).toBe(400);
    expect(buildMontage).not.toHaveBeenCalled();
    beforeEachReset(); downloadFails = true;
    expect((await post(ok())).status).toBe(503);
  });

  it("explains why clips cannot be joined (422, a code), when ffmpeg is missing (501) and hides unexpected details (500)", async () => {
    vi.mocked(buildMontage).mockRejectedValueOnce(new MontageError("different_format", "Clip 2 cannot be joined with clip 1: the picture size differs. Joining different formats needs re-encoding, which is not supported yet."));
    const diff = await post(ok());
    expect(diff.status).toBe(422);
    expect(await diff.json()).toMatchObject({ code: "different_format", error: expect.stringMatching(/re-encoding/) });
    vi.mocked(buildMontage).mockRejectedValueOnce(new MontageError("unavailable", "Joining clips is not available on this server (ffmpeg is not installed).", 501));
    expect((await post(ok())).status).toBe(501);
    vi.mocked(buildMontage).mockRejectedValueOnce(new Error("internal secret path /tmp/x"));
    const boom = await post(ok());
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toMatch(/secret|\/tmp/);
    expect(writes.filter(w => w.startsWith("upload"))).toEqual([]);
  });

  it("reports a failed upload instead of claiming success", async () => {
    uploadFails = true;
    expect((await post(ok())).status).toBe(503);
  });

  it("never touches a gate, a budget, a reservation or a run: reads two tables, writes one file", async () => {
    await post(ok());
    expect([...new Set(tables)].sort()).toEqual(["comfy_assets", "comfy_runs"]);
    expect(writes.some(w => w === "rpc" || /^(insert|update|delete):/.test(w))).toBe(false);
    expect(writes.filter(w => w.startsWith("remove:"))).toEqual([]);
    expect(readFileSync("app/api/admin/studio/montages/route.ts", "utf8")).not.toMatch(/\.rpc\(|comfy_admin_gate|comfy_runtime_gates|committed_usd|dispatch|idempotency|admit_/i);
    // The source clips are only read: still there.
    for (const n of [1, 2, 3]) expect(objects.has(`comfy-outputs:me/${R(n)}/final.mp4`)).toBe(true);
  });
});

function beforeEachReset() {
  filters.length = 0; tables.length = 0; writes.length = 0; downloads = []; downloadFails = false; uploadFails = false; vi.mocked(buildMontage).mockClear();
  runs = [1, 2, 3].map(n => ({ id: R(n), user_id: "me", status: "done", template_version: "minimax-h3@1" }));
  assets = [1, 2, 3].flatMap(n => ["final", "raw"].map(role => ({ id: A(n), run_id: R(n), owner_id: "me", role, mime: "video/mp4", storage_key: `me/${R(n)}/${role}.mp4` })));
  objects = new Map([1, 2, 3].flatMap(n => ["final", "raw"].map(role => [`comfy-outputs:me/${R(n)}/${role}.mp4`, Buffer.from(`${role}-${n}`)] as [string, Buffer])));
}

describe("listing, downloading and deleting montages", () => {
  const ID = "cccccccc-0000-4000-8000-000000000001";
  beforeEach(() => { objects.set(`comfy-outputs:${montagePath("me", montageFileName("Luz test", ID))}`, Buffer.from("m")); objects.set(`comfy-outputs:${montagePath("other", montageFileName("Not mine", "dddddddd-0000-4000-8000-000000000001"))}`, Buffer.from("o")); });

  it("lists only the caller's montages with their names and a short-lived link", async () => {
    const res = await GET(new Request("http://x/api/admin/studio/montages"));
    const body = await res.json();
    expect(lists).toEqual(["me/montages"]);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: ID, name: "Luz test", bytes: 1 });
    expect(body.items[0].url).toMatch(/^https:\/\/signed\/me\/montages\//);
  });

  it("signs a download with a server-built file name, only for the caller's own montage", async () => {
    const res = await GET(new Request(`http://x/api/admin/studio/montages?id=${ID}&download=1`));
    expect(res.status).toBe(200);
    expect(signedWith).toEqual([{ download: `alphogen-Luz-test-cccccccc.mp4` }]);
    expect((await GET(new Request("http://x/api/admin/studio/montages?id=dddddddd-0000-4000-8000-000000000001"))).status).toBe(404);
    expect((await GET(new Request("http://x/api/admin/studio/montages?id=../../x"))).status).toBe(404);
  });

  it("deletes only the caller's montage file, never a source clip", async () => {
    expect((await DELETE(new Request(`http://x/?id=${ID}`, { method: "DELETE" }))).status).toBe(200);
    expect(writes).toEqual([`remove:comfy-outputs:${montagePath("me", montageFileName("Luz test", ID))}`]);
    expect([...objects.keys()].some(k => k.includes(`/${R(1)}/`))).toBe(true);
    expect((await DELETE(new Request(`http://x/?id=dddddddd-0000-4000-8000-000000000001`, { method: "DELETE" }))).status).toBe(404);
    expect((await DELETE(new Request("http://x/?id=nope", { method: "DELETE" }))).status).toBe(400);
  });

  it("is admin only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await GET(new Request("http://x/api/admin/studio/montages"))).status).toBe(403);
    expect((await DELETE(new Request(`http://x/?id=${ID}`, { method: "DELETE" }))).status).toBe(403);
  });
});
