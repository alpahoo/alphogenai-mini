import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { triggerNormalizeNativePresenterBase } from "@/lib/modal-client";
import { POST } from "./route";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/modal-client", () => ({
  triggerNormalizeNativePresenterBase: vi.fn(),
}));

function request(body: Record<string, unknown>) {
  return { json: async () => body } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1" });
  vi.mocked(createServiceClient).mockReturnValue({} as never);
  vi.mocked(triggerNormalizeNativePresenterBase).mockResolvedValue();
});

describe("POST /api/presenters/video", () => {
  it("requires bearer authentication", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(request({ action: "prepare" }))).status).toBe(401);
  });

  it("requires explicit likeness consent", async () => {
    const response = await POST(request({ action: "prepare", name: "Maya", consent: false }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/permission/);
  });

  it("requires a separate confirmation before retaining a native base clip", async () => {
    const response = await POST(request({
      action: "prepare",
      name: "Maya",
      consent: true,
      retainForNative: true,
      nativeRetentionConsent: false,
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/separate retention permission/i);
  });

  it("rejects unsupported footage before touching storage", async () => {
    const response = await POST(request({
      action: "prepare",
      name: "Maya",
      consent: true,
      source: { type: "image/jpeg", size: 1_000_000 },
      consentFile: { type: "video/mp4", size: 1_000_000 },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/MP4/);
    expect(createServiceClient).toHaveBeenCalledTimes(1);
  });

  it("prepares a separate private native upload after explicit retention consent", async () => {
    const requestRow = {
      id: "request-1",
      user_id: "user-1",
      name: "Maya",
      provider_name: "AG-request-Maya",
      source_video_path: "user-1/request-1/source.mp4",
      consent_video_path: "user-1/request-1/consent.mp4",
      source_mime: "video/mp4",
      consent_mime: "video/mp4",
      source_size_bytes: 2_000_000,
      consent_size_bytes: 1_000_000,
      status: "uploading",
      external_avatar_id: null,
      presenter_id: null,
      error_code: null,
      created_at: "2026-07-26T12:00:00.000Z",
      updated_at: "2026-07-26T12:00:00.000Z",
    };
    const nativeInsert = vi.fn(async () => ({ error: null }));
    const requestInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: requestRow, error: null })),
      })),
    }));
    const createSignedUploadUrl = vi.fn(async (path: string) => ({
      data: { token: `token:${path}` },
      error: null,
    }));
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "user_video_presenter_requests") {
          return { insert: requestInsert };
        }
        if (table === "user_presenter_native_bases") {
          return { insert: nativeInsert };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({ createSignedUploadUrl })),
      },
    } as never);

    const response = await POST(request({
      action: "prepare",
      name: "Maya",
      consent: true,
      retainForNative: true,
      nativeRetentionConsent: true,
      source: { type: "video/mp4", size: 2_000_000 },
      consentFile: { type: "video/mp4", size: 1_000_000 },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(nativeInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      request_id: expect.any(String),
      video_mime: "video/mp4",
      video_size_bytes: 2_000_000,
      status: "uploading",
      consent_statement_version: expect.stringMatching(/^v1-/),
    }));
    expect(json.uploads.nativeBase).toEqual(expect.objectContaining({
      bucket: NATIVE_PRESENTER_BASE_BUCKET,
      path: expect.stringMatching(/^user-1\/.+\/base\.mp4$/),
      token: expect.stringMatching(/^token:/),
    }));
  });

  it("claims an uploaded native base before starting private normalization", async () => {
    const nativeBase = {
      id: "base-1",
      user_id: "user-1",
      request_id: "request-1",
      name: "Maya",
      video_path: "user-1/base-1/base.mp4",
      video_mime: "video/mp4",
      video_size_bytes: 2_000_000,
      normalized_video_path: null,
      normalized_duration_seconds: null,
      normalized_width: null,
      normalized_height: null,
      normalized_fps: null,
      normalization_version: null,
      normalization_started_at: null,
      normalized_at: null,
      status: "uploaded",
      error_code: null,
      consent_confirmed_at: "2026-07-26T12:00:00.000Z",
      consent_statement_version: "v1-2026-07-26",
      retention_until: "2027-07-26T12:00:00.000Z",
      deleted_at: null,
      created_at: "2026-07-26T12:00:00.000Z",
      updated_at: "2026-07-26T12:00:00.000Z",
    };
    const readQuery = {
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: nativeBase, error: null })),
    };
    const claimQuery = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: { ...nativeBase, status: "normalizing" },
        error: null,
      })),
    };
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => readQuery),
        update: vi.fn(() => claimQuery),
      })),
    } as never);

    const response = await POST(request({
      action: "normalize_native_base",
      requestId: "request-1",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(triggerNormalizeNativePresenterBase).toHaveBeenCalledWith("base-1");
    expect(json.nativeBase).toEqual(expect.objectContaining({
      id: "base-1",
      status: "normalizing",
    }));
  });

  it("reuses an already-ready native base without starting another job", async () => {
    const readQuery = {
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "base-1",
          status: "ready",
          retention_until: "2027-07-26T12:00:00.000Z",
          normalized_at: "2026-07-26T12:05:00.000Z",
        },
        error: null,
      })),
    };
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => readQuery),
      })),
    } as never);

    const response = await POST(request({
      action: "normalize_native_base",
      requestId: "request-1",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.reused).toBe(true);
    expect(triggerNormalizeNativePresenterBase).not.toHaveBeenCalled();
  });
});
