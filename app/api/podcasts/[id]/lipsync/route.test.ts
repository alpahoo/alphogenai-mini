import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createLipsync } from "@/lib/heygen-client";
import { trimLipsyncBaseClip } from "@/lib/modal-client";
import { GET, POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/heygen-client", () => ({ createLipsync: vi.fn(), getLipsyncTask: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));
vi.mock("@/lib/modal-client", () => ({ trimLipsyncBaseClip: vi.fn() }));

const USER = { id: "user-1" };
type Result = { data?: unknown; error?: unknown };
type State = { table: string; op: string; filters: Record<string, unknown>; payload: unknown };

function makeService(routes: Record<string, (s: State) => Result>, writes: State[] = []) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined };
    const run = () => {
      if (st.op === "insert" || st.op === "update") writes.push({ ...st });
      return Promise.resolve(routes[`${st.table}:${st.op}`]?.(st) ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (obj: unknown) => { st.op = "insert"; st.payload = obj; return b; },
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      not: () => b,
      in: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      order: () => b,
      limit: () => b,
      single: () => run(),
      maybeSingle: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => ({ url: "http://localhost", json: async () => body ?? {} } as never);

const baseRoutes = (overrides: Record<string, (s: State) => Result> = {}) => ({
  "podcasts:select": () => ({ data: { id: "p1", user_id: USER.id }, error: null }),
  "podcast_speakers:select": () => ({
    data: [{ id: "speaker-1", role: "host", persona_id: "persona-1" }],
    error: null,
  }),
  "podcast_segments:select": () => ({
    data: [{
      id: "segment-1",
      speaker_id: "speaker-1",
      order_index: 0,
      text: "A short line for premium lip sync.",
      audio_url: "https://cdn.example.com/audio.mp3",
      start_ms: 0,
      end_ms: 2500,
      status: "ready",
    }],
    error: null,
  }),
  "podcast_personas:select": () => ({ data: { user_id: null, status: "active" }, error: null }),
  "podcast_persona_base_clips:select": () => ({
    data: { id: "base-1", video_url: "https://cdn.example.com/base.mp4", duration_seconds: 2.4 },
    error: null,
  }),
  "podcast_segment_lipsync_clips:select": () => ({ data: null, error: null }),
  "podcast_segment_lipsync_clips:insert": () => ({ data: null, error: null }),
  "podcast_segment_lipsync_clips:update": () => ({ data: null, error: null }),
  ...overrides,
});

describe("POST /api/podcasts/[id]/lipsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createLipsync).mockResolvedValue("heygen-task-1");
    vi.mocked(trimLipsyncBaseClip).mockResolvedValue("https://cdn.example.com/trimmed.mp4");
  });

  it("reuses ready cache rows without calling HeyGen or consuming new spend", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segment_lipsync_clips:select": () => ({
          data: { id: "clip-1", status: "ready", video_url: "https://cdn.example.com/lip.mp4" },
          error: null,
        }),
      })) as never,
    );

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(1);
    expect(json.started).toBe(0);
    expect(json.actualNewSpendUsd).toBe(0);
    expect(createLipsync).not.toHaveBeenCalled();
  });

  it("reuses existing processing rows without calling HeyGen again", async () => {
    const writes: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segment_lipsync_clips:select": () => ({
          data: {
            id: "clip-1",
            status: "processing",
            video_url: null,
            provider_task_id: "heygen-task-existing",
          },
          error: null,
        }),
      }), writes) as never,
    );

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processing).toBe(1);
    expect(json.actualNewSpendUsd).toBe(0);
    expect(createLipsync).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
  it("does not call HeyGen when the cache reservation write fails", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segment_lipsync_clips:insert": () => ({ data: null, error: { message: "db down" } }),
      })) as never,
    );

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(500);
    expect(createLipsync).not.toHaveBeenCalled();
  });

  it("does not call HeyGen when the stale render cannot be cleared", async () => {
    const writes: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcasts:update": () => ({ data: null, error: { message: "db down" } }),
      }), writes) as never,
    );

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(500);
    expect(createLipsync).not.toHaveBeenCalled();
    expect(writes.map((w) => `${w.table}:${w.op}`)).toEqual(["podcasts:update"]);
  });

  it("reserves the cache row before starting HeyGen, then saves the provider task id", async () => {
    const writes: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(makeService(baseRoutes(), writes) as never);

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.started).toBe(1);
    expect(json.actualNewSpendUsd).toBeGreaterThan(0);
    expect(createLipsync).toHaveBeenCalledTimes(1);
    expect(writes.map((w) => `${w.table}:${w.op}`)).toEqual([
      "podcasts:update",
      "podcast_segment_lipsync_clips:insert",
      "podcast_segment_lipsync_clips:update",
    ]);
    expect(writes[0].payload).toMatchObject({ video_url: null, render_status: "idle", render_error: null });
    expect(writes[2].payload).toMatchObject({ provider_task_id: "heygen-task-1", status: "processing" });
  });

  it("trims the base clip on Modal when the audio is shorter, and sends the trimmed URL to HeyGen", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        // audio 1.5s < base 2.4s → physical trim required
        "podcast_segments:select": () => ({
          data: [{
            id: "segment-1", speaker_id: "speaker-1", order_index: 0,
            text: "short", audio_url: "https://cdn.example.com/audio.mp3",
            start_ms: 0, end_ms: 1500, status: "ready",
          }],
          error: null,
        }),
      })) as never,
    );

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(trimLipsyncBaseClip).toHaveBeenCalledTimes(1);
    expect(trimLipsyncBaseClip).toHaveBeenCalledWith(expect.objectContaining({ segmentId: "segment-1", durationSeconds: 1.5 }));
    expect(createLipsync).toHaveBeenCalledWith("https://cdn.example.com/trimmed.mp4", "https://cdn.example.com/audio.mp3", "precision");
  });

  it("limits work to the selected segmentIds (partial render)", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService(baseRoutes()) as never);
    // segment-1 is the only ready segment; selecting a different id → nothing to do.
    const res = await POST(req({ action: "start", segmentIds: ["nope"] }), ctx("p1"));
    expect(res.status).toBe(400);
    expect(createLipsync).not.toHaveBeenCalled();
  });

  it("automatically cleans stale rows when polling finishes", async () => {
    const writes: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segments:select": () => ({ data: [{ id: "segment-1", audio_url: "AUDIO_A" }], error: null }),
        "podcast_segment_lipsync_clips:select": (s) => {
          if (s.filters.status === "processing") return { data: [], error: null };
          return {
            data: [
              { id: "keep", segment_id: "segment-1", audio_url: "AUDIO_A", status: "ready", video_url: "https://cdn/keep.mp4", updated_at: "2026-01-02" },
              { id: "stale", segment_id: "segment-1", audio_url: "AUDIO_OLD", status: "ready", video_url: "https://cdn/stale.mp4", updated_at: "2026-01-01" },
            ],
            error: null,
          };
        },
      }), writes) as never,
    );

    const res = await POST(req({ action: "poll" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processing).toBe(0);
    expect(json.cleanup).toMatchObject({ removed: 1, scanned: 2 });
    const cleanupWrite = writes.find((w) => w.table === "podcast_segment_lipsync_clips" && w.op === "update");
    expect(cleanupWrite?.payload).toMatchObject({ status: "removed" });
    expect(cleanupWrite?.filters.id).toEqual(["stale"]);
  });

  it("cleanup soft-deletes only rows whose audio no longer matches the segment", async () => {
    const writes: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segments:select": () => ({ data: [{ id: "segment-1", audio_url: "AUDIO_A" }], error: null }),
        "podcast_segment_lipsync_clips:select": () => ({
          data: [
            { id: "r1", segment_id: "segment-1", audio_url: "AUDIO_A", status: "ready", video_url: "https://cdn/r1.mp4", updated_at: "2026-01-02" }, // current newest → keep
            { id: "r0", segment_id: "segment-1", audio_url: "AUDIO_A", status: "ready", video_url: "https://cdn/r0.mp4", updated_at: "2026-01-01" }, // current older dup → remove
            { id: "r2", segment_id: "segment-1", audio_url: "AUDIO_OLD", status: "ready", video_url: "https://cdn/r2.mp4", updated_at: "2025-12-31" }, // stale audio → remove
            { id: "r3", segment_id: "segment-1", audio_url: "AUDIO_OLD", status: "failed", video_url: null, updated_at: "2025-12-30" }, // stale failed → remove
          ],
          error: null,
        }),
      }), writes) as never,
    );

    const res = await POST(req({ action: "cleanup" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.removed).toBe(3); // r0 (dup), r2 (stale), r3 (stale failed); r1 kept
    expect(json.scanned).toBe(4);
    const upd = writes.find((w) => w.op === "update" && w.table === "podcast_segment_lipsync_clips");
    expect(upd?.payload).toMatchObject({ status: "removed" });
    expect(createLipsync).not.toHaveBeenCalled();
  });

  it("does not spend when the Modal trim fails", async () => {
    vi.mocked(trimLipsyncBaseClip).mockRejectedValue(new Error("modal trim down"));
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segments:select": () => ({
          data: [{
            id: "segment-1", speaker_id: "speaker-1", order_index: 0,
            text: "short", audio_url: "https://cdn.example.com/audio.mp3",
            start_ms: 0, end_ms: 1500, status: "ready",
          }],
          error: null,
        }),
      })) as never,
    );

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(createLipsync).not.toHaveBeenCalled();
    expect(json.started).toBe(0);
    expect(json.actualNewSpendUsd).toBe(0);
  });
});


describe("GET /api/podcasts/[id]/lipsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
  });

  it("returns per-segment premium status for the current audio and ignores stale clips", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(baseRoutes({
        "podcast_segments:select": () => ({
          data: [
            { id: "segment-ready", order_index: 0, audio_url: "fresh-audio.mp3", status: "ready" },
            { id: "segment-stale", order_index: 1, audio_url: "fresh-b.mp3", status: "ready" },
            { id: "segment-pending", order_index: 2, audio_url: null, status: "pending" },
          ],
          error: null,
        }),
        "podcast_segment_lipsync_clips:select": () => ({
          data: [
            { segment_id: "segment-ready", audio_url: "old-audio.mp3", status: "ready", video_url: "old.mp4", updated_at: "2026-01-01", error_message: null },
            { segment_id: "segment-ready", audio_url: "fresh-audio.mp3", status: "ready", video_url: "fresh.mp4", updated_at: "2026-01-02", error_message: null },
            { segment_id: "segment-stale", audio_url: "old-b.mp3", status: "ready", video_url: "old-b.mp4", updated_at: "2026-01-02", error_message: null },
          ],
          error: null,
        }),
      })) as never,
    );

    const res = await GET(req(), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.segments).toEqual([
      { segment_id: "segment-ready", status: "ready" },
      { segment_id: "segment-stale", status: "missing" },
      { segment_id: "segment-pending", status: "needs_voice" },
    ]);
  });
});
