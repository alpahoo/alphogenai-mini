import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";

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
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => ({ url: "http://localhost" } as never);

const SRC = {
  id: "p1", user_id: USER.id, title: "Show", source_mode: "generate",
  source_topic: "topic", source_asset_url: null, layout: "two_shot",
  aspect_ratio: "16:9", language: "en-US", metadata: { podcast_style: "news" },
  video_url: "https://cdn/x.mp4", render_status: "done",
};
const SRC_SPEAKERS = [
  { id: "old-h", role: "host", name: "Host", position: 0, voice_id: "nova", persona_id: "per-h" },
  { id: "old-g", role: "guest", name: "Guest", position: 1, voice_id: "onyx", persona_id: null },
];
const SRC_SEGMENTS = [
  { id: "seg1", speaker_id: "old-h", order_index: 0, text: "Hi", status: "ready", audio_url: "https://a/1.mp3" },
  { id: "seg2", speaker_id: "old-g", order_index: 1, text: "Yo", status: "ready", audio_url: "https://a/2.mp3" },
];

beforeEach(() => vi.clearAllMocks());

describe("POST /api/podcasts/[id]/duplicate", () => {
  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { ...SRC, user_id: "other" }, error: null }) }) as never,
    );
    expect((await POST(req(), ctx("p1"))).status).toBe(404);
  });

  it("deep-copies speakers + segments (remapped, pending, no video)", async () => {
    let podcastInsert: Record<string, unknown> | undefined;
    let segInsert: Array<Record<string, unknown>> | undefined;
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: SRC, error: null }),
        "podcast_speakers:select": () => ({ data: SRC_SPEAKERS, error: null }),
        "podcast_segments:select": () => ({ data: SRC_SEGMENTS, error: null }),
        "podcasts:insert": (s) => { podcastInsert = s.payload as Record<string, unknown>; return { data: { id: "p2", user_id: USER.id }, error: null }; },
        "podcast_speakers:insert": () => ({ data: [{ id: "new-h", role: "host" }, { id: "new-g", role: "guest" }], error: null }),
        "podcast_segments:insert": (s) => { segInsert = s.payload as Array<Record<string, unknown>>; return { data: null, error: null }; },
      }) as never,
    );
    const res = await POST(req(), ctx("p1"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.podcast.id).toBe("p2");
    // New podcast carries settings but NOT render output.
    expect(podcastInsert?.title).toBe("Show (Copy)");
    expect(podcastInsert?.metadata).toEqual({ podcast_style: "news" });
    expect("video_url" in podcastInsert!).toBe(false);
    expect("render_status" in podcastInsert!).toBe(false);
    // Segments remapped to the new speaker ids, reset to pending, audio null.
    expect(segInsert).toHaveLength(2);
    expect(segInsert![0]).toMatchObject({ speaker_id: "new-h", order_index: 0, text: "Hi", status: "pending", audio_url: null });
    expect(segInsert![1]).toMatchObject({ speaker_id: "new-g", order_index: 1, text: "Yo", status: "pending", audio_url: null });
  });

  it("rolls back the new podcast when segment insert fails", async () => {
    let deleted = false;
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: SRC, error: null }),
        "podcast_speakers:select": () => ({ data: SRC_SPEAKERS, error: null }),
        "podcast_segments:select": () => ({ data: SRC_SEGMENTS, error: null }),
        "podcasts:insert": () => ({ data: { id: "p2", user_id: USER.id }, error: null }),
        "podcast_speakers:insert": () => ({ data: [{ id: "new-h", role: "host" }, { id: "new-g", role: "guest" }], error: null }),
        "podcast_segments:insert": () => ({ data: null, error: { message: "boom" } }),
        "podcasts:delete": () => { deleted = true; return { data: null, error: null }; },
      }) as never,
    );
    const res = await POST(req(), ctx("p1"));
    expect(res.status).toBe(500);
    expect(deleted).toBe(true); // rollback removed the half-created copy
  });
});
