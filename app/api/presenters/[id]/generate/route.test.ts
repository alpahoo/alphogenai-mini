import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePhotoAvatar, listVoices, uploadJoggAsset } from "@/lib/jogg-client";
import {
  classifyPresenterProviderError,
  signPresenterPortrait,
  toPublicPresenter,
} from "@/lib/user-presenters";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/jogg-client", () => ({
  generatePhotoAvatar: vi.fn(),
  listVoices: vi.fn(),
  uploadJoggAsset: vi.fn(),
}));
vi.mock("@/lib/user-presenters", () => ({
  classifyPresenterProviderError: vi.fn(() => "generation_failed"),
  encodePresenterProviderTask: vi.fn(
    (task) => `photo:${task.photoId}:${task.voiceId}`,
  ),
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
  vi.mocked(classifyPresenterProviderError).mockReturnValue("generation_failed");
  vi.mocked(getUserFromRequest).mockResolvedValue(USER);
  vi.mocked(signPresenterPortrait).mockResolvedValue("https://signed.example/image.jpg");
  vi.mocked(listVoices).mockResolvedValue([
    { id: "voice-fr", name: "Voice", language: "French", gender: "", previewUrl: null },
  ]);
  vi.mocked(generatePhotoAvatar).mockResolvedValue({ photoId: "photo-1" });
  vi.mocked(uploadJoggAsset).mockResolvedValue("https://res.example/presenter.jpg");
});

describe("POST /api/presenters/[id]/generate", () => {
  it("does not call the paid provider without authentication", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    expect(response.status).toBe(401);
    expect(generatePhotoAvatar).not.toHaveBeenCalled();
  });

  it("reuses a ready presenter without spending again", async () => {
    const ready = { ...BASE, status: "ready", external_avatar_id: "123" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([{ data: ready, error: null }]) as never,
    );
    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).reused).toBe(true);
    expect(generatePhotoAvatar).not.toHaveBeenCalled();
  });

  it("does not spend again when a processing presenter lost its task id", async () => {
    const processing = { ...BASE, status: "processing" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([{ data: processing, error: null }]) as never,
    );
    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    expect(response.status).toBe(409);
    expect(generatePhotoAvatar).not.toHaveBeenCalled();
  });

  it("claims the row before starting the documented photo stage", async () => {
    const claimed = { ...BASE, status: "processing" };
    const saved = {
      ...claimed,
      external_task_id: "photo:photo-1:voice-selected",
    };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([
        { data: BASE, error: null },
        { data: claimed, error: null },
        { data: saved, error: null },
      ]) as never,
    );
    const response = await POST(request({ voiceId: "voice-selected", gender: "Female" }), {
      params: Promise.resolve({ id: BASE.id }),
    });
    expect(response.status).toBe(200);
    expect(generatePhotoAvatar).toHaveBeenCalledTimes(1);
    expect(generatePhotoAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://res.example/presenter.jpg",
        gender: "Female",
        model: "modern",
      }),
    );
    expect(uploadJoggAsset).toHaveBeenCalledWith({
      sourceUrl: "https://signed.example/image.jpg",
      filename: `${BASE.id}.jpg`,
    });
    expect(updates[0]).toMatchObject({ status: "processing", external_task_id: null });
    expect(updates[1]).toMatchObject({
      status: "processing",
      external_avatar_id: null,
      external_task_id: "photo:photo-1:voice-selected",
    });
    expect(toPublicPresenter).toHaveBeenCalled();
  });

  it("persists the photo stage before the final avatar id exists", async () => {
    const claimed = { ...BASE, status: "processing" };
    const saved = { ...claimed, external_task_id: "photo:photo-1:voice-selected" };
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
      external_task_id: "photo:photo-1:voice-selected",
    });
  });

  it("persists a useful failure code without exposing provider details", async () => {
    const claimed = { ...BASE, status: "processing" };
    const failed = { ...BASE, status: "failed", error_message: "insufficient_credits" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([
        { data: BASE, error: null },
        { data: claimed, error: null },
        { data: failed, error: null },
      ]) as never,
    );
    vi.mocked(generatePhotoAvatar).mockRejectedValue(new Error("private provider error"));
    vi.mocked(classifyPresenterProviderError).mockReturnValue("insufficient_credits");

    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toMatch(/credits are currently unavailable/i);
    expect(json.error).not.toMatch(/provider/i);
    expect(updates.at(-1)).toMatchObject({
      status: "failed",
      error_message: "insufficient_credits",
    });
  });

  it("does not start the paid motion task when asset staging fails", async () => {
    const claimed = { ...BASE, status: "processing" };
    const failed = { ...BASE, status: "failed", error_message: "generation_failed" };
    vi.mocked(createServiceClient).mockReturnValue(
      makeService([
        { data: BASE, error: null },
        { data: claimed, error: null },
        { data: failed, error: null },
      ]) as never,
    );
    vi.mocked(uploadJoggAsset).mockRejectedValue(new Error("asset transfer failed"));

    const response = await POST(request(), { params: Promise.resolve({ id: BASE.id }) });

    expect(response.status).toBe(502);
    expect(generatePhotoAvatar).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({
      status: "failed",
      error_message: "generation_failed",
    });
  });
});
