import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

function request(body: Record<string, unknown>) {
  return { json: async () => body } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1" });
  vi.mocked(createServiceClient).mockReturnValue({} as never);
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
});
