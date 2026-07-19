import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createPhotoAvatarMotion,
  getPhotoAvatarGeneration,
  getPhotoAvatarMotion,
} from "@/lib/jogg-client";
import { GET } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/jogg-client", () => ({
  createPhotoAvatarMotion: vi.fn(),
  getPhotoAvatarGeneration: vi.fn(),
  getPhotoAvatarMotion: vi.fn(),
}));
vi.mock("@/lib/user-presenters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/user-presenters")>();
  return {
    ...actual,
    toPublicPresenter: vi.fn(async (_service, row) => ({
      id: row.id,
      status: row.status,
      avatarId: row.external_avatar_id ? Number(row.external_avatar_id) : null,
      error: row.error_message,
    })),
  };
});

const USER = { id: "user-1" };
const BASE = {
  id: "presenter-1",
  user_id: USER.id,
  name: "Presenter",
  portrait_path: "user-1/a.jpg",
  thumb_path: null,
  image_sha256: "a".repeat(64),
  external_avatar_id: null,
  external_task_id: null,
  status: "processing",
  error_message: null,
  created_at: "2026-07-19T00:00:00Z",
  updated_at: new Date().toISOString(),
};

const updates: Record<string, unknown>[] = [];

function makeService(
  initial: Record<string, unknown>,
  updated: Record<string, unknown>,
) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    update: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: initial, error: null })),
    single: vi.fn(async () => ({ data: updated, error: null })),
  };
  return { from: vi.fn(() => query) };
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  vi.mocked(getUserFromRequest).mockResolvedValue(USER);
});

describe("GET /api/presenters/[id]/status", () => {
  it("turns a stale processing row into a retryable failure", async () => {
    const stale = { ...BASE, updated_at: "2026-07-19T00:00:00Z" };
    const failed = { ...stale, status: "failed", error_message: "generation_timeout" };
    vi.mocked(createServiceClient).mockReturnValue(makeService(stale, failed) as never);
    const response = await GET({ headers: { get: () => "Bearer x" } } as never, {
      params: Promise.resolve({ id: BASE.id }),
    });
    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "failed", error_message: "generation_timeout" });
    expect(getPhotoAvatarGeneration).not.toHaveBeenCalled();
  });

  it("advances a completed photo into the motion stage", async () => {
    const photoTask = {
      ...BASE,
      external_task_id: "photo:eyJwaG90b0lkIjoicGhvdG8tMSIsInZvaWNlSWQiOiJ2b2ljZS0xIn0",
    };
    const motionTask = { ...photoTask, external_avatar_id: "445593", external_task_id: "motion:m-1" };
    vi.mocked(createServiceClient).mockReturnValue(makeService(photoTask, motionTask) as never);
    vi.mocked(getPhotoAvatarGeneration).mockResolvedValue({
      status: "completed",
      photoId: "photo-1",
      imageUrls: ["https://res.example/generated.png"],
    });
    vi.mocked(createPhotoAvatarMotion).mockResolvedValue({
      status: "processing",
      avatarId: "445593",
      motionId: "m-1",
    });
    const response = await GET({ headers: { get: () => "Bearer x" } } as never, {
      params: Promise.resolve({ id: BASE.id }),
    });
    expect(response.status).toBe(200);
    expect(createPhotoAvatarMotion).toHaveBeenCalledWith(expect.objectContaining({
      photoId: "photo-1",
      imageUrl: "https://res.example/generated.png",
      voiceId: "voice-1",
    }));
    expect(updates[0]).toMatchObject({
      status: "processing",
      external_avatar_id: "445593",
      external_task_id: "motion:m-1",
    });
  });

  it("marks a completed motion ready with its reusable custom avatar id", async () => {
    const motionTask = { ...BASE, external_task_id: "motion:m-1" };
    const ready = { ...motionTask, status: "ready", external_avatar_id: "445593" };
    vi.mocked(createServiceClient).mockReturnValue(makeService(motionTask, ready) as never);
    vi.mocked(getPhotoAvatarMotion).mockResolvedValue({
      status: "completed",
      avatarId: "445593",
      motionId: "m-1",
    });
    const response = await GET({ headers: { get: () => "Bearer x" } } as never, {
      params: Promise.resolve({ id: BASE.id }),
    });
    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "ready", external_avatar_id: "445593" });
  });
});
