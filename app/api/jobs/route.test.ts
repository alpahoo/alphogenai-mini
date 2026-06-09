import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBytePlusTask } from "@/lib/byteplus-client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

// Keep this file focused on API validation/gates. No provider should be called.
vi.mock("@/lib/evolink-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/evolink-client")>();
  return {
    ...actual,
    createEvoLinkTask: vi.fn(() => { throw new Error("provider should not be called"); }),
    enhanceScenePrompt: vi.fn((prompt: string) => prompt),
  };
});

vi.mock("@/lib/bailian-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bailian-client")>();
  return {
    ...actual,
    createBailianTask: vi.fn(() => { throw new Error("provider should not be called"); }),
    maybeRerouteToBailian: vi.fn((engine: string) => engine),
  };
});

vi.mock("@/lib/byteplus-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/byteplus-client")>();
  return {
    ...actual,
    createBytePlusTask: vi.fn(() => { throw new Error("provider should not be called"); }),
  };
});

vi.mock("@/lib/atlascloud-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atlascloud-client")>();
  return {
    ...actual,
    createAtlasTask: vi.fn(() => { throw new Error("provider should not be called"); }),
  };
});

vi.mock("@/lib/heygen-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/heygen-client")>();
  return {
    ...actual,
    createAvatarVideo: vi.fn(),
    createAvatarShotsVideo: vi.fn(),
    createLipsync: vi.fn(),
    generateSpeech: vi.fn(),
  };
});

const user = { id: "user-1" };

function jobsRequest(body: unknown): Request {
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(currentUser: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: currentUser } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function queryResult<T>(value: T) {
  const thenable = {
    then: (resolve: (v: T) => unknown) => Promise.resolve(resolve(value)),
  };
  return thenable as unknown as PromiseLike<T>;
}

type ServiceOptions = {
  plan?: "free" | "pro" | "premium";
  activeCount?: number | null;
  recentCount?: number | null;
};

function mockService({ plan = "free", activeCount = 0, recentCount = 0 }: ServiceOptions = {}) {
  const jobsInsert = vi.fn((row: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "job-1", ...row },
        error: null,
      }),
    })),
  }));
  const jobsUpdate = vi.fn(() => ({
    eq: vi.fn(() => queryResult({ data: null, error: null })),
  }));
  const jobScenesInsert = vi.fn(() => queryResult({ data: null, error: null }));
  const jobScenesUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => queryResult({ data: null, error: null })),
    })),
  }));

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      const single = vi.fn().mockResolvedValue({ data: { plan }, error: null });
      const eq = vi.fn(() => ({ single }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }

    if (table === "jobs") {
      const select = vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) {
          const eq = vi.fn(() => ({
            in: vi.fn(() => queryResult({ count: activeCount, error: null })),
            gte: vi.fn(() => queryResult({ count: recentCount, error: null })),
          }));
          return { eq };
        }
        return { single: vi.fn() };
      });
      return { insert: jobsInsert, select, update: jobsUpdate };
    }

    if (table === "job_scenes") {
      return { insert: jobScenesInsert, update: jobScenesUpdate };
    }

    return {};
  });

  const service = { from, jobsInsert, jobsUpdate, jobScenesInsert, jobScenesUpdate };
  vi.mocked(createServiceClient).mockReturnValue(service as unknown as ReturnType<typeof createServiceClient>);
  return service;
}

describe("POST /api/jobs validation and gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(user);
    mockService();
  });

  it("rejects missing or too-short prompts before DB queries", async () => {
    const service = mockService();

    const res = await POST(jobsRequest({ prompt: "hi" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Prompt is required (min 3 characters)" });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("blocks policy-violating prompts before DB queries", async () => {
    const service = mockService();

    const res = await POST(jobsRequest({ prompt: "Spider-Man fighting in a Disney castle" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("COPYRIGHTED_IP");
    expect(body.error).toContain("protected brands/characters");
    expect(service.from).not.toHaveBeenCalled();
  });

  it("rejects reference storage paths outside the current user's folder", async () => {
    const service = mockService();

    const res = await POST(jobsRequest({
      prompt: "A cinematic product shot on a table",
      references: {
        images: [{ role: "outfit_style", storage_path: "other-user/ref.png", url: "https://signed.example.com/ref.png" }],
      },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Storage path does not belong to user",
      code: "STORAGE_PATH_OWNERSHIP_MISMATCH",
    });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("enforces one active generation per user", async () => {
    mockService({ plan: "premium", activeCount: 1 });

    const res = await POST(jobsRequest({ prompt: "A cinematic city skyline at sunset" }));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "You already have an active generation. Please wait for it to finish.",
    });
  });

  it("enforces daily quota for free users", async () => {
    mockService({ plan: "free", activeCount: 0, recentCount: 1 });

    const res = await POST(jobsRequest({ prompt: "A cinematic city skyline at sunset" }));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "You've reached your free limit. Upgrade to Pro for more generations.",
      upgrade: true,
    });
  });

  it("blocks pro models for free users before provider calls", async () => {
    mockService({ plan: "free", activeCount: 0, recentCount: 0 });

    const res = await POST(jobsRequest({
      prompt: "A cinematic city skyline at sunset",
      preferred_engine: "evolink_fast",
    }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "This model requires a higher plan. Upgrade to Pro or Premium.",
      upgrade: true,
    });
  });

  it("preserves the UGC payload through job and scene inserts", async () => {
    const service = mockService({ plan: "premium", activeCount: 0, recentCount: 0 });
    vi.mocked(createBytePlusTask).mockResolvedValue("task-ugc-1");

    const references = {
      images: [
        {
          role: "product_reference",
          storage_path: "user-1/product.png",
          url: "https://signed.example.com/product.png",
          filename: "product.png",
        },
        {
          role: "outfit_reference",
          storage_path: "user-1/outfit.png",
          url: "https://signed.example.com/outfit.png",
          filename: "outfit.png",
        },
      ],
    };

    const res = await POST(jobsRequest({
      prompt: "UGC creator video for a travel jacket",
      preferred_engine: "seedance2_fast_byteplus",
      references,
      byteplus_asset_ids: [" asset-creator-1 ", "bad-id", "asset-creator-2"],
      aspect_ratio: "9:16",
      caption_mode: "auto",
      scenes: [
        { prompt: "Hook with product visible", duration_sec: 2, engine: "seedance2_fast_byteplus" },
        { prompt: "Demo the jacket pockets", duration_sec: 12, engine: "seedance2_fast_byteplus" },
      ],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(service.jobsInsert).toHaveBeenCalledTimes(1);
    const insertedJob = service.jobsInsert.mock.calls[0][0];
    expect(insertedJob).toMatchObject({
      prompt: "UGC creator video for a travel jacket",
      engine_used: "seedance2_fast_byteplus",
      references_payload: references,
      byteplus_asset_ids: ["asset-creator-1", "asset-creator-2"],
      aspect_ratio: "9:16",
      caption_mode: "auto",
      user_id: "user-1",
    });
    expect(insertedJob.storyboard).toEqual([
      {
        scene_index: 0,
        prompt: "Hook with product visible",
        engine: "seedance2_fast_byteplus",
        duration_sec: 3,
      },
      {
        scene_index: 1,
        prompt: "Demo the jacket pockets",
        engine: "seedance2_fast_byteplus",
        duration_sec: 10,
      },
    ]);

    expect(service.jobScenesInsert).toHaveBeenCalledWith([
      {
        job_id: "job-1",
        scene_index: 0,
        prompt: "Hook with product visible",
        engine: "seedance2_fast_byteplus",
        duration_sec: 3,
        status: "pending",
      },
      {
        job_id: "job-1",
        scene_index: 1,
        prompt: "Demo the jacket pockets",
        engine: "seedance2_fast_byteplus",
        duration_sec: 10,
        status: "pending",
      },
    ]);

    expect(createBytePlusTask).toHaveBeenCalledWith(expect.objectContaining({
      engineKey: "seedance2_fast_byteplus",
      references,
      assetIds: ["asset-creator-1", "asset-creator-2"],
      aspectRatio: "9:16",
      prompt: "Hook with product visible",
      duration: 3,
    }));
  });
});
