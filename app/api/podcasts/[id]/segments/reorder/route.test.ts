import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PATCH } from "./route";

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

const ctx = (id = "p1") => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => ({ url: "http://localhost", json: async () => body ?? {} } as never);
const IDS = [{ id: "a" }, { id: "b" }, { id: "c" }];

function service(calls: State[] = [], resetError = false) {
  return makeService({
    "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
    "podcast_segments:select": () => ({ data: IDS, error: null }),
    "podcasts:update": () => ({ data: null, error: resetError ? { message: "boom" } : null }),
    "podcast_segments:update": () => ({ data: null, error: null }),
  }, calls) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/podcasts/[id]/segments/reorder", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await PATCH(req({ ordered_ids: ["a", "b", "c"] }), ctx())).status).toBe(401);
  });

  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    expect((await PATCH(req({ ordered_ids: ["a", "b", "c"] }), ctx())).status).toBe(404);
  });

  it("400 when ordered_ids is not an array of ids", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({ ordered_ids: "nope" }), ctx())).status).toBe(400);
  });

  it("400 on a missing id (not a permutation)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({ ordered_ids: ["a", "b"] }), ctx())).status).toBe(400);
  });

  it("400 on a duplicate id", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({ ordered_ids: ["a", "b", "b"] }), ctx())).status).toBe(400);
  });

  it("400 on a foreign id", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({ ordered_ids: ["a", "b", "zzz"] }), ctx())).status).toBe(400);
  });

  it("reorders on a valid permutation, resetting render before any mutation", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(calls) as never);
    const res = await PATCH(req({ ordered_ids: ["c", "a", "b"] }), ctx());
    expect(res.status).toBe(200);
    const resetIdx = calls.findIndex((c) => c.table === "podcasts" && c.op === "update");
    const firstSegUpdate = calls.findIndex((c) => c.table === "podcast_segments" && c.op === "update");
    expect(resetIdx).toBeGreaterThanOrEqual(0);
    expect(firstSegUpdate).toBeGreaterThan(resetIdx); // render cleared before mutating
    // phase1 (negatives) + phase2 (finals) = 2 * 3 segment updates
    expect(calls.filter((c) => c.table === "podcast_segments" && c.op === "update").length).toBe(6);
    // final positions assigned
    const finals = calls.filter((c) => c.op === "update" && typeof (c.payload as { order_index?: number }).order_index === "number" && (c.payload as { order_index: number }).order_index >= 0);
    expect(finals.map((c) => (c.payload as { order_index: number }).order_index).sort()).toEqual([0, 1, 2]);
  });

  it("500 without mutation when render reset fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(calls, true) as never);
    const res = await PATCH(req({ ordered_ids: ["c", "a", "b"] }), ctx());
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.table === "podcast_segments" && c.op === "update")).toBe(false);
  });
});
