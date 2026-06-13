import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerApplyResearchVoiceover } from "@/lib/modal-client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isHeyGenEngine } from "@/lib/heygen-client";
import { isTTSAvailable } from "@/lib/tts";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/modal-client", () => ({ triggerApplyResearchVoiceover: vi.fn() }));
vi.mock("@/lib/heygen-client", () => ({ isHeyGenEngine: vi.fn() }));
vi.mock("@/lib/tts", () => ({ generateVoiceover: vi.fn(), isTTSAvailable: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));

const user = { id: "user-1" };
const jobId = "job-1";

type MockServiceOptions = {
  job?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
};

function mockAuth(currentUser: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: currentUser } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function mockService({
  job = {
    id: jobId,
    user_id: user.id,
    status: "done",
    video_url: "https://cdn.example.com/raw.mp4",
    output_url_final: null,
    voiceover_url: "https://cdn.example.com/voice.mp3",
    voiceover_text: "A sourced narration.",
    engine_used: "seedance2_atlas",
  },
  updateError = null,
}: MockServiceOptions = {}) {
  const jobsUpdateEq = vi.fn().mockResolvedValue({ data: null, error: updateError });
  const jobsUpdate = vi.fn(() => ({ eq: jobsUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === "jobs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(
              job ? { data: job, error: null } : { data: null, error: { message: "not found" } }
            ),
          })),
        })),
        update: jobsUpdate,
      };
    }
    return {};
  });

  const service = { from, jobsUpdate, jobsUpdateEq };
  vi.mocked(createServiceClient).mockReturnValue(service as unknown as ReturnType<typeof createServiceClient>);
  return service;
}

function req(): Request {
  return new Request(`http://localhost/api/jobs/${jobId}/voiceover`, { method: "POST" });
}

function params(id = jobId) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/jobs/[id]/voiceover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(user);
    mockService();
    vi.mocked(isHeyGenEngine).mockReturnValue(false);
    vi.mocked(isTTSAvailable).mockReturnValue(true);
    vi.mocked(triggerApplyResearchVoiceover).mockResolvedValue("https://cdn.example.com/voiced.mp4");
  });

  it("requires authentication", async () => {
    mockAuth(null);
    const res = await POST(req(), params());
    expect(res.status).toBe(401);
    expect(triggerApplyResearchVoiceover).not.toHaveBeenCalled();
  });

  it("muxes an owned completed job and updates output_url_final only", async () => {
    const service = mockService();
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      output_url_final: "https://cdn.example.com/voiced.mp4",
      raw_video_url: "https://cdn.example.com/raw.mp4",
    });
    expect(triggerApplyResearchVoiceover).toHaveBeenCalledWith(jobId);
    expect(service.jobsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ output_url_final: "https://cdn.example.com/voiced.mp4" })
    );
    expect(service.jobsUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ video_url: expect.any(String) })
    );
  });

  it("keeps the raw video when the Modal mux fails", async () => {
    const service = mockService();
    vi.mocked(triggerApplyResearchVoiceover).mockRejectedValue(new Error("modal down"));
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: false,
      fallback: true,
      video_url: "https://cdn.example.com/raw.mp4",
      error: "Voice-over mux failed; original video kept",
    });
    expect(service.jobsUpdate).not.toHaveBeenCalled();
  });

  it("rejects HeyGen avatar jobs (they have their own voice track)", async () => {
    mockService({
      job: {
        id: jobId,
        user_id: user.id,
        status: "done",
        video_url: "https://cdn.example.com/raw.mp4",
        output_url_final: null,
        voiceover_url: "https://cdn.example.com/voice.mp3",
        voiceover_text: null,
        engine_used: "heygen_avatar_iv",
      },
    });
    vi.mocked(isHeyGenEngine).mockReturnValue(true);
    const res = await POST(req(), params());
    expect(res.status).toBe(400);
    expect(triggerApplyResearchVoiceover).not.toHaveBeenCalled();
  });

  it("rejects a job with no narration at all", async () => {
    mockService({
      job: {
        id: jobId,
        user_id: user.id,
        status: "done",
        video_url: "https://cdn.example.com/raw.mp4",
        output_url_final: null,
        voiceover_url: null,
        voiceover_text: null,
        engine_used: "seedance2_atlas",
      },
    });
    const res = await POST(req(), params());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "This job has no voice-over narration" });
    expect(triggerApplyResearchVoiceover).not.toHaveBeenCalled();
  });
});
