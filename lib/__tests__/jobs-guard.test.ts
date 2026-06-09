import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCanCreateJob, MAX_ACTIVE_JOBS } from "@/lib/jobs/guard";

// Pure gate logic — no provider should ever be reached from here. We mock the
// engine clients defensively (the guard only touches their pure predicates,
// but this keeps the test honest if that ever changes).
vi.mock("@/lib/evolink-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/evolink-client")>();
  return { ...actual, createEvoLinkTask: vi.fn(() => { throw new Error("provider should not be called"); }) };
});
vi.mock("@/lib/bailian-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bailian-client")>();
  return { ...actual, createBailianTask: vi.fn(() => { throw new Error("provider should not be called"); }) };
});
vi.mock("@/lib/heygen-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/heygen-client")>();
  return { ...actual, createAvatarVideo: vi.fn(), createAvatarShotsVideo: vi.fn() };
});

const USER = "user-1";

function queryResult<T>(value: T) {
  const thenable = { then: (resolve: (v: T) => unknown) => Promise.resolve(resolve(value)) };
  return thenable as unknown as PromiseLike<T>;
}

type ServiceOptions = {
  plan?: "free" | "pro" | "premium";
  activeCount?: number | null;
  recentCount?: number | null;
};

/** Minimal service-role mock: profiles.plan + jobs active/recent counts. */
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
  return service as unknown as SupabaseClient & { from: typeof from };
}

describe("assertCanCreateJob (shared create-job gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a sane active-jobs cap", () => {
    expect(MAX_ACTIVE_JOBS).toBe(1);
  });

  it("rejects a missing or too-short prompt before any DB query", async () => {
    const service = mockService();
    const res = await assertCanCreateJob(service, { userId: USER, prompt: "hi" });
    expect(res).toEqual({ ok: false, status: 400, body: { error: "Prompt is required (min 3 characters)" } });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("rejects an over-long prompt", async () => {
    const service = mockService();
    const res = await assertCanCreateJob(service, { userId: USER, prompt: "x".repeat(2001) });
    expect(res).toEqual({ ok: false, status: 400, body: { error: "Prompt too long (max 2000 characters)" } });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("blocks a policy-violating prompt before any DB query", async () => {
    const service = mockService();
    const res = await assertCanCreateJob(service, { userId: USER, prompt: "Spider-Man fighting in a Disney castle" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("COPYRIGHTED_IP");
    expect(res.body.error).toContain("protected brands/characters");
    expect(res.body.policy).toBeDefined();
    expect(service.from).not.toHaveBeenCalled();
  });

  it("screens the script_text alongside the prompt", async () => {
    const service = mockService();
    const res = await assertCanCreateJob(service, {
      userId: USER,
      prompt: "A calm vlog intro",
      scriptText: "Today I'm dressed as Spider-Man",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.body.code).toBe("COPYRIGHTED_IP");
    expect(service.from).not.toHaveBeenCalled();
  });

  it("rejects a reference storage path outside the user's folder", async () => {
    const service = mockService();
    const res = await assertCanCreateJob(service, {
      userId: USER,
      prompt: "A cinematic product shot on a table",
      references: {
        images: [{ role: "outfit_style", storage_path: "other-user/ref.png", url: "https://signed.example.com/ref.png" }],
      },
    });
    expect(res).toEqual({
      ok: false,
      status: 400,
      body: { error: "Storage path does not belong to user", code: "STORAGE_PATH_OWNERSHIP_MISMATCH" },
    });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("enforces one active generation per user", async () => {
    const service = mockService({ plan: "premium", activeCount: 1 });
    const res = await assertCanCreateJob(service, { userId: USER, prompt: "A cinematic city skyline at sunset" });
    expect(res).toEqual({
      ok: false,
      status: 429,
      body: { error: "You already have an active generation. Please wait for it to finish." },
    });
  });

  it("enforces the daily quota for free users", async () => {
    const service = mockService({ plan: "free", activeCount: 0, recentCount: 1 });
    const res = await assertCanCreateJob(service, { userId: USER, prompt: "A cinematic city skyline at sunset" });
    expect(res).toEqual({
      ok: false,
      status: 429,
      body: { error: "You've reached your free limit. Upgrade to Pro for more generations.", upgrade: true },
    });
  });

  it("blocks a Pro-only engine for a free user", async () => {
    const service = mockService({ plan: "free" });
    const res = await assertCanCreateJob(service, {
      userId: USER,
      prompt: "A cinematic city skyline at sunset",
      preferredEngine: "evolink_fast",
    });
    expect(res).toEqual({
      ok: false,
      status: 403,
      body: { error: "This model requires a higher plan. Upgrade to Pro or Premium.", upgrade: true },
    });
  });

  it("allows a valid free-plan job and returns the resolved plan", async () => {
    const service = mockService({ plan: "free" });
    const res = await assertCanCreateJob(service, { userId: USER, prompt: "A cinematic city skyline at sunset" });
    expect(res).toEqual({ ok: true, plan: "free" });
  });

  it("resolves the plan from profiles (never the caller)", async () => {
    const service = mockService({ plan: "pro" });
    const res = await assertCanCreateJob(service, {
      userId: USER,
      prompt: "A cinematic city skyline at sunset",
      preferredEngine: "evolink_fast",
    });
    expect(res).toEqual({ ok: true, plan: "pro" });
  });

  it("allows an anonymous request (no quota/profile lookup)", async () => {
    const service = mockService();
    const res = await assertCanCreateJob(service, { userId: null, prompt: "A cinematic city skyline at sunset" });
    expect(res).toEqual({ ok: true, plan: "free" });
    expect(service.from).not.toHaveBeenCalled();
  });

  describe("HeyGen avatar engines (Premium-only)", () => {
    it("requires a Premium plan", async () => {
      const service = mockService({ plan: "pro" });
      const res = await assertCanCreateJob(service, {
        userId: USER,
        prompt: "Avatar presenter intro",
        preferredEngine: "heygen_avatar_iv",
        avatarId: "avatar-1",
        voiceId: "voice-1",
      });
      expect(res).toEqual({
        ok: false,
        status: 403,
        body: { error: "Avatar generation requires a Premium plan. Upgrade to access.", upgrade: true },
      });
    });

    it("requires an avatar (or saved look)", async () => {
      const service = mockService({ plan: "premium" });
      const res = await assertCanCreateJob(service, {
        userId: USER,
        prompt: "Avatar presenter intro",
        preferredEngine: "heygen_avatar_iv",
        voiceId: "voice-1",
      });
      expect(res).toEqual({ ok: false, status: 400, body: { error: "An avatar is required." } });
    });

    it("requires a voice for Avatar IV", async () => {
      const service = mockService({ plan: "premium" });
      const res = await assertCanCreateJob(service, {
        userId: USER,
        prompt: "Avatar presenter intro",
        preferredEngine: "heygen_avatar_iv",
        avatarId: "avatar-1",
      });
      expect(res).toEqual({ ok: false, status: 400, body: { error: "A voice is required for Avatar IV." } });
    });

    it("allows Avatar IV with avatar + voice on Premium", async () => {
      const service = mockService({ plan: "premium" });
      const res = await assertCanCreateJob(service, {
        userId: USER,
        prompt: "Avatar presenter intro",
        preferredEngine: "heygen_avatar_iv",
        avatarId: "avatar-1",
        voiceId: "voice-1",
      });
      expect(res).toEqual({ ok: true, plan: "premium" });
    });

    it("allows Avatar Shots with an avatar and no voice on Premium", async () => {
      const service = mockService({ plan: "premium" });
      const res = await assertCanCreateJob(service, {
        userId: USER,
        prompt: "Cinematic avatar shot",
        preferredEngine: "heygen_avatar_shots",
        avatarId: "avatar-1",
      });
      expect(res).toEqual({ ok: true, plan: "premium" });
    });

    it("accepts a saved look in place of an avatar", async () => {
      const service = mockService({ plan: "premium" });
      const res = await assertCanCreateJob(service, {
        userId: USER,
        prompt: "Cinematic avatar shot",
        preferredEngine: "heygen_avatar_shots",
        lookId: "look-1",
      });
      expect(res).toEqual({ ok: true, plan: "premium" });
    });
  });
});
