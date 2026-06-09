import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { hashTokenSecret } from "@/lib/mcp/auth";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const PEPPER = "route-pepper";
const SECRET = "routesecretvalue";
const TOKEN_ID = "rtok1";
const PAT = `agk_${TOKEN_ID}_${SECRET}`;
const ORIG = { ...process.env };

function mcpRequest(body: unknown, authHeader?: string): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function mockService(single: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(single);
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = maybeSingle;
    return chain;
  });
  const from = vi.fn(() => ({ select }));
  vi.mocked(createServiceClient).mockReturnValue({ from } as unknown as ReturnType<typeof createServiceClient> & SupabaseClient);
}

describe("POST/GET /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_ENABLED = "true";
    process.env.MCP_TOKEN_PEPPER = PEPPER;
    process.env.MCP_TEST_TOKEN_ID = TOKEN_ID;
    process.env.MCP_TEST_TOKEN_SECRET_HASH = hashTokenSecret(SECRET, PEPPER);
    process.env.MCP_TEST_USER_ID = "user-test";
    process.env.MCP_TEST_TOKEN_SCOPES = "read,plan";
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("returns 404 when the feature flag is off (inert by default)", async () => {
    process.env.MCP_ENABLED = "false";
    const res = await POST(mcpRequest({ tool: "get_job", input: { job_id: "x" } }, `Bearer ${PAT}`));
    expect(res.status).toBe(404);

    const getRes = await GET();
    expect(getRes.status).toBe(404);
  });

  it("GET exposes a provider-neutral catalog when enabled", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("alphogen-mcp");
    const names = body.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_job");
    expect(names).not.toContain("create_video");
  });

  it("rejects a request without a token (fail-closed 401)", async () => {
    const res = await POST(mcpRequest({ tool: "get_job", input: { job_id: "x" } }));
    expect(res.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown tool", async () => {
    const res = await POST(mcpRequest({ tool: "delete_everything" }, `Bearer ${PAT}`));
    expect(res.status).toBe(404);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 403 when the token lacks the required scope", async () => {
    process.env.MCP_TEST_TOKEN_SCOPES = "read"; // no "plan"
    const res = await POST(mcpRequest({ tool: "validate_job_payload", input: { prompt: "hi there" } }, `Bearer ${PAT}`));
    expect(res.status).toBe(403);
  });

  it("dispatches get_job for a valid token and returns provider-neutral data", async () => {
    mockService({ data: { id: "job-1", status: "done", engine_used: "seedance2_fast_byteplus", target_duration_seconds: 6, storyboard: [{}], output_url_final: "https://cdn/x.mp4" }, error: null });
    const res = await POST(mcpRequest({ tool: "get_job", input: { job_id: "job-1" } }, `Bearer ${PAT}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tool).toBe("get_job");
    expect(body.data.id).toBe("job-1");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("byteplus");
  });

  it("returns the tool's 404 when the job is not owned/found", async () => {
    mockService({ data: null, error: null });
    const res = await POST(mcpRequest({ tool: "get_job", input: { job_id: "nope" } }, `Bearer ${PAT}`));
    expect(res.status).toBe(404);
  });
});
