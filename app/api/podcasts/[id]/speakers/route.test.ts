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
      in: (k: string, v: unknown) => { st.filters[`in:${k}`] = v; return b; },
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
  { id: "host-id", role: "host", voice_id: DEFAULT_HOST_VOICE, persona_id: null },
  { id: "guest-id", role: "guest", voice_id: DEFAULT_GUEST_VOICE, persona_id: "persona-guest" },
];

// Personas the route may look up. Catalog rows (user_id null) + one owned by
// another user (not visible) to exercise the ownership guard.
const PERSONAS = [
  { id: "p-cat-1", user_id: null, status: "active" },
  { id: "persona-guest", user_id: null, status: "active" },
  { id: "p-other", user_id: "someone-else", status: "active" },
];

function service(updates: State[] = []) {
  return makeService({
    "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
    "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
    "podcast_speakers:update": () => ({ data: null, error: null }),
    "podcast_personas:select": (s) => {
      const ids = (s.filters["in:id"] as string[]) || [];
      return { data: PERSONAS.filter((p) => ids.includes(p.id)), error: null };
    },
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

  it("400 when host would equal guest (voice)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
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

  // ── Persona assignment (T-1136d) ──────────────────────────────────────────

  it("assigns a catalog persona to the host", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ host_persona_id: "p-cat-1" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(updates.some((u) => (u.payload as { persona_id?: string }).persona_id === "p-cat-1")).toBe(true);
  });

  it("400 for a persona owned by another user", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    const res = await PATCH(req({ host_persona_id: "p-other" }), ctx("p1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not found or not allowed/i);
  });

  it("400 for an unknown persona id", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    expect((await PATCH(req({ host_persona_id: "does-not-exist" }), ctx("p1"))).status).toBe(400);
  });

  it("400 when host and guest would share a persona", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service());
    // guest already has persona-guest; assigning it to host too must conflict.
    const res = await PATCH(req({ host_persona_id: "persona-guest" }), ctx("p1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/different personas/i);
  });

  it("clears the guest persona with null", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ guest_persona_id: null }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(updates.some((u) => "persona_id" in (u.payload as object) && (u.payload as { persona_id: unknown }).persona_id === null)).toBe(true);
  });

  it("assigns host + guest personas together", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ host_persona_id: "p-cat-1", guest_persona_id: "persona-guest" }), ctx("p1"));
    expect(res.status).toBe(200);
    const personaVals = updates.map((u) => (u.payload as { persona_id?: string }).persona_id).filter(Boolean);
    expect(personaVals).toContain("p-cat-1");
    expect(personaVals).toContain("persona-guest");
  });

  // ── Render invalidation on persona change (P1 fix) ─────────────────────────

  it("clears the stale render BEFORE mutating speakers when a persona changes", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ host_persona_id: "p-cat-1" }), ctx("p1")); // host was null → change
    expect(res.status).toBe(200);
    const podcastReset = updates.findIndex(
      (u) => u.table === "podcasts" && (u.payload as { video_url?: unknown }).video_url === null,
    );
    const speakerUpdate = updates.findIndex((u) => u.table === "podcast_speakers");
    expect(podcastReset).toBeGreaterThanOrEqual(0);
    expect(speakerUpdate).toBeGreaterThanOrEqual(0);
    expect(podcastReset).toBeLessThan(speakerUpdate); // reset happens first
    const reset = updates[podcastReset].payload as Record<string, unknown>;
    expect(reset.render_status).toBe("idle");
    expect(reset.render_error).toBe(null);
  });

  it("500s and does NOT mutate speakers when the stale-render reset fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcast_personas:select": (s) => {
          const ids = (s.filters["in:id"] as string[]) || [];
          return { data: PERSONAS.filter((p) => ids.includes(p.id)), error: null };
        },
        "podcasts:update": () => ({ data: null, error: { message: "db boom" } }),
      }, updates) as never,
    );
    const res = await PATCH(req({ host_persona_id: "p-cat-1" }), ctx("p1"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).toMatch(/stale rendered video/i);
    expect(updates.some((u) => u.table === "podcast_speakers")).toBe(false);
  });

  it("does NOT reset the render for a no-op persona (same value)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    // guest already has persona-guest; re-sending it is a no-op → no reset.
    const res = await PATCH(req({ guest_persona_id: "persona-guest" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(updates.some((u) => u.table === "podcasts")).toBe(false);
  });

  it("resets the render when clearing a previously-set persona (null)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ guest_persona_id: null }), ctx("p1")); // guest was persona-guest → change
    expect(res.status).toBe(200);
    expect(updates.some((u) => u.table === "podcasts" && (u.payload as { video_url?: unknown }).video_url === null)).toBe(true);
  });

  it("does NOT reset the render for a voice-only change", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(updates));
    const res = await PATCH(req({ host_voice_id: "nova" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(updates.some((u) => u.table === "podcasts")).toBe(false);
  });
});
