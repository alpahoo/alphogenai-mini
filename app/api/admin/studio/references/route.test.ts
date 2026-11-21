import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { fileNameFor } from "@/lib/studio/reference-library";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const ID1 = "11111111-1111-4111-8111-111111111111", ID2 = "22222222-2222-4222-8222-222222222222";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let files: { name: string; created_at: string }[] = [];
let busyRuns: { id: string }[] = [];
let uploadFails = false, thumbUploadFails = false;
const log: string[] = []; const listed: string[] = [];

beforeEach(() => {
  vi.clearAllMocks(); log.length = 0; listed.length = 0; uploadFails = false; thumbUploadFails = false; busyRuns = [];
  files = [{ name: fileNameFor("Luz", ID1, "png"), created_at: "2026-11-21T10:00:00Z" }, { name: "thumbs", created_at: "" }, { name: "stray.txt", created_at: "" }];
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "me", email: "a@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue({
    storage: { from: () => ({
      list: (dir: string) => { listed.push(dir); return Promise.resolve({ data: files, error: null }); },
      createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map(p => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }),
      createSignedUrl: (p: string) => Promise.resolve({ data: { signedUrl: `https://signed/${p}` }, error: null }),
      upload: (p: string) => { log.push(`upload:${p}`); return Promise.resolve({ error: (p.includes("/thumbs/") ? thumbUploadFails : uploadFails) ? { message: "x" } : null }); },
      remove: (ps: string[]) => { log.push(`remove:${ps.join(",")}`); return Promise.resolve({ error: null }); },
    }) },
    from: (table: string) => { log.push(`from:${table}`); const q = { select: () => q, eq: () => q, in: () => q, limit: () => Promise.resolve({ data: busyRuns, error: null }) }; return q; },
  } as unknown as ReturnType<typeof createServiceClient>);
});

const post = (fields: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return POST(new Request("http://x/api/admin/studio/references", { method: "POST", body: f })); };
const png = () => new File([PNG], "luz.png", { type: "image/png" });

describe("reference library API", () => {
  it("is admin only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await GET()).status).toBe(403);
    expect((await post({ file: png(), name: "x" })).status).toBe(403);
    expect((await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }))).status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("lists only well-formed library files of the caller, with name and private thumbnail link, never the folder from the request", async () => {
    const res = await GET(); const body = await res.json();
    expect(listed).toEqual(["me/library"]);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: ID1, name: "Luz", path: `me/library/${fileNameFor("Luz", ID1, "png")}` });
    expect(body.items[0].thumb_url).toMatch(/^https:\/\/signed\/me\/library\/thumbs\//);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("saves an image with its name and a thumbnail, in the caller's own folder", async () => {
    const res = await post({ file: png(), name: "  Luz plage " });
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.name).toBe("Luz plage");
    expect(item.path).toMatch(/^me\/library\/[0-9a-f]+_[0-9a-f-]{36}\.png$/);
    expect(log.filter(l => l.startsWith("upload:"))).toHaveLength(2);
    expect(log.some(l => l.startsWith("upload:me/library/thumbs/"))).toBe(true);
  });

  it("refuses a missing name, a non-image, a duplicate name and a full library", async () => {
    expect((await post({ file: png(), name: "   " })).status).toBe(400);
    expect((await post({ file: new File(["not an image"], "x.png", { type: "image/png" }), name: "X" })).status).toBe(400);
    expect((await post({ file: png(), name: "luz" })).status).toBe(409); // "Luz" exists (case-insensitive)
    files = Array.from({ length: 60 }, (_, i) => ({ name: fileNameFor(`n${i}`, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, "png"), created_at: "" }));
    expect((await post({ file: png(), name: "New" })).status).toBe(409);
    expect(log.some(l => l.startsWith("upload:"))).toBe(false);
  });

  it("removes the original when the thumbnail cannot be saved (no half-saved reference)", async () => {
    thumbUploadFails = true;
    expect((await post({ file: png(), name: "Luz 2" })).status).toBe(503);
    expect(log.some(l => l.startsWith("remove:me/library/") && !l.includes("/thumbs/"))).toBe(true);
  });

  it("deletes a reference and its thumbnail", async () => {
    const res = await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    const file = fileNameFor("Luz", ID1, "png");
    expect(log).toContain(`remove:me/library/${file},me/library/thumbs/${file.replace(".png", ".webp")}`);
  });

  it("refuses to delete while a queued or running generation uses the reference", async () => {
    busyRuns = [{ id: "r" }];
    const res = await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(log.some(l => l.startsWith("remove:"))).toBe(false);
  });

  it("answers 404 for a reference that is not in the caller's library and 400 for a malformed id", async () => {
    expect((await DELETE(new Request(`http://x/?id=${ID2}`, { method: "DELETE" }))).status).toBe(404);
    expect((await DELETE(new Request("http://x/?id=../../etc", { method: "DELETE" }))).status).toBe(400);
    expect(log.some(l => l.startsWith("remove:"))).toBe(false);
  });
});
