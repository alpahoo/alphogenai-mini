import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { audioFileName, audioPath } from "@/lib/avatar/audio-library";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const ID1 = "11111111-1111-4111-8111-111111111111";

function wav(seconds: number, rate = 16000): Uint8Array {
  const data = Math.round(seconds * rate * 2), b = new Uint8Array(44 + data), v = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  tag(0, "RIFF"); v.setUint32(4, 36 + data, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, data, true);
  return b;
}
let files: { name: string; created_at: string }[] = [];
let activeRuns: { id: string }[] = [];
let activeGraph: unknown = null;
let uploadFails = false;
const log: string[] = [];

beforeEach(() => {
  vi.clearAllMocks(); log.length = 0; uploadFails = false; activeRuns = []; activeGraph = null;
  files = [{ name: audioFileName("Luz", ID1, "wav"), created_at: "2026-11-23T10:00:00Z" }, { name: "stray.txt", created_at: "" }];
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "me", email: "a@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue({
    storage: { from: () => ({
      list: () => Promise.resolve({ data: files, error: null }),
      createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map(p => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }),
      createSignedUrl: (p: string) => Promise.resolve({ data: { signedUrl: `https://signed/${p}` }, error: null }),
      upload: (p: string) => { log.push(`upload:${p}`); return Promise.resolve({ error: uploadFails ? { message: "x" } : null }); },
      remove: (ps: string[]) => { log.push(`remove:${ps.join(",")}`); return Promise.resolve({ error: null }); },
    }) },
    from: (table: string) => {
      log.push(`from:${table}`);
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, single: () => Promise.resolve({ data: { resolved_graph: activeGraph }, error: null }),
        in: () => Promise.resolve({ data: activeRuns, error: null }),
      };
      return q;
    },
  } as unknown as ReturnType<typeof createServiceClient>);
});

const post = (fields: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return POST(new Request("http://x/api/admin/studio/audio", { method: "POST", body: f })); };
const wavFile = (s: number) => new File([wav(s) as BlobPart], "v.wav", { type: "audio/wav" });

describe("audio library API", () => {
  it("is admin only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await GET()).status).toBe(403);
    expect((await post({ file: wavFile(5), name: "x" })).status).toBe(403);
    expect((await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }))).status).toBe(403);
    expect(log).toEqual([]);
  });
  it("lists only well-formed files of the caller's folder with signed links, no-store", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: ID1, name: "Luz", ext: "wav", path: audioPath("me", audioFileName("Luz", ID1, "wav")) });
    expect(body.items[0].url).toContain("https://signed/me/audio-library/");
    expect(body.max_seconds).toBe(10);
  });
  it("adds a valid WAV under the caller's own folder", async () => {
    const res = await post({ file: wavFile(9.72), name: "Luz intro" });
    expect(res.status).toBe(201);
    expect(log.some(l => l.startsWith("upload:me/audio-library/"))).toBe(true);
  });
  it.each([
    ["too long", wavFile(10.5), "Luz intro", 400],
    ["too short", wavFile(0.4), "Luz intro", 400],
    ["no name", wavFile(5), " ", 400],
    ["duplicate name (case-insensitive)", wavFile(5), "LUZ", 409],
    ["not audio", new File([new Uint8Array(2000)], "x.wav", { type: "audio/wav" }), "Other", 400],
    ["oversized", new File([new Uint8Array(3 * 1024 * 1024 + 1)], "x.wav"), "Other", 400],
  ])("refuses %s before any upload", async (_n, file, name, status) => {
    expect((await post({ file, name })).status).toBe(status);
    expect(log.some(l => l.startsWith("upload:"))).toBe(false);
  });
  it("reports a storage failure", async () => { uploadFails = true; expect((await post({ file: wavFile(5), name: "Fresh" })).status).toBe(503); });
  it("deletes an unused audio", async () => {
    const res = await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(log).toContain(`remove:${audioPath("me", audioFileName("Luz", ID1, "wav"))}`);
  });
  it("refuses to delete an audio used by a queued or running render", async () => {
    activeRuns = [{ id: "run-1" }];
    activeGraph = { "1": { inputs: { audio_path: audioPath("me", audioFileName("Luz", ID1, "wav")) } } };
    const res = await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(log.some(l => l.startsWith("remove:"))).toBe(false);
  });
  it("deletes when the active render uses another audio", async () => {
    activeRuns = [{ id: "run-1" }];
    activeGraph = { "1": { inputs: { audio_path: audioPath("me", audioFileName("Other", "33333333-3333-4333-8333-333333333333", "wav")) } } };
    expect((await DELETE(new Request(`http://x/?id=${ID1}`, { method: "DELETE" }))).status).toBe(200);
  });
  it("rejects a malformed id and an unknown id", async () => {
    expect((await DELETE(new Request("http://x/?id=../../x", { method: "DELETE" }))).status).toBe(400);
    expect((await DELETE(new Request("http://x/?id=44444444-4444-4444-8444-444444444444", { method: "DELETE" }))).status).toBe(404);
  });
});
