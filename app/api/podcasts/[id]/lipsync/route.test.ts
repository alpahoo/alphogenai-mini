import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createLipsync } from "@/lib/heygen-client";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/heygen-client", () => ({ createLipsync: vi.fn(), getLipsyncTask: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));

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
    data: { id: "base-1", video_url: "https://cdn.example.com/base.mp4", duration_seconds: 4.5 },
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

  it("reserves the cache row before starting HeyGen, then saves the provider task id", async () => {
    const writes: State[] = [];
    vi.mocked(createServiceClient).mockReturnValue(makeService(baseRoutes(), writes) as never);

    const res = await POST(req({ action: "start" }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.started).toBe(1);
    expect(json.actualNewSpendUsd).toBeGreaterThan(0);
    expect(createLipsync).toHaveBeenCalledTimes(1);
    expect(writes.map((w) => w.op)).toEqual(["insert", "update"]);
    expect(writes[1].payload).toMatchObject({ provider_task_id: "heygen-task-1", status: "processing" });
  });
});
