import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";
import { pilotState, runtimeGateState } from "./admin";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = "admin-1";
const future = () => new Date(Date.now() + 3_600_000).toISOString();

function mockGate(table: string, gate: Record<string, unknown>) {
  const update = vi.fn();
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: gate, error: null }),
    single: vi.fn().mockResolvedValue({ data: gate, error: null }),
    update,
  };
  const from = vi.fn((t: string) => { expect(t).toBe(table); return query; });
  vi.mocked(createServiceClient).mockReturnValue({ from } as unknown as ReturnType<typeof createServiceClient>);
  return { update };
}

const mossGate = (budget: unknown, committed: unknown) => ({
  enabled: true, licence_confirmed_at: "2026-11-09T00:00:00Z", allowed_user_id: USER, expires_at: future(),
  remaining_runs: 1, budget_usd: budget, committed_usd: committed, reserve_usd: 0.2,
});

describe("runtimeGateState budget readiness (integer cents)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMFY_MOSS_ENABLED = "true";
    process.env.COMFY_DISPATCH_URL = "https://dispatch.example.com";
    process.env.COMFY_DISPATCH_SECRET = "secret";
  });
  afterEach(() => { process.env = { ...env }; });

  it("is ready with budget 0.60 and 0.40 committed (exactly one 0.20 reserve left)", async () => {
    mockGate("comfy_runtime_gates", mossGate(0.6, 0.4));
    const s = await runtimeGateState(USER, "moss-image@1", "COMFY_MOSS_ENABLED");
    expect(s.ready).toBe(true);
    expect(s.allowance?.available_usd).toBe(0.2);
    expect(s.allowance?.committed_usd).toBe(0.4);
  });
  it("is not ready with 0.19 available", async () => {
    mockGate("comfy_runtime_gates", mossGate(0.59, 0.4));
    const s = await runtimeGateState(USER, "moss-image@1", "COMFY_MOSS_ENABLED");
    expect(s.ready).toBe(false);
    expect(s.allowance?.available_usd).toBe(0.19);
  });
  it("is not ready once the budget is fully committed or exceeded", async () => {
    mockGate("comfy_runtime_gates", mossGate(0.6, 0.6));
    expect((await runtimeGateState(USER, "moss-image@1", "COMFY_MOSS_ENABLED")).ready).toBe(false);
    mockGate("comfy_runtime_gates", mossGate(0.6, 0.8));
    const s = await runtimeGateState(USER, "moss-image@1", "COMFY_MOSS_ENABLED");
    expect(s.ready).toBe(false);
    expect(s.allowance?.available_usd).toBe(0);
  });
  it("accepts numeric values returned as strings", async () => {
    mockGate("comfy_runtime_gates", mossGate("0.60", "0.40"));
    expect((await runtimeGateState(USER, "moss-image@1", "COMFY_MOSS_ENABLED")).ready).toBe(true);
  });
  it("only reads the gate: reservations are never rewritten", async () => {
    const { update } = mockGate("comfy_runtime_gates", mossGate(0.6, 0.4));
    await runtimeGateState(USER, "moss-image@1", "COMFY_MOSS_ENABLED");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("pilotState (H3, 0.75 reserve) budget readiness", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMFY_ADMIN_ENABLED = "true";
    process.env.COMFY_DISPATCH_URL = "https://dispatch.example.com";
    process.env.COMFY_DISPATCH_SECRET = "secret";
  });
  afterEach(() => { process.env = { ...env }; });
  const h3Gate = (budget: number, committed: number) => ({
    enabled: true, rights_confirmed_at: "2026-11-08T00:00:00Z", allowed_user_id: USER, expires_at: future(),
    remaining_runs: 1, budget_usd: budget, committed_usd: committed,
  });
  it("is ready with exactly one 0.75 reserve left (2.25 - 1.50)", async () => {
    mockGate("comfy_admin_gate", h3Gate(2.25, 1.5));
    expect((await pilotState(USER)).ready).toBe(true);
  });
  it("is not ready with 0.74 left", async () => {
    mockGate("comfy_admin_gate", h3Gate(2.24, 1.5));
    expect((await pilotState(USER)).ready).toBe(false);
  });
});
