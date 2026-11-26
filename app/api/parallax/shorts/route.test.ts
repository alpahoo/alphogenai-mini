import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { isModuleEnabled } from "@/lib/parallax-modules";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/parallax-modules", () => ({ isModuleEnabled: vi.fn() }));

const RUN = "0b6c1f0e-5d7a-4c55-9a43-1f2b3c4d5e6f";
const upstream = vi.fn();
const request = (body: unknown) => new Request("http://localhost/api/parallax/shorts", {
  method: "POST", headers: { "Content-Type": "application/json", cookie: "sb=session" }, body: JSON.stringify(body),
}) as unknown as Parameters<typeof POST>[0];
const sent = () => {
  const [url, init] = upstream.mock.calls[0] as [URL, RequestInit];
  return { path: new URL(url).pathname, init, body: JSON.parse(String(init.body)) };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } } as never);
  vi.mocked(isModuleEnabled).mockResolvedValue(true);
  upstream.mockResolvedValue(new Response(JSON.stringify({ run_id: RUN, dispatched: true }), { status: 202 }));
  vi.stubGlobal("fetch", upstream);
  vi.stubEnv("COMFY_H3_LONG_ENABLED", "true");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Parallax Shorts with MiniMax H3", () => {
  it("admits a 480p Short through the Studio H3 pilot, never through /api/jobs", async () => {
    const response = await POST(request({ prompt: "A chef plates a dessert", target_duration_seconds: 10, engine: "h3_turbo_480" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ run_id: RUN, dispatched: true, redirect: `/admin/studio?model=minimax-h3&run=${RUN}` });
    expect(upstream).toHaveBeenCalledTimes(1);
    const { path, init, body } = sent();
    expect(path).toBe("/api/admin/comfy/runs");
    expect((init.headers as Record<string, string>).cookie).toBe("sb=session");
    expect(body.template).toBe("minimax-h3");
    expect(body.idempotency_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.params).toEqual({ prompt: "A chef plates a dessert", seconds: 10, aspect: "9:16", quality: "turbo", resolution: "480p" });
  });

  it("caps a 704p Short at 5 s", async () => {
    await POST(request({ prompt: "A chef plates a dessert", target_duration_seconds: 10, engine: "h3_turbo_704" }));
    expect(sent().body.params).toMatchObject({ seconds: 5, resolution: "704p" });
  });

  it.each([["h3_turbo_704", 5], ["h3_turbo_480", 10]])("refuses %s %i s before admission while the long executor is off", async (engine, seconds) => {
    vi.stubEnv("COMFY_H3_LONG_ENABLED", "");
    const response = await POST(request({ prompt: "A chef plates a dessert", target_duration_seconds: seconds, engine }));
    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("still admits 480p 5 s while the long executor is off", async () => {
    vi.stubEnv("COMFY_H3_LONG_ENABLED", "");
    expect((await POST(request({ prompt: "A chef plates a dessert", target_duration_seconds: 5, engine: "h3_turbo_480" }))).status).toBe(202);
    expect(sent().body.params).toMatchObject({ seconds: 5, resolution: "480p" });
  });

  it("passes the pilot's refusal through (not admin, gate closed, budget, active job)", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ error: "Admission refused: authorization, budget, quota or active job" }), { status: 409 }));
    const response = await POST(request({ prompt: "A chef plates a dessert", engine: "h3_turbo_480" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Admission refused/);
  });

  it("starts nothing when the module is off for this viewer", async () => {
    vi.mocked(isModuleEnabled).mockResolvedValue(false);
    expect((await POST(request({ prompt: "A chef plates a dessert", engine: "h3_turbo_480" }))).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps LTX-2.5 on the jobs pipeline", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ job: { id: "job-1" } }), { status: 201 }));
    await POST(request({ prompt: "A chef plates a dessert", target_duration_seconds: 10, engine: "ltx_2_5" }));
    const { path, body } = sent();
    expect(path).toBe("/api/jobs");
    expect(body).toMatchObject({ preferred_engine: "ltx_2_5", num_scenes: 1, aspect_ratio: "9:16", target_duration_seconds: 10 });
  });
});
