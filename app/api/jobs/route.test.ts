import { beforeEach, describe, expect, it, vi } from "vitest";
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
      return { select };
    }

    return {};
  });

  const service = { from };
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
});
