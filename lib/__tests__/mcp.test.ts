import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseToken,
  parseBearer,
  hashTokenSecret,
  resolveMcpActor,
  hasScope,
} from "@/lib/mcp/auth";
import { toPublicJob, scrubProviders } from "@/lib/mcp/serialize";
import { MCP_TOOLS, toolCatalog } from "@/lib/mcp/tools";
import type { McpActor } from "@/lib/mcp/types";

// Pure-logic tests — providers must never be reached.
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

// validate_job_payload reuses the shared gate. The gate has its own 18 tests
// (lib/__tests__/jobs-guard.test.ts); here we only assert the tool's mapping.
vi.mock("@/lib/jobs/guard", () => ({
  MAX_ACTIVE_JOBS: 1,
  assertCanCreateJob: vi.fn(),
}));
import { assertCanCreateJob } from "@/lib/jobs/guard";

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
describe("mcp/auth — token parsing", () => {
  it("parses a well-formed PAT", () => {
    expect(parseToken("agk_abc123_secretXYZ")).toEqual({ tokenId: "abc123", secret: "secretXYZ" });
  });
  it("rejects a missing prefix / empty parts / bad chars", () => {
    expect(parseToken("xyz_abc_secret")).toBeNull();
    expect(parseToken("agk__secret")).toBeNull();
    expect(parseToken("agk_abc_")).toBeNull();
    expect(parseToken("agk_abc")).toBeNull();
    expect(parseToken("agk_ab-c_sec!")).toBeNull();
  });
  it("extracts a bearer token", () => {
    expect(parseBearer("Bearer agk_a_b")).toBe("agk_a_b");
    expect(parseBearer("bearer agk_a_b")).toBe("agk_a_b");
    expect(parseBearer("Basic xxx")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});

describe("mcp/auth — resolveMcpActor (fail-closed)", () => {
  const ORIG = { ...process.env };
  const PEPPER = "test-pepper";
  const SECRET = "supersecretvalue";
  const TOKEN_ID = "tok123";

  function req(authHeader?: string): Request {
    return new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: authHeader ? { authorization: authHeader } : {},
    });
  }

  beforeEach(() => {
    process.env.MCP_TOKEN_PEPPER = PEPPER;
    process.env.MCP_TEST_TOKEN_ID = TOKEN_ID;
    process.env.MCP_TEST_TOKEN_SECRET_HASH = hashTokenSecret(SECRET, PEPPER);
    process.env.MCP_TEST_USER_ID = "user-test";
    process.env.MCP_TEST_TOKEN_SCOPES = "read,plan";
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("rejects when pepper is unset (inert by default)", () => {
    delete process.env.MCP_TOKEN_PEPPER;
    const res = resolveMcpActor(req(`Bearer agk_${TOKEN_ID}_${SECRET}`));
    expect(res).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("rejects a missing / malformed Authorization header", () => {
    expect(resolveMcpActor(req()).ok).toBe(false);
    expect(resolveMcpActor(req("Bearer not-a-pat")).ok).toBe(false);
  });

  it("resolves a valid test token to the configured actor", () => {
    const res = resolveMcpActor(req(`Bearer agk_${TOKEN_ID}_${SECRET}`));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.actor).toEqual({ userId: "user-test", scopes: ["read", "plan"] });
  });

  it("rejects a wrong secret (constant-time mismatch)", () => {
    const res = resolveMcpActor(req(`Bearer agk_${TOKEN_ID}_wrongsecret`));
    expect(res).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("rejects an unknown token id", () => {
    const res = resolveMcpActor(req(`Bearer agk_other_${SECRET}`));
    expect(res).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("defaults to read+plan scopes when the scope env is unset", () => {
    delete process.env.MCP_TEST_TOKEN_SCOPES;
    const res = resolveMcpActor(req(`Bearer agk_${TOKEN_ID}_${SECRET}`));
    expect(res.ok && res.actor.scopes).toEqual(["read", "plan"]);
  });
});

describe("mcp/auth — hasScope", () => {
  it("checks scope membership", () => {
    expect(hasScope({ userId: "u", scopes: ["read"] }, "read")).toBe(true);
    expect(hasScope({ userId: "u", scopes: ["read"] }, "generate")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// serialize
// ---------------------------------------------------------------------------
describe("mcp/serialize — toPublicJob", () => {
  it("maps a raw row to a provider-neutral view", () => {
    const pub = toPublicJob({
      id: "job-1",
      status: "done",
      current_stage: null,
      prompt: "A skyline",
      engine_used: "seedance2_fast_byteplus",
      aspect_ratio: "9:16",
      target_duration_seconds: 15,
      storyboard: [{}, {}],
      output_url_final: "https://cdn/x.mp4",
      video_url: null,
      social_exports: { tiktok: "https://t/x" },
      error_message: null,
      created_at: "2026-06-09T00:00:00Z",
      updated_at: "2026-06-09T00:01:00Z",
    });
    expect(pub).toMatchObject({
      id: "job-1",
      status: "done",
      prompt: "A skyline",
      aspect_ratio: "9:16",
      duration_seconds: 15,
      scene_count: 2,
      output_url: "https://cdn/x.mp4",
      social_exports: { tiktok: "https://t/x" },
      error: null,
    });
  });

  it("never leaks a raw engine key or provider name in the model field", () => {
    const pub = toPublicJob({ id: "j", engine_used: "seedance2_fast_byteplus" });
    expect(pub.model.toLowerCase()).not.toContain("byteplus");
    expect(pub.model).not.toBe("seedance2_fast_byteplus");
  });

  it("scrubs provider names out of error messages", () => {
    const cleaned = scrubProviders("BytePlus task failed: HeyGen timeout");
    expect(cleaned.toLowerCase()).not.toContain("byteplus");
    expect(cleaned.toLowerCase()).not.toContain("heygen");
  });

  it("falls back output_url to video_url and scene_count to 0", () => {
    const pub = toPublicJob({ id: "j", output_url_final: null, video_url: "https://v/y.mp4", storyboard: null });
    expect(pub.output_url).toBe("https://v/y.mp4");
    expect(pub.scene_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tools (read-only) — mock supabase chain
// ---------------------------------------------------------------------------
function makeClient(opts: { single?: unknown; list?: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(opts.single ?? { data: null, error: null });
  const limit = vi.fn().mockResolvedValue(opts.list ?? { data: [], error: null });
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = maybeSingle;
    chain.order = order;
    chain.limit = limit;
    return chain;
  });
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, maybeSingle, limit, order };
}

const ACTOR: McpActor = { userId: "user-test", scopes: ["read", "plan"] };

describe("mcp/tools — get_job", () => {
  it("requires job_id", async () => {
    const { client } = makeClient({});
    const res = await MCP_TOOLS.get_job.run(ACTOR, {}, { supabase: client });
    expect(res).toMatchObject({ ok: false, status: 400, code: "INVALID_INPUT" });
  });

  it("returns 404 when the job is missing or not owned", async () => {
    const { client } = makeClient({ single: { data: null, error: null } });
    const res = await MCP_TOOLS.get_job.run(ACTOR, { job_id: "nope" }, { supabase: client });
    expect(res).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
  });

  it("returns a provider-neutral job when owned", async () => {
    const { client } = makeClient({
      single: { data: { id: "job-1", status: "done", engine_used: "seedance2_fast_byteplus", target_duration_seconds: 8, storyboard: [{}], output_url_final: "https://cdn/x.mp4" }, error: null },
    });
    const res = await MCP_TOOLS.get_job.run(ACTOR, { job_id: "job-1" }, { supabase: client });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const job = res.data as { id: string; model: string };
    expect(job.id).toBe("job-1");
    expect(job.model.toLowerCase()).not.toContain("byteplus");
  });
});

describe("mcp/tools — list_recent_jobs", () => {
  it("caps the limit at 20 and maps rows", async () => {
    const { client, limit } = makeClient({
      list: { data: [{ id: "a", engine_used: "wan_i2v" }, { id: "b", engine_used: "evolink_fast" }], error: null },
    });
    const res = await MCP_TOOLS.list_recent_jobs.run(ACTOR, { limit: 999 }, { supabase: client });
    expect(limit).toHaveBeenCalledWith(20);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as { jobs: unknown[] };
    expect(data.jobs).toHaveLength(2);
  });

  it("defaults the limit to 10", async () => {
    const { client, limit } = makeClient({ list: { data: [], error: null } });
    await MCP_TOOLS.list_recent_jobs.run(ACTOR, {}, { supabase: client });
    expect(limit).toHaveBeenCalledWith(10);
  });
});

describe("mcp/tools — validate_job_payload (reuses assertCanCreateJob, no insert)", () => {
  beforeEach(() => vi.mocked(assertCanCreateJob).mockReset());

  it("maps an allowed gate to accepted:true with the resolved plan", async () => {
    vi.mocked(assertCanCreateJob).mockResolvedValue({ ok: true, plan: "pro" });
    const { client } = makeClient({});
    const res = await MCP_TOOLS.validate_job_payload.run(
      ACTOR,
      { prompt: "A cinematic skyline", preferred_engine: "evolink_fast", script_text: "hi", references: { images: [] } },
      { supabase: client },
    );
    expect(res).toEqual({ ok: true, data: { accepted: true, plan: "pro" } });
    // Acts as the actor's user, forwards the payload — no insert performed.
    expect(assertCanCreateJob).toHaveBeenCalledWith(client, expect.objectContaining({
      userId: "user-test",
      prompt: "A cinematic skyline",
      preferredEngine: "evolink_fast",
      scriptText: "hi",
    }));
  });

  it("maps a denied gate to accepted:false with reason/code (still ok:true tool result)", async () => {
    vi.mocked(assertCanCreateJob).mockResolvedValue({
      ok: false,
      status: 403,
      body: { error: "This model requires a higher plan. Upgrade to Pro or Premium.", upgrade: true, code: "PLAN_GATE" },
    });
    const { client } = makeClient({});
    const res = await MCP_TOOLS.validate_job_payload.run(
      ACTOR,
      { prompt: "A cinematic skyline", preferred_engine: "evolink_fast" },
      { supabase: client },
    );
    expect(res).toEqual({
      ok: true,
      data: { accepted: false, reason: "This model requires a higher plan. Upgrade to Pro or Premium.", code: "PLAN_GATE", status: 403 },
    });
  });
});

describe("mcp/tools — catalog & cost guarantees", () => {
  it("exposes only no-cost tools and no create_video", () => {
    const names = toolCatalog().map((t) => t.name);
    expect(names).toContain("get_job");
    expect(names).toContain("list_recent_jobs");
    expect(names).toContain("validate_job_payload");
    expect(names).not.toContain("create_video");
    expect(toolCatalog().every((t) => t.cost === "none")).toBe(true);
  });
});
