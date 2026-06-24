import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = { id: "user-1" };

type Result = { data?: unknown; error?: unknown };
type State = { table: string; op: string; filters: Record<string, unknown>; payload: unknown };

function makeService(routes: Record<string, (s: State) => Result>, calls: State[] = []) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined };
    const run = () => { calls.push({ ...st }); return Promise.resolve(routes[`${st.table}:${st.op}`]?.(st) ?? { data: null, error: null }); };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (rows: unknown) => { st.op = "insert"; st.payload = rows; return b; },
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      order: () => b,
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => ({ url: "http://localhost", json: async () => body ?? {} } as never);

const SPEAKERS = [{ id: "host-id", role: "host" }, { id: "guest-id", role: "guest" }];
const segs = (n: number) => Array.from({ length: n }, (_, i) => ({ order_index: i }));

function service(segments: { order_index: number }[], calls: State[] = [], resetError = false) {
  return makeService({
    "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
    "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
    "podcast_segments:select": () => ({ data: segments, error: null }),
    "podcasts:update": () => ({ data: null, error: resetError ? { message: "boom" } : null }),
    "podcast_segments:insert": (s) => ({ data: { id: "new", status: "pending", ...(s.payload as object) }, error: null }),
  }, calls) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/podcasts/[id]/segments", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(req({ speaker_role: "host", text: "hi" }), ctx("p1"))).status).toBe(401);
  });

  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    expect((await POST(req({ speaker_role: "host", text: "hi" }), ctx("p1"))).status).toBe(404);
  });

  it("400 on invalid role", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service(segs(2)) as never);
    expect((await POST(req({ speaker_role: "narrator", text: "hi" }), ctx("p1"))).status).toBe(400);
  });

  it("400 on empty text", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service(segs(2)) as never);
    expect((await POST(req({ speaker_role: "host", text: "   " }), ctx("p1"))).status).toBe(400);
  });

  it("400 when already at the 60-segment cap", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service(segs(60)) as never);
    expect((await POST(req({ speaker_role: "host", text: "hi" }), ctx("p1"))).status).toBe(400);
  });

  it("inserts a pending line at order max+1 and resets the render", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(segs(3), calls) as never); // orders 0,1,2
    const res = await POST(req({ speaker_role: "guest", text: "a new line" }), ctx("p1"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.segment.order_index).toBe(3);
    expect(json.segment.status).toBe("pending");
    expect(json.segment.speaker_id).toBe("guest-id");
    // render reset happened
    expect(calls.some((c) => c.table === "podcasts" && c.op === "update")).toBe(true);
  });

  it("500 without inserting when the render reset fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(segs(3), calls, true) as never);
    const res = await POST(req({ speaker_role: "host", text: "hi" }), ctx("p1"));
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.table === "podcast_segments" && c.op === "insert")).toBe(false);
  });
});
