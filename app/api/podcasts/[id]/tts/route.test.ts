import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/tts", () => ({ generateVoiceover: vi.fn(), isTTSAvailable: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));

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
  { id: "host-id", role: "host", voice_id: null },
  { id: "guest-id", role: "guest", voice_id: null },
];
function seg(i: number, over: Partial<{ audio_url: string | null; status: string }> = {}) {
  return {
    id: `seg-${i}`,
    podcast_id: "p1",
    speaker_id: i % 2 === 0 ? "host-id" : "guest-id",
    order_index: i,
    text: `line number ${i} has a few words here`,
    audio_url: over.audio_url ?? null,
    start_ms: null,
    end_ms: null,
    status: over.status ?? "pending",
  };
}

const okPodcast = { id: "p1", user_id: USER.id, status: "ready", language: "en-US" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTTSAvailable).mockReturnValue(true);
  vi.mocked(generateVoiceover).mockResolvedValue({
    audio: new ArrayBuffer(8),
    provider: "elevenlabs",
    duration_estimate: 2,
    content_type: "audio/mpeg",
  });
  vi.mocked(uploadBufferToR2).mockResolvedValue("https://cdn.example.com/a.mp3");
});

function service(segments: ReturnType<typeof seg>[], updates: State[] = []) {
  return makeService({
    "podcasts:select": () => ({ data: okPodcast, error: null }),
    "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
    "podcast_segments:select": () => ({ data: segments, error: null }),
    "podcast_segments:update": () => ({ data: null, error: null }),
  }, updates) as never;
}

describe("POST /api/podcasts/[id]/tts", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(req(), ctx("p1"))).status).toBe(401);
  });

  it("404 when not owned", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: { id: "p1", user_id: "other" }, error: null }) }) as never,
    );
    expect((await POST(req(), ctx("p1"))).status).toBe(404);
  });

  it("503 when TTS is unavailable", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(isTTSAvailable).mockReturnValue(false);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcasts:select": () => ({ data: okPodcast, error: null }) }) as never,
    );
    expect((await POST(req(), ctx("p1"))).status).toBe(503);
  });

  it("400 when there are no segments", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service([]) as never);
    expect((await POST(req(), ctx("p1"))).status).toBe(400);
  });

  it("preview generates only one segment", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service([seg(0), seg(1)]) as never);
    const res = await POST(req({ preview: "seg-1" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(generateVoiceover).toHaveBeenCalledTimes(1);
    expect(json.segments).toHaveLength(1);
    expect(json.segments[0].id).toBe("seg-1");
    expect(json.ready).toBe(1);
  });

  it("full mode generates all pending segments with timings", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service([seg(0), seg(1), seg(2)]) as never);
    const res = await POST(req({}), ctx("p1"));
    const json = await res.json();
    expect(json.ready).toBe(3);
    expect(generateVoiceover).toHaveBeenCalledTimes(3);
    expect(json.segments[0].start_ms).toBe(0);
    expect(json.segments[1].start_ms).toBeGreaterThan(json.segments[0].end_ms - 1);
  });

  it("skips already-ready segments unless force is set", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const segs = [seg(0, { status: "ready", audio_url: "https://cdn.example.com/old.mp3" }), seg(1)];
    vi.mocked(createServiceClient).mockReturnValue(service(segs) as never);
    const res = await POST(req({}), ctx("p1"));
    const json = await res.json();
    expect(json.skipped).toBe(1);
    expect(json.ready).toBe(1);
    expect(generateVoiceover).toHaveBeenCalledTimes(1);
  });

  it("force re-generates already-ready segments", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    const segs = [seg(0, { status: "ready", audio_url: "https://cdn.example.com/old.mp3" }), seg(1)];
    vi.mocked(createServiceClient).mockReturnValue(service(segs) as never);
    const res = await POST(req({ force: true }), ctx("p1"));
    const json = await res.json();
    expect(json.skipped).toBe(0);
    expect(json.ready).toBe(2);
    expect(generateVoiceover).toHaveBeenCalledTimes(2);
  });

  it("a failing segment does not block others and keeps its old audio_url", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    // seg-0 had prior audio and we force-regen; its synth fails twice (retry) → failed, old kept
    const segs = [seg(0, { status: "ready", audio_url: "https://cdn.example.com/old.mp3" }), seg(1)];
    const updates: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(service(segs, updates) as never);
    vi.mocked(generateVoiceover)
      .mockRejectedValueOnce(new Error("tts down")) // seg-0 attempt 1
      .mockRejectedValueOnce(new Error("tts down")) // seg-0 retry
      .mockResolvedValue({ audio: new ArrayBuffer(8), provider: "elevenlabs", duration_estimate: 2, content_type: "audio/mpeg" }); // seg-1
    const res = await POST(req({ force: true }), ctx("p1"));
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.ready).toBe(1);
    const seg0 = json.segments.find((s: { id: string }) => s.id === "seg-0");
    expect(seg0.status).toBe("failed");
    expect(seg0.audio_url).toBe("https://cdn.example.com/old.mp3"); // non-destructive
    const seg1 = json.segments.find((s: { id: string }) => s.id === "seg-1");
    expect(seg1.status).toBe("ready");
  });

  it("never leaks the TTS provider in the response", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(service([seg(0), seg(1)]) as never);
    const res = await POST(req({}), ctx("p1"));
    const text = JSON.stringify(await res.json());
    expect(text.toLowerCase()).not.toContain("elevenlabs");
    expect(text.toLowerCase()).not.toContain("openai");
    expect(text.toLowerCase()).not.toContain("provider");
  });

  // ── T-1131d-fix ──────────────────────────────────────────────────────────

  it("500s when the podcast is missing a speaker (no silent default)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: okPodcast, error: null }),
        "podcast_speakers:select": () => ({ data: [{ id: "host-id", role: "host", voice_id: null }], error: null }),
        "podcast_segments:select": () => ({ data: [seg(0), seg(1)], error: null }),
      }) as never,
    );
    const res = await POST(req({}), ctx("p1"));
    expect(res.status).toBe(500);
    expect(generateVoiceover).not.toHaveBeenCalled();
  });

  it("preview returns 500 when the DB update fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: okPodcast, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcast_segments:select": () => ({ data: [seg(0), seg(1)], error: null }),
        "podcast_segments:update": () => ({ data: null, error: { message: "db boom" } }),
      }) as never,
    );
    const res = await POST(req({ preview: "seg-1" }), ctx("p1"));
    expect(res.status).toBe(500);
  });

  it("full mode does not report a segment ready when its DB update fails", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcasts:select": () => ({ data: okPodcast, error: null }),
        "podcast_speakers:select": () => ({ data: SPEAKERS, error: null }),
        "podcast_segments:select": () => ({ data: [seg(0), seg(1)], error: null }),
        "podcast_segments:update": () => ({ data: null, error: { message: "db boom" } }),
      }) as never,
    );
    const res = await POST(req({}), ctx("p1"));
    const json = await res.json();
    expect(json.ready).toBe(0);
    expect(json.failed).toBe(2);
    expect(json.segments.every((s: { status: string }) => s.status === "failed")).toBe(true);
  });

  it("force writes a fresh, unique R2 key (no stale cached audio)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(uploadBufferToR2).mockImplementation(async (_buf, path) => `https://cdn.example.com/${path}`);
    const segs = [seg(0, { status: "ready", audio_url: "https://cdn.example.com/audio/podcast/p1/seg-0.mp3" }), seg(1)];
    vi.mocked(createServiceClient).mockReturnValue(service(segs) as never);
    const res = await POST(req({ force: true }), ctx("p1"));
    const json = await res.json();
    const s0 = json.segments.find((s: { id: string }) => s.id === "seg-0");
    // versioned key with a uuid suffix, and different from the old flat key
    expect(s0.audio_url).toMatch(/audio\/podcast\/p1\/seg-0-[0-9a-f-]{36}\.mp3$/);
    expect(s0.audio_url).not.toContain("/seg-0.mp3");
  });
});
