import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { GET } from "./route";

// Provider / pipeline modules are mocked so the state machine stays inert:
// these tests only cover access control on GET /api/jobs/[id].
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/flags", () => ({
  isAdminEmail: (email: string | null | undefined) => email === "admin@example.com",
}));
vi.mock("@/lib/evolink-client", () => ({
  isEvoLinkEngine: () => false,
  getEvoLinkTask: vi.fn(),
  createEvoLinkTask: vi.fn(),
  engineSupportsFirstFrame: () => false,
}));
vi.mock("@/lib/bailian-client", () => ({
  isBailianEngine: () => false,
  getBailianTask: vi.fn(),
  createBailianTask: vi.fn(),
}));
vi.mock("@/lib/byteplus-client", () => ({
  isBytePlusEngine: () => false,
  getBytePlusTask: vi.fn(),
  createBytePlusTask: vi.fn(),
}));
vi.mock("@/lib/atlascloud-client", () => ({
  isAtlasEngine: () => false,
  getAtlasTask: vi.fn(),
  createAtlasTask: vi.fn(),
}));
vi.mock("@/lib/heygen-client", () => ({
  isHeyGenEngine: () => false,
  getHeyGenTask: vi.fn(),
  createLipsync: vi.fn(),
  getLipsyncTask: vi.fn(),
}));
vi.mock("@/lib/modal-client", () => ({
  triggerExtractLastFrame: vi.fn(),
  triggerConcatScenes: vi.fn(),
  triggerApplyVoiceover: vi.fn(),
  triggerRenderNativeProductAd: vi.fn(),
}));
vi.mock("@/lib/tts", () => ({ generateVoiceover: vi.fn(), isTTSAvailable: () => false }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn(), downloadAndUploadToR2: vi.fn() }));
vi.mock("@/lib/jogg-client", () => ({ getProductVideo: vi.fn() }));
vi.mock("@/lib/jogg-poll-core", () => ({ settleJoggJob: vi.fn() }));
vi.mock("@/lib/video-presenter-native-animation-provider", () => ({
  pollNativePresenterAnimation: vi.fn(),
}));

const OWNER = { id: "user-a", email: "a@example.com" };
const OTHER = { id: "user-b", email: "b@example.com" };
const ADMIN = { id: "user-admin", email: "admin@example.com" };
const JOB_ID = "job-of-a";

const JOB = {
  id: JOB_ID,
  user_id: OWNER.id,
  prompt: "private prompt of A",
  status: "done",
  engine_used: "wan",
  video_url: "https://cdn.example.com/a.mp4",
  output_url_final: null,
  app_state: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

function mockAuth(user: { id: string; email?: string } | null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user } });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return getUser;
}

function mockService(job: Record<string, unknown> | null = JOB) {
  const from = vi.fn((table: string) => {
    if (table === "jobs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(
              job ? { data: job, error: null } : { data: null, error: { message: "not found" } },
            ),
          })),
        })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }
    if (table === "job_scenes") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      };
    }
    return {};
  });
  const service = { from };
  vi.mocked(createServiceClient).mockReturnValue(
    service as unknown as ReturnType<typeof createServiceClient>,
  );
  return service;
}

function req(headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/jobs/${JOB_ID}`, { headers });
}

const params = (id = JOB_ID) => ({ params: Promise.resolve({ id }) });

describe("GET /api/jobs/[id] — access control", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mockService();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("returns 401 to an anonymous caller without touching the jobs table", async () => {
    mockAuth(null);
    const service = mockService();
    const res = await GET(req(), params());
    expect(res.status).toBe(401);
    expect(service.from).not.toHaveBeenCalled();
  });

  it("returns 403 when user B reads user A's job, with no job data", async () => {
    mockAuth(OTHER);
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
    expect(JSON.stringify(body)).not.toContain("private prompt");
  });

  it("returns the job to its owner (formatted, without user_id)", async () => {
    mockAuth(OWNER);
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe(JOB_ID);
    expect(body.job.prompt).toBe("private prompt of A");
    expect(body.job).not.toHaveProperty("user_id");
    expect(body.scenes).toEqual([]);
  });

  it("lets an admin read any job", async () => {
    mockAuth(ADMIN);
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("lets the cron poller through with the CRON_SECRET bearer, without a session", async () => {
    const getUser = mockAuth(null);
    const res = await GET(req({ authorization: "Bearer test-cron-secret" }), params());
    expect(res.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("does not treat a wrong bearer as the cron (falls back to session → 401)", async () => {
    mockAuth(null);
    const res = await GET(req({ authorization: "Bearer nope" }), params());
    expect(res.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is unset, even with an empty bearer", async () => {
    delete process.env.CRON_SECRET;
    mockAuth(null);
    const res = await GET(req({ authorization: "Bearer " }), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 to an authenticated user for an unknown job", async () => {
    mockAuth(OWNER);
    mockService(null);
    const res = await GET(req(), params("missing"));
    expect(res.status).toBe(404);
  });
});
