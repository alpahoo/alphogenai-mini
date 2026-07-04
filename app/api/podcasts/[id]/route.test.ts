import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, PATCH, DELETE } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = { id: "user-1" };

type Result = { data?: unknown; error?: unknown };
type State = { table: string; op: string; filters: Record<string, unknown>; payload: unknown };

function makeService(routes: Record<string, (s: State) => Result>) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined };
    const run = () => Promise.resolve(routes[`${st.table}:${st.op}`]?.(st) ?? { data: null, error: null });
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (rows: unknown) => { st.op = "insert"; st.payload = rows; return b; },
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      delete: () => { st.op = "delete"; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      order: () => b,
      range: () => b,
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => ({ url: "http://localhost", json: async () => body ?? {} } as never);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/podcasts/[id]", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const res = await GET(req(), ctx("p1"));
    expect(res.status).toBe(401);
  });

  it("404 when the podcast belongs to another user", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "someone-else" }, error: null }) }) as never,
    );
    const res = await GET(req(), ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("404 when the podcast does not exist", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: null, error: { message: "no rows" } }) }) as never,
    );
    const res = await GET(req(), ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("returns podcast + speakers + segments when owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_speakers:select": () => ({ data: [{ id: "s1" }, { id: "s2" }], error: null }),
        "podcast_segments:select": () => ({ data: [{ id: "seg1" }], error: null }),
      }) as never,
    );
    const res = await GET(req(), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.podcast.id).toBe("p1");
    expect(json.speakers).toHaveLength(2);
    expect(json.segments).toHaveLength(1);
  });
});

describe("PATCH /api/podcasts/[id]", () => {
  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    const res = await PATCH(req({ title: "New" }), ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("rejects an invalid layout", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }) }) as never,
    );
    const res = await PATCH(req({ layout: "hexagon" }), ctx("p1"));
    expect(res.status).toBe(400);
  });

  it("updates an owned podcast", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcasts:update": () => ({ data: { id: "p1", user_id: USER.id, title: "New" }, error: null }),
      }) as never,
    );
    const res = await PATCH(req({ title: "New" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("New");
  });

  // T-1141 — style persistence + rename invariants
  it("persists podcast_style into metadata (merged)", async () => {
    let payload: Record<string, unknown> | undefined;
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, metadata: { keep: 1 } }, error: null }),
        "podcasts:update": (s) => { payload = s.payload as Record<string, unknown>; return { data: { id: "p1" }, error: null }; },
      }) as never,
    );
    const res = await PATCH(req({ podcast_style: "news" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(payload?.metadata).toEqual({ keep: 1, podcast_style: "news" });
  });

  it("rejects an invalid podcast_style", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, metadata: {} }, error: null }) }) as never,
    );
    expect((await PATCH(req({ podcast_style: "opera" }), ctx("p1"))).status).toBe(400);
  });

  it("rename does not clear the rendered video", async () => {
    let payload: Record<string, unknown> | undefined;
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, metadata: {} }, error: null }),
        "podcasts:update": (s) => { payload = s.payload as Record<string, unknown>; return { data: { id: "p1" }, error: null }; },
      }) as never,
    );
    await PATCH(req({ title: "Renamed" }), ctx("p1"));
    expect(payload).toBeDefined();
    expect("video_url" in payload!).toBe(false);
    expect("render_status" in payload!).toBe(false);
  });
});

describe("DELETE /api/podcasts/[id] (archive)", () => {
  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    expect((await DELETE(req(), ctx("p1"))).status).toBe(404);
  });

  it("archives an owned podcast (status=archived)", async () => {
    let payload: Record<string, unknown> | undefined;
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcasts:update": (s) => { payload = s.payload as Record<string, unknown>; return { data: null, error: null }; },
      }) as never,
    );
    const res = await DELETE(req(), ctx("p1"));
    expect(res.status).toBe(200);
    expect(payload?.status).toBe("archived");
  });
});
