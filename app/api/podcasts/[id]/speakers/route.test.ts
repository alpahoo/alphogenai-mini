import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_HOST_VOICE, DEFAULT_GUEST_VOICE } from "@/lib/podcast/voice-catalog";
import { PATCH } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

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

const SPEAKERS = [
  { id: "host-id", role: "host", voice_id: DEFAULT_HOST_VOICE },
  { id: "guest-id", role: "guest", voice_id: DEFAULT_GUEST_VOICE },
];

function service(updates: State[] = []) {
  return makeService({
    "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
    "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
    "podcast_speakers:update": () => ({ data: null, error: null }),
  }, updates) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/podcasts/[id]/speakers", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await PATCH(req({ host_voice_id: "nova" }), ctx("p1"))).status).toBe(401);
  });

  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    expect((await PATCH(req({ host_voice_id: "nova" }), ctx("p1"))).status).toBe(404);
  });

  it("400 with no fields", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({}), ctx("p1"))).status).toBe(400);
  });

  it("400 for an unknown voice", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({ host_voice_id: "not-a-voice" }), ctx("p1"))).status).toBe(400);
  });

  it("400 when host would equal guest", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    // guest is DEFAULT_GUEST_VOICE; trying to set host to the same → conflict
    const res = await PATCH(req({ host_voice_id: DEFAULT_GUEST_VOICE }), ctx("p1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/different voices/i);
  });

  it("updates the host voice and returns speakers", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ host_voice_id: "nova" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(updates.some((u) => (u.payload as { voice_id?: string }).voice_id === "nova")).toBe(true);
  });
});
