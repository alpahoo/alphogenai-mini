import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchRun, runtimeGateState } from "@/lib/comfy/admin";
import { audioFileName, audioPath } from "@/lib/avatar/audio-library";
import { fileNameFor, libraryPath } from "@/lib/studio/reference-library";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/comfy/admin", () => ({ dispatchRun: vi.fn(), pilotState: vi.fn(), runtimeGateState: vi.fn(), privateHeaders: { "Cache-Control": "private, no-store" } }));

const ME = "0f8fad5b-d9cb-469f-a165-70867728950e";
const KEY = "c3263425-3a14-4170-a22c-8959566db7ac";
const image = libraryPath(ME, fileNameFor("Luz", "11111111-1111-4111-8111-111111111111", "png"));
const audio = audioPath(ME, audioFileName("Luz intro", "22222222-2222-4222-8222-222222222222", "wav"));
const rpc = vi.fn();
const missing = new Set<string>();
const signedUrl = vi.fn((path: string) => Promise.resolve(missing.has(path) ? { data: null, error: { message: "nf" } } : { data: { signedUrl: `https://signed/${path}` }, error: null }));
const request = (params: unknown = { image_path: image, audio_path: audio, seed: 5 }, key = KEY) =>
  new Request("http://localhost/api/admin/comfy/runs", { method: "POST", body: JSON.stringify({ template: "longcat-avatar", params, idempotency_key: key }) });

beforeEach(() => {
  vi.clearAllMocks(); missing.clear();
  vi.stubEnv("COMFY_LONGCAT_ENABLED", "true"); vi.stubEnv("COMFY_DISPATCH_URL", "https://test.modal.run"); vi.stubEnv("COMFY_DISPATCH_SECRET", "test");
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: ME, email: "admin@example.com" } });
  vi.mocked(createServiceClient).mockReturnValue({ rpc, storage: { from: () => ({ createSignedUrl: signedUrl }) } } as unknown as ReturnType<typeof createServiceClient>);
  rpc.mockResolvedValue({ data: "run-1", error: null }); vi.mocked(dispatchRun).mockResolvedValue(undefined);
});

describe("talking avatar admission", () => {
  it("is off until its own flag is set (the H3 and MOSS flags do not enable it)", async () => {
    vi.stubEnv("COMFY_LONGCAT_ENABLED", ""); vi.stubEnv("COMFY_ADMIN_ENABLED", "true"); vi.stubEnv("COMFY_MOSS_ENABLED", "true");
    expect((await POST(request())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a non-admin before anything else", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("no", { status: 403 }) as never });
    expect((await POST(request())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled(); expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("admits through the dedicated function with the portrait as reference, then dispatches only the run id", async () => {
    const res = await POST(request());
    expect(res.status).toBe(202);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admit_comfy_avatar_run", expect.objectContaining({
      p_user: ME, p_key: KEY, p_image: image, p_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_params: expect.not.objectContaining({ image_path: expect.anything(), audio_path: expect.anything() }),
    }));
    expect(dispatchRun).toHaveBeenCalledWith("run-1");
    expect(await res.json()).toEqual({ run_id: "run-1", dispatched: true });
  });
  it("refuses another user's files, traversal and locked parameters before admission", async () => {
    const other = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    for (const params of [
      { image_path: libraryPath(other, fileNameFor("Luz", "11111111-1111-4111-8111-111111111111", "png")), audio_path: audio },
      { image_path: image, audio_path: audioPath(other, audioFileName("x", "22222222-2222-4222-8222-222222222222", "wav")) },
      { image_path: `${ME}/library/../x.png`, audio_path: audio },
      { image_path: image, audio_path: audio, steps: 50 },
    ]) expect((await POST(request(params))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled(); expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("reserves nothing when the portrait or the audio no longer exists", async () => {
    missing.add(image);
    let res = await POST(request());
    expect(res.status).toBe(400); expect((await res.json()).error).toMatch(/reference|image/i);
    missing.clear(); missing.add(audio);
    res = await POST(request());
    expect(res.status).toBe(400); expect((await res.json()).error).toMatch(/audio/i);
    expect(rpc).not.toHaveBeenCalled(); expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("does not dispatch when SQL refuses (gate, budget, quota, active job)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ACTIVE_JOB" } });
    expect((await POST(request())).status).toBe(409);
    expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("a failed dispatch keeps the durable run and never admits a second render", async () => {
    vi.mocked(dispatchRun).mockRejectedValue(new Error("offline"));
    const res = await POST(request());
    expect(res.status).toBe(202); expect((await res.json()).dispatched).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("a double click (same body, same seed) goes through the SQL duplicate guard with the same hash", async () => {
    await POST(request(undefined, "d3263425-3a14-4170-a22c-8959566db7ac"));
    await POST(request(undefined, "e3263425-3a14-4170-a22c-8959566db7ac"));
    const hashes = rpc.mock.calls.map(c => c[1].p_hash);
    expect(hashes[0]).toBe(hashes[1]);
  });
  it("readiness uses the runtime gate and reports the fixed H100 executor", async () => {
    vi.mocked(runtimeGateState).mockResolvedValue({ ready: false, blockers: [], reason: "pending", allowance: null, licence_confirmed: false, reservation_usd: 0.75 });
    const body = await (await GET(new Request("http://localhost/api/admin/comfy/runs?template=longcat-avatar"))).json();
    expect(runtimeGateState).toHaveBeenCalledWith(ME, "longcat-avatar@1", "COMFY_LONGCAT_ENABLED");
    expect(body.cost).toMatchObject({ gpu: "H100", gpu_source: "executor_code", reservation_usd: 0.75 });
  });
});
