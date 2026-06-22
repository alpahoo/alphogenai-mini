import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = { id: "user-1" };

type Result = { data?: unknown; error?: unknown; count?: number };
type State = { table: string; op: string; filters: Record<string, unknown>; payload: unknown; single: boolean; count: boolean };

function makeService(routes: Record<string, (s: State) => Result>, calls: State[] = []) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined, single: false, count: false };
    const run = () => {
      calls.push({ ...st });
      const fn = routes[`${st.table}:${st.op}`];
      return Promise.resolve(fn ? fn(st) : { data: null, error: null });
    };
    const b: Record<string, unknown> = {
      select: (_c?: unknown, opts?: { count?: string }) => { if (opts?.count) st.count = true; return b; },
      insert: (rows: unknown) => { st.op = "insert"; st.payload = rows; return b; },
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      delete: () => { st.op = "delete"; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      order: () => b,
      range: () => b,
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    // single() must set the flag before running
    b.single = () => { st.single = true; return run(); };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

beforeEach(() => vi.clearAllMocks());

function req(body?: unknown, url = "http://localhost/api/podcasts") {
  return { url, json: async () => body ?? {} } as never;
}

describe("GET /api/podcasts", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("lists only the user's podcasts", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: [{ id: "p1", user_id: USER.id }], error: null, count: 1 }) }, calls) as never,
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.podcasts).toHaveLength(1);
    expect(calls[0].filters.user_id).toBe(USER.id);
  });
});

describe("POST /api/podcasts", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const res = await POST(req({ source_mode: "generate" }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid source_mode", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    const res = await POST(req({ source_mode: "nope" }));
    expect(res.status).toBe(400);
  });

  it("creates a draft podcast with two default speakers (host + guest)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    let speakerPayload: Array<{ role: string; position: number; podcast_id: string }> = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:insert": (s) => ({ data: { id: "p1", user_id: USER.id, status: "draft", ...(s.payload as object) }, error: null }),
        "podcast_speakers:insert": (s) => {
          speakerPayload = s.payload as typeof speakerPayload;
          return { data: speakerPayload.map((sp, i) => ({ id: `sp-${i}`, ...sp })), error: null };
        },
      }) as never,
    );
    const res = await POST(req({ source_mode: "generate", source_topic: "AI tools" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.podcast.id).toBe("p1");
    expect(json.speakers).toHaveLength(2);
    expect(speakerPayload.map((s) => s.role).sort()).toEqual(["guest", "host"]);
    expect(speakerPayload.every((s) => s.podcast_id === "p1")).toBe(true);
    // user_id always from auth
    expect((json.podcast.user_id)).toBe(USER.id);
  });
});
