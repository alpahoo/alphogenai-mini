import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { createAvatarVideo, createPhotoAvatar, getHeyGenTask } from "@/lib/heygen-client";
import { uploadBufferToR2 } from "@/lib/r2";
import { POST } from "./route";

vi.mock("../middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/heygen-client", () => ({
  createPhotoAvatar: vi.fn(),
  createAvatarVideo: vi.fn(),
  getHeyGenTask: vi.fn(),
}));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));

type Result = { data?: unknown; error?: { message: string } | null };
type State = {
  table: string;
  op: string;
  filters: Record<string, unknown>;
  payload: unknown;
};

const ADMIN = { id: "admin-1", email: "admin@example.com" };
const persona = {
  id: "persona-1",
  name: "Maya Rivers",
  portrait_path: "user-1/maya.jpg",
  status: "active",
};
const readyClip = {
  id: "clip-1",
  persona_id: "persona-1",
  provider: "heygen",
  provider_avatar_id: "avatar-1",
  provider_video_id: "video-1",
  aspect_ratio: "16:9",
  resolution: "720p",
  clip_kind: "talking_head",
  prompt_version: "base-v2-8s",
  video_url: "https://cdn.example.com/base.mp4",
  storage_key: "podcast/base-clips/persona-1/base.mp4",
  duration_seconds: 4.2,
  status: "ready",
  error_message: null,
  metadata: {},
};

function req(body?: unknown) {
  return { json: async () => body ?? {} } as never;
}

function makeService(routes: Record<string, (s: State) => Result>, calls: State[] = []) {
  function builder(table: string) {
    const st: State = { table, op: "select", filters: {}, payload: undefined };
    const run = () => {
      const snap = { table: st.table, op: st.op, filters: { ...st.filters }, payload: st.payload };
      calls.push(snap);
      const fn = routes[`${st.table}:${st.op}`];
      return Promise.resolve(fn ? fn(snap) : { data: null, error: null });
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (payload: unknown) => {
        st.op = "insert";
        st.payload = payload;
        return b;
      },
      update: (payload: unknown) => {
        st.op = "update";
        st.payload = payload;
        return b;
      },
      eq: (k: string, v: unknown) => {
        st.filters[k] = v;
        return b;
      },
      neq: (k: string, v: unknown) => {
        st.filters[`neq:${k}`] = v;
        return b;
      },
      maybeSingle: () => run(),
      single: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example.com/maya.jpg" }, error: null }),
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN });
  vi.mocked(createPhotoAvatar).mockResolvedValue({ avatarId: "avatar-new", status: "created" });
  vi.mocked(createAvatarVideo).mockResolvedValue({ taskId: "video-new", status: "pending" });
  vi.mocked(getHeyGenTask).mockResolvedValue({ status: "processing" });
  vi.mocked(uploadBufferToR2).mockResolvedValue("https://cdn.example.com/new-base.mp4");
});

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/admin/podcast-base-clips", () => {
  it("requires admin access", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    });
    const res = await POST(req({ action: "ensure" }));
    expect(res.status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("reuses a ready base clip without calling HeyGen", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_personas:select": () => ({ data: persona, error: null }),
        "podcast_persona_base_clips:select": () => ({ data: readyClip, error: null }),
      }) as never,
    );

    const res = await POST(req({ action: "ensure", persona_id: "persona-1", voice_id: "voice-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ready");
    expect(json.reused).toBe(true);
    expect(json.clip.video_url).toBe(readyClip.video_url);
    expect(createPhotoAvatar).not.toHaveBeenCalled();
    expect(createAvatarVideo).not.toHaveBeenCalled();
  });

  // T-1143b P2 fix — staged ensure (avatar THEN video, separate calls).

  it("stage 1: new persona creates the photo avatar but NOT the video", async () => {
    const calls: State[] = [];
    let clip = { ...readyClip, id: "clip-new", provider_avatar_id: null, provider_video_id: null, video_url: null, status: "pending" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_personas:select": () => ({ data: persona, error: null }),
        "podcast_persona_base_clips:select": () => ({ data: null, error: null }),
        "podcast_persona_base_clips:insert": (s) => { clip = { ...clip, ...(s.payload as object) }; return { data: clip, error: null }; },
        "podcast_persona_base_clips:update": (s) => { clip = { ...clip, ...(s.payload as object) }; return { data: clip, error: null }; },
      }, calls) as never,
    );

    const res = await POST(req({ action: "ensure", persona_id: "persona-1", voice_id: "voice-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("pending");
    expect(json.stage).toBe("avatar_processing");
    expect(createPhotoAvatar).toHaveBeenCalledWith({ imageUrl: "https://signed.example.com/maya.jpg", name: "Maya Rivers podcast base" });
    expect(createAvatarVideo).not.toHaveBeenCalled();
    expect(json.clip.provider_avatar_id).toBe("avatar-new");
    expect(json.clip.provider_video_id).toBeNull();
  });

  it("stage 2: second ensure (avatar present, no video) starts the video", async () => {
    const clip = { ...readyClip, id: "clip-2", provider_avatar_id: "avatar-new", provider_video_id: null, video_url: null, status: "pending" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_personas:select": () => ({ data: persona, error: null }),
        "podcast_persona_base_clips:select": () => ({ data: clip, error: null }),
        "podcast_persona_base_clips:update": (s) => ({ data: { ...clip, ...(s.payload as object) }, error: null }),
      }) as never,
    );

    const res = await POST(req({ action: "ensure", persona_id: "persona-1", voice_id: "voice-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("pending");
    expect(json.stage).toBe("video_processing");
    expect(createPhotoAvatar).not.toHaveBeenCalled();
    expect(createAvatarVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: "avatar-new",
        voiceId: "voice-1",
        aspectRatio: "16:9",
        resolution: "720p",
        scriptText: expect.stringContaining("what you can do next"),
      }),
    );
    expect(json.clip.provider_video_id).toBe("video-new");
  });

  it("stage 2: avatar-not-ready error keeps the row pending (not failed)", async () => {
    const clip = { ...readyClip, id: "clip-3", provider_avatar_id: "avatar-new", provider_video_id: null, video_url: null, status: "pending" };
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_personas:select": () => ({ data: persona, error: null }),
        "podcast_persona_base_clips:select": () => ({ data: clip, error: null }),
        "podcast_persona_base_clips:update": (s) => { updatePayload = s.payload as Record<string, unknown>; return { data: { ...clip, ...updatePayload }, error: null }; },
      }) as never,
    );
    vi.mocked(createAvatarVideo).mockRejectedValueOnce(
      new Error('HeyGen createAvatarVideo failed (400): {"error":{"message":"Talking photo x has missing image dimensions. Please re-upload the photo."}}'),
    );

    const res = await POST(req({ action: "ensure", persona_id: "persona-1", voice_id: "voice-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("pending");
    expect(json.stage).toBe("avatar_processing");
    expect(updatePayload.status).toBe("pending"); // never marked failed
    expect(createPhotoAvatar).not.toHaveBeenCalled();
  });

  it("force restarts a staged cycle (fresh avatar, no video in same call)", async () => {
    let clip = { ...readyClip };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_personas:select": () => ({ data: persona, error: null }),
        "podcast_persona_base_clips:select": () => ({ data: clip, error: null }),
        "podcast_persona_base_clips:update": (s) => { clip = { ...clip, ...(s.payload as object) }; return { data: clip, error: null }; },
      }) as never,
    );

    const res = await POST(req({ action: "ensure", persona_id: "persona-1", voice_id: "voice-1", force: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stage).toBe("avatar_processing");
    expect(createPhotoAvatar).toHaveBeenCalledTimes(1);
    expect(createAvatarVideo).not.toHaveBeenCalled();
  });

  it("polls an in-progress provider task without uploading", async () => {
    const pendingClip = { ...readyClip, status: "pending", video_url: null };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_persona_base_clips:select": () => ({ data: pendingClip, error: null }),
        "podcast_persona_base_clips:update": (s) => ({ data: { ...pendingClip, ...(s.payload as object) }, error: null }),
      }) as never,
    );
    vi.mocked(getHeyGenTask).mockResolvedValue({ status: "processing" });

    const res = await POST(req({ action: "poll", clip_id: "clip-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("processing");
    expect(uploadBufferToR2).not.toHaveBeenCalled();
  });

  it("copies a completed HeyGen base clip to R2 and marks the cache ready", async () => {
    const pendingClip = { ...readyClip, status: "pending", video_url: null, storage_key: null, duration_seconds: null };
    let updatedPayload: Record<string, unknown> = {};
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_persona_base_clips:select": () => ({ data: pendingClip, error: null }),
        "podcast_persona_base_clips:update": (s) => {
          updatedPayload = s.payload as Record<string, unknown>;
          return { data: { ...pendingClip, ...updatedPayload }, error: null };
        },
      }) as never,
    );
    vi.mocked(getHeyGenTask).mockResolvedValue({ status: "completed", videoUrl: "https://heygen.example.com/tmp.mp4", duration: 4.7 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(2048) } as Response));

    const res = await POST(req({ action: "poll", clip_id: "clip-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ready");
    expect(uploadBufferToR2).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/^podcast\/base-clips\/persona-1\/clip-1-.*\.mp4$/),
      "video/mp4",
    );
    expect(updatedPayload.status).toBe("ready");
    expect(updatedPayload.video_url).toBe("https://cdn.example.com/new-base.mp4");
    expect(updatedPayload.duration_seconds).toBe(4.7);
  });
});
