import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { triggerRenderPodcast } from "@/lib/modal-client";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/modal-client", () => ({ triggerRenderPodcast: vi.fn() }));

const USER = { id: "user-1" };

type Result = { data?: unknown; error?: unknown };
type State = { table: string; op: string; filters: Record<string, unknown>; payload: unknown };

function makeService(routes: Record<string, (s: State) => Result>, updates: State[] = []) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined };
    const run = () => {
      if (st.op === "update") updates.push({ ...st });
      return Promise.resolve(routes[`${st.table}:${st.op}`]?.(st) ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {
      select: () => b,
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => ({ url: "http://localhost", json: async () => ({}) } as never);

const podcast = (over: Record<string, unknown> = {}) => ({
  id: "p1", user_id: USER.id, layout: "two_shot", render_status: "idle", ...over,
});
const readySegs = [
  { id: "s0", status: "ready", audio_url: "https://cdn/a0.mp3" },
  { id: "s1", status: "ready", audio_url: "https://cdn/a1.mp3" },
];

beforeEach(() => vi.clearAllMocks());

describe("POST /api/podcasts/[id]/render", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(req(), ctx("p1"))).status).toBe(401);
  });

  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: podcast({ user_id: "other" }), error: null }) }) as never,
    );
    expect((await POST(req(), ctx("p1"))).status).toBe(404);
  });

  it("400 for a non two_shot layout (no silent fallback)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: podcast({ layout: "split_screen" }), error: null }) }) as never,
    );
    const res = await POST(req(), ctx("p1"));
    expect(res.status).toBe(400);
    expect(triggerRenderPodcast).not.toHaveBeenCalled();
  });

  it("409 when a render is already in progress", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: podcast({ render_status: "rendering" }), error: null }) }) as never,
    );
    expect((await POST(req(), ctx("p1"))).status).toBe(409);
  });

  it("400 when no segments exist", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: podcast(), error: null }),
        "podcast_segments:select": () => ({ data: [], error: null }),
      }) as never,
    );
    expect((await POST(req(), ctx("p1"))).status).toBe(400);
  });

  it("400 when not all segments are ready", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: podcast(), error: null }),
        "podcast_segments:select": () => ({ data: [readySegs[0], { id: "s1", status: "pending", audio_url: null }], error: null }),
      }) as never,
    );
    const res = await POST(req(), ctx("p1"));
    expect(res.status).toBe(400);
    expect(triggerRenderPodcast).not.toHaveBeenCalled();
  });

  it("202 + marks rendering + triggers Modal when ready", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: podcast(), error: null }),
        "podcast_segments:select": () => ({ data: readySegs, error: null }),
        "podcasts:update": () => ({ data: null, error: null }),
      }, updates) as never,
    );
    vi.mocked(triggerRenderPodcast).mockResolvedValue(undefined);
    const res = await POST(req(), ctx("p1"));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe("rendering");
    expect(triggerRenderPodcast).toHaveBeenCalledWith("p1");
    expect(updates.some((u) => (u.payload as { render_status?: string }).render_status === "rendering")).toBe(true);
  });

  it("502 + render_status failed when the Modal trigger errors", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: podcast(), error: null }),
        "podcast_segments:select": () => ({ data: readySegs, error: null }),
        "podcasts:update": () => ({ data: null, error: null }),
      }, updates) as never,
    );
    vi.mocked(triggerRenderPodcast).mockRejectedValue(new Error("modal down"));
    const res = await POST(req(), ctx("p1"));
    expect(res.status).toBe(502);
    expect(updates.some((u) => (u.payload as { render_status?: string }).render_status === "failed")).toBe(true);
  });
});
