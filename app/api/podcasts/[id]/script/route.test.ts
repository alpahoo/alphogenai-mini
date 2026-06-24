import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePodcastDialogue } from "@/lib/podcast/dialogue-llm";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/podcast/dialogue-llm", () => ({ generatePodcastDialogue: vi.fn() }));

const SIX_SEGMENTS = [
  { speaker_role: "host", text: "Welcome." },
  { speaker_role: "guest", text: "Thanks." },
  { speaker_role: "host", text: "Question one." },
  { speaker_role: "guest", text: "Answer one." },
  { speaker_role: "host", text: "Question two." },
  { speaker_role: "guest", text: "Answer two." },
] as const;
const okDialogue = () => ({ ok: true as const, segments: SIX_SEGMENTS.map((s) => ({ ...s })) });

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
      delete: () => { st.op = "delete"; return b; },
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
  { id: "host-id", name: "Host", role: "host" },
  { id: "guest-id", name: "Guest", role: "guest" },
];

beforeEach(() => vi.clearAllMocks());

describe("POST /api/podcasts/[id]/script", () => {
  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other", status: "draft" }, error: null }) }) as never,
    );
    const res = await POST(req({ topic: "x topic" }), ctx("p1"));
    expect(res.status).toBe(404);
    expect(generatePodcastDialogue).not.toHaveBeenCalled();
  });

  it("400 when no topic is available", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "draft", source_topic: null, language: "en-US" }, error: null }) }) as never,
    );
    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(400);
  });

  it("400 on invalid duration or podcast style", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "draft", source_topic: "AI tools", language: "en-US" }, error: null }),
      }) as never,
    );

    const badDuration = await POST(req({ target_duration_seconds: 999 }), ctx("p1"));
    expect(badDuration.status).toBe(400);

    const badStyle = await POST(req({ target_duration_seconds: 120, style: "salesy" }), ctx("p1"));
    expect(badStyle.status).toBe(400);
    expect(generatePodcastDialogue).not.toHaveBeenCalled();
  });

  it("marks the podcast failed when the LLM JSON is invalid", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const updates: unknown[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "draft", source_topic: "AI tools", language: "en-US" }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcasts:update": (s) => { updates.push(s.payload); return { data: null, error: null }; },
      }) as never,
    );
    vi.mocked(generatePodcastDialogue).mockResolvedValue({ ok: false, error: "Could not parse the dialogue response." });
    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.status).toBe("failed");
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed" }));
  });

  it("422 + failed when dialogue generation fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "draft", source_topic: "AI tools", language: "en-US" }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcasts:update": () => ({ data: null, error: null }),
      }) as never,
    );
    vi.mocked(generatePodcastDialogue).mockResolvedValue({ ok: false, error: "LLM provider error" });
    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(422);
  });

  it("inserts segments mapped to speaker ids and sets status ready", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    let inserted: Array<{ speaker_id: string; order_index: number; text: string; status: string }> = [];
    const updates: unknown[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "draft", source_topic: "AI tools", language: "en-US" }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcast_segments:delete": () => ({ data: null, error: null }),
        "podcast_segments:insert": (s) => { inserted = s.payload as typeof inserted; return { data: inserted, error: null }; },
        "podcasts:update": (s) => { updates.push(s.payload); return { data: null, error: null }; },
      }) as never,
    );
    vi.mocked(generatePodcastDialogue).mockResolvedValue(okDialogue());

    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ready");

    expect(inserted).toHaveLength(6);
    expect(inserted[0]).toMatchObject({ speaker_id: "host-id", order_index: 0, status: "pending" });
    expect(inserted[1]).toMatchObject({ speaker_id: "guest-id", order_index: 1 });
    // ends ready
    expect(updates).toContainEqual(expect.objectContaining({ status: "ready" }));
    // a new dialogue invalidates any previously rendered MP4
    expect(updates).toContainEqual(
      expect.objectContaining({ video_url: null, render_status: "idle", render_error: null }),
    );
  });

  it("passes the duration and style controls to the dialogue generator", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "draft", source_topic: "AI tools", language: "en-US" }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcast_segments:delete": () => ({ data: null, error: null }),
        "podcast_segments:insert": (s) => ({ data: s.payload, error: null }),
        "podcasts:update": () => ({ data: null, error: null }),
      }) as never,
    );
    vi.mocked(generatePodcastDialogue).mockResolvedValue(okDialogue());

    const res = await POST(req({ target_duration_seconds: 300, style: "documentary" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(generatePodcastDialogue).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "AI tools", targetDurationSeconds: 300, style: "documentary" }),
    );
  });

  it("500s and leaves segments UNTOUCHED when the render reset fails (reset runs first)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const calls: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "ready", source_topic: "AI tools", language: "en-US" }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        // The early "scripting" update succeeds; the render reset (carries render_status) fails.
        "podcasts:update": (s) => {
          const p = s.payload as { render_status?: string };
          return p?.render_status ? { data: null, error: { message: "db boom" } } : { data: null, error: null };
        },
      }, calls) as never,
    );
    vi.mocked(generatePodcastDialogue).mockResolvedValue(okDialogue());

    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/previous script was kept/i);
    expect(json.status).not.toBe("ready");
    // Because the reset is checked BEFORE mutating segments, no delete/insert ran.
    const segMutations = calls.filter((c) => c.table === "podcast_segments" && (c.op === "insert" || c.op === "delete"));
    expect(segMutations).toHaveLength(0);
  });

  it("restores the previous dialogue and fails when the new insert errors", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const previous = [
      { id: "old-1", podcast_id: "p1", speaker_id: "host-id", order_index: 0, text: "old host", status: "pending" },
      { id: "old-2", podcast_id: "p1", speaker_id: "guest-id", order_index: 1, text: "old guest", status: "pending" },
    ];
    let insertCalls = 0;
    let restored: unknown = null;
    const updates: unknown[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id, status: "ready", source_topic: "AI tools", language: "en-US" }, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcast_segments:select": () => ({ data: previous, error: null }),
        "podcast_segments:delete": () => ({ data: null, error: null }),
        "podcast_segments:insert": (s) => {
          insertCalls++;
          if (insertCalls === 1) return { data: null, error: { message: "insert boom" } };
          restored = s.payload; // the compensating restore
          return { data: s.payload, error: null };
        },
        "podcasts:update": (s) => { updates.push(s.payload); return { data: null, error: null }; },
      }) as never,
    );
    vi.mocked(generatePodcastDialogue).mockResolvedValue(okDialogue());

    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(500);
    expect(insertCalls).toBe(2); // new insert (failed) + restore
    expect(restored).toEqual(previous);
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed" }));
  });
});
