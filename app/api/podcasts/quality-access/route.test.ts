import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { resolveUserPlan } from "@/lib/jobs/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { isPodcastBalancedBetaEligible } from "@/lib/podcast/lipsync-beta";
import { isLatentSyncBalancedEnabled } from "@/lib/podcast/lipsync-routing";
import { GET } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/jobs/guard", () => ({ resolveUserPlan: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/podcast/lipsync-beta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/podcast/lipsync-beta")>();
  return { ...actual, isPodcastBalancedBetaEligible: vi.fn() };
});
vi.mock("@/lib/podcast/lipsync-routing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/podcast/lipsync-routing")>();
  return { ...actual, isLatentSyncBalancedEnabled: vi.fn() };
});

const req = {} as never;

describe("GET /api/podcasts/quality-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServiceClient).mockReturnValue({} as never);
    vi.mocked(resolveUserPlan).mockResolvedValue("premium");
    vi.mocked(isLatentSyncBalancedEnabled).mockReturnValue(true);
    vi.mocked(isPodcastBalancedBetaEligible).mockReturnValue(true);
  });

  it("returns 401 without a verified user", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await GET(req)).status).toBe(401);
  });

  it("exposes provider-neutral beta access details", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "u1", email: "beta@example.com" });
    const res = await GET(req);
    const json = await res.json();
    expect(json.balanced).toMatchObject({ eligible: true, status: "beta", maxConcurrentClips: 2 });
    expect(JSON.stringify(json)).not.toMatch(/latent|modal|heygen/i);
  });

  it("stays locked when the server feature flag is off", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "u1", email: "beta@example.com" });
    vi.mocked(isLatentSyncBalancedEnabled).mockReturnValue(false);
    const json = await (await GET(req)).json();
    expect(json.balanced).toMatchObject({ eligible: false, status: "locked" });
  });
});
