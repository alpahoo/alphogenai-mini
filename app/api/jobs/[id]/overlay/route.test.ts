import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerApplyOverlays } from "@/lib/modal-client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/modal-client", () => ({
  triggerApplyOverlays: vi.fn(),
}));

const user = { id: "user-1" };
const researchJobId = "11111111-1111-4111-8111-111111111111";
const jobId = "job-1";

type MockServiceOptions = {
  userId?: string;
  job?: Record<string, unknown> | null;
  researchJob?: Record<string, unknown> | null;
  storyboard?: Record<string, unknown> | null;
  angle?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
};

function mockAuth(currentUser: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: currentUser } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function mockService({
  userId = user.id,
  job = {
    id: jobId,
    user_id: userId,
    status: "done",
    video_url: "https://cdn.example.com/raw.mp4",
    output_url_final: null,
    metadata: { research_job_id: researchJobId },
  },
  researchJob = { id: researchJobId },
  storyboard = {
    scenes_json: [
      {
        title: "Opening",
        duration_sec: 5,
        voiceover_line: "A sourced opening line.",
        source_citation: "Research source",
      },
    ],
  },
  angle = { title: "A sourced angle", hook: "Why it matters." },
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

    if (table === "research_jobs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                researchJob ? { data: researchJob, error: null } : { data: null, error: { message: "not found" } }
              ),
            })),
          })),
        })),
      };
    }

    if (table === "research_storyboards") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(
                  storyboard ? { data: storyboard, error: null } : { data: null, error: { message: "not found" } }
                ),
              })),
            })),
          })),
        })),
      };
    }

    if (table === "research_angles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: angle, error: null }),
              })),
            })),
          })),
        })),
      };
    }

    return {};
  });

  const service = { from, jobsUpdate, jobsUpdateEq };
  vi.mocked(createServiceClient).mockReturnValue(service as unknown as ReturnType<typeof createServiceClient>);
  return service;
}

function overlayRequest(): Request {
  return new Request(`http://localhost/api/jobs/${jobId}/overlay`, { method: "POST" });
}

function params(id = jobId) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/jobs/[id]/overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(user);
    mockService();
    vi.mocked(triggerApplyOverlays).mockResolvedValue("https://cdn.example.com/branded.mp4");
  });

  it("requires authentication", async () => {
    mockAuth(null);

    const res = await POST(overlayRequest(), params());

    expect(res.status).toBe(401);
    expect(triggerApplyOverlays).not.toHaveBeenCalled();
  });

  it("applies overlays to an owned completed research-backed job and updates output_url_final only", async () => {
    const service = mockService();

    const res = await POST(overlayRequest(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      output_url_final: "https://cdn.example.com/branded.mp4",
      raw_video_url: "https://cdn.example.com/raw.mp4",
    });
    expect(triggerApplyOverlays).toHaveBeenCalledWith(
      jobId,
      "https://cdn.example.com/raw.mp4",
      expect.objectContaining({
        enabled: true,
        brand: expect.objectContaining({ watermark_text: "AlphoGen" }),
      })
    );
    expect(service.jobsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      output_url_final: "https://cdn.example.com/branded.mp4",
    }));
    expect(service.jobsUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      video_url: expect.any(String),
    }));
  });

  it("keeps the raw video when Modal overlay fails", async () => {
    const service = mockService();
    vi.mocked(triggerApplyOverlays).mockRejectedValue(new Error("modal unavailable"));

    const res = await POST(overlayRequest(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: false,
      fallback: true,
      video_url: "https://cdn.example.com/raw.mp4",
      error: "Overlay failed; original video kept",
    });
    expect(service.jobsUpdate).not.toHaveBeenCalled();
  });

  it("rejects jobs without a research metadata link", async () => {
    mockService({
      job: {
        id: jobId,
        user_id: user.id,
        status: "done",
        video_url: "https://cdn.example.com/raw.mp4",
        output_url_final: null,
        metadata: {},
      },
    });

    const res = await POST(overlayRequest(), params());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "This job is not linked to a research plan" });
    expect(triggerApplyOverlays).not.toHaveBeenCalled();
  });
});
