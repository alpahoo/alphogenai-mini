import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = { id: "user-1" };

type Result = { data?: unknown; error?: unknown };
type State = { table: string; op: string; filters: Record<string, unknown>; payload: unknown };

function makeService(routes: Record<string, (s: State) => Result>, calls: State[] = []) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined };
    const run = () => {
      calls.push({ ...st });
      return Promise.resolve(routes[`${st.table}:${st.op}`]?.(st) ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {
      select: () => b,
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      delete: () => { st.op = "delete"; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const ctx = (id = "p1", segmentId = "s1") => ({ params: Promise.resolve({ id, segmentId }) });
const req = (body?: unknown) => ({ url: "http://localhost", json: async () => body ?? {} } as never);

const OLD_SEGMENT = {
  id: "s1",
  podcast_id: "p1",
  speaker_id: "host-id",
  order_index: 0,
  text: "Old line.",
  audio_url: "https://cdn.example.com/old.mp3",
  start_ms: 0,
  end_ms: 1000,
  status: "ready",
};

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/podcasts/[id]/segments/[segmentId]", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const res = await PATCH(req({ text: "New line" }), ctx());
    expect(res.status).toBe(401);
  });

  it("404 when podcast is not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }),
      }) as never,
    );
    const res = await PATCH(req({ text: "New line" }), ctx());
    expect(res.status).toBe(404);
  });

  it("400 on invalid text", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
      }) as never,
    );
    const res = await PATCH(req({ text: "   " }), ctx());
    expect(res.status).toBe(400);
  });

  it("returns unchanged without clearing audio when text is identical", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: OLD_SEGMENT, error: null }),
      }, calls) as never,
    );

    const res = await PATCH(req({ text: "Old line." }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unchanged).toBe(true);
    expect(calls.some((c) => c.table === "podcasts" && c.op === "update")).toBe(false);
    expect(calls.some((c) => c.table === "podcast_segments" && c.op === "update")).toBe(false);
  });

  it("clears stale render before mutating the segment", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: OLD_SEGMENT, error: null }),
        "podcasts:update": () => ({ data: null, error: null }),
        "podcast_segments:update": (s) => ({ data: { ...OLD_SEGMENT, ...(s.payload as object) }, error: null }),
      }, calls) as never,
    );

    const res = await PATCH(req({ text: "New tighter line." }), ctx());
    expect(res.status).toBe(200);
    const resetIndex = calls.findIndex((c) => c.table === "podcasts" && c.op === "update");
    const segmentIndex = calls.findIndex((c) => c.table === "podcast_segments" && c.op === "update");
    expect(resetIndex).toBeGreaterThanOrEqual(0);
    expect(segmentIndex).toBeGreaterThan(resetIndex);
    expect(calls[resetIndex].payload).toMatchObject({ video_url: null, render_status: "idle", render_error: null });
    expect(calls[segmentIndex].payload).toMatchObject({
      text: "New tighter line.",
      audio_url: null,
      start_ms: null,
      end_ms: null,
      status: "pending",
    });
  });

  it("500s without segment mutation when render reset fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: OLD_SEGMENT, error: null }),
        "podcasts:update": () => ({ data: null, error: { message: "db boom" } }),
      }, calls) as never,
    );

    const res = await PATCH(req({ text: "New line" }), ctx());
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.table === "podcast_segments" && c.op === "update")).toBe(false);
  });
});

describe("DELETE /api/podcasts/[id]/segments/[segmentId]", () => {
  const segList = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i === 0 ? "s1" : `s${i + 1}` }));

  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await DELETE(req(), ctx())).status).toBe(401);
  });

  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    expect((await DELETE(req(), ctx())).status).toBe(404);
  });

  it("404 when the segment is not in the podcast", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: [{ id: "other" }, { id: "x" }, { id: "y" }], error: null }),
      }) as never,
    );
    expect((await DELETE(req(), ctx("p1", "s1"))).status).toBe(404);
  });

  it("400 when only 2 segments remain", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: segList(2), error: null }),
      }, calls) as never,
    );
    const res = await DELETE(req(), ctx("p1", "s1"));
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("deletes the line and resets the render when >2 remain", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: segList(3), error: null }),
        "podcasts:update": () => ({ data: null, error: null }),
        "podcast_segments:delete": () => ({ data: null, error: null }),
      }, calls) as never,
    );
    const res = await DELETE(req(), ctx("p1", "s1"));
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.table === "podcasts" && c.op === "update")).toBe(true);
    expect(calls.some((c) => c.table === "podcast_segments" && c.op === "delete")).toBe(true);
  });

  it("500 without deleting when the render reset fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_segments:select": () => ({ data: segList(3), error: null }),
        "podcasts:update": () => ({ data: null, error: { message: "boom" } }),
      }, calls) as never,
    );
    const res = await DELETE(req(), ctx("p1", "s1"));
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });
});
