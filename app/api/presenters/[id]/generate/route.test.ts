import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createPhotoAvatarMotion, listVoices } from "@/lib/jogg-client";
import { signPresenterPortrait, toPublicPresenter } from "@/lib/user-presenters";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/jogg-client", () => ({
  createPhotoAvatarMotion: vi.fn(),
  listVoices: vi.fn(),
}));
vi.mock("@/lib/user-presenters", () => ({
  signPresenterPortrait: vi.fn(),
  toPublicPresenter: vi.fn(async (_service, row) => ({
    id: row.id,
    name: row.name,
    avatarId: row.status === "ready" ? Number(row.external_avatar_id) : null,
    status: row.status,
  })),
}));

const USER = { id: "user-1" };
const BASE = {
  id: "presenter-1",
  user_id: USER.id,
  name: "My Presenter",
  portrait_path: "user-1/image.jpg",
  thumb_path: null,
  image_sha256: "a".repeat(64),
  external_avatar_id: null,
  external_task_id: null,
  status: "uploaded",
  error_message: null,
  created_at: "2026-07-18T00:00:00Z",
  updated_at: "2026-07-18T00:00:00Z",
};

const updates: Record<string, unknown>[] = [];

function makeService(results: unknown[]) {
  let index = 0;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    in: vi.fn(() => query),
    update: vi.fn((value: Record<string, unknown>) => {
      updates.push(value);
      return query;
    }),
    maybeSingle: vi.fn(async () => results[index++] ?? { data: null, error: null }),
  };
  return { from: vi.fn(() => query) };
}

function request(body: Record<string, unknown> = {}) {
  return {
    headers: { get: () => "Bearer token" },
    json: async () => body,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  vi.mocked(getUserFromRequest).mockResolvedValue(USER);
  vi.mocked(signPresenterPortrait).mockResolvedValue("https://signed.example/image.jpg");
  vi.mocked(listVoices).mockResolvedValue([
    { id: "voice-fr", name: "Voice", language: "French", gender: "", previewUrl: null },
  ]);
  vi.mocked(createPhotoAvatarMotion).mockResolvedValue({
    status: "processing",
    avatarId: "123",
    motionId: "motion-1",
  });
});

describe("POST /api/presenters/[id]/generate", () => {
  it("does not call the paid provider without authentication", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    expect(response.status).toBe(401);
    expect(createPhotoAvatarMotion).not.toHaveBeenCalled();
  });

  it("reuses a ready presenter without spending again", async () => {
    const ready = { ...BASE, status: "ready", external_avatar_id: "123" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([{ data: ready, error: null }]) as never,
    );
    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).reused).toBe(true);
    expect(createPhotoAvatarMotion).not.toHaveBeenCalled();
  });

  it("does not spend again when a processing presenter lost its task id", async () => {
    const processing = { ...BASE, status: "processing" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([{ data: processing, error: null }]) as never,
    );
    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    expect(response.status).toBe(409);
    expect(createPhotoAvatarMotion).not.toHaveBeenCalled();
  });

  it("claims the row before starting one paid animation task", async () => {
    const claimed = { ...BASE, status: "processing" };
    const saved = {
      ...claimed,
      external_avatar_id: "123",
      external_task_id: "motion-1",
    };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([
        { data: BASE, error: null },
        { data: claimed, error: null },
        { data: saved, error: null },
      ]) as never,
    );
    const response = await POST(request({ voiceId: "voice-selected" }), {
      params: Promise.resolve({ id: BASE.id }),
    });
    expect(response.status).toBe(200);
    expect(createPhotoAvatarMotion).toHaveBeenCalledTimes(1);
    expect(createPhotoAvatarMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://signed.example/image.jpg",
        voiceId: "voice-selected",
        model: "2.0",
      }),
    );
    expect(updates[0]).toMatchObject({ status: "processing", external_task_id: null });
    expect(updates[1]).toMatchObject({
      status: "processing",
      external_avatar_id: "123",
      external_task_id: "motion-1",
    });
    expect(toPublicPresenter).toHaveBeenCalled();
  });

  it("persists a queued task before the final avatar id exists", async () => {
    const claimed = { ...BASE, status: "processing" };
    const saved = { ...claimed, external_task_id: "motion-queued" };
    vi.mocked(createPhotoAvatarMotion).mockResolvedValue({
      status: "pending",
      motionId: "motion-queued",
    });
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([
        { data: BASE, error: null },
        { data: claimed, error: null },
        { data: saved, error: null },
      ]) as never,
    );
    const response = await POST(request({ voiceId: "voice-selected" }), {
      params: Promise.resolve({ id: BASE.id }),
    });
    expect(response.status).toBe(200);
    expect(updates[1]).toMatchObject({
      status: "processing",
      external_avatar_id: null,
      external_task_id: "motion-queued",
    });
  });
});
