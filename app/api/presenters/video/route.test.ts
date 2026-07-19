import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";

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
});
