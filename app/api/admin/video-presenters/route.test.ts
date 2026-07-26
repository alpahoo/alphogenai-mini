import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, POST } from "./route";

vi.mock("../middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const ADMIN = { id: "admin-1", email: "admin@alphogen.com" };
const NOW = "2026-07-26T12:00:00.000Z";

function request(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function presenterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    user_id: "user-1",
    name: "Maya",
    source_video_path: "user-1/request-1/source.mp4",
    consent_video_path: "user-1/request-1/consent.mp4",
    source_mime: "video/mp4",
    consent_mime: "video/mp4",
    source_size_bytes: 1_000_000,
    consent_size_bytes: 500_000,
    status: "needs_login",
    presenter_id: null,
    error_code: "needs_login",
    attempts: 1,
    claimed_at: null,
    submitted_at: null,
    ready_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function mockService(options: {
  row?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
  updated?: Record<string, unknown> | null;
  storageError?: { message: string } | null;
} = {}) {
  const listBuilder: Record<string, unknown> = {};
  listBuilder.eq = vi.fn(() => listBuilder);
  listBuilder.order = vi.fn(() => listBuilder);
  listBuilder.range = vi.fn().mockResolvedValue({
    data: options.rows ?? [],
    count: (options.rows ?? []).length,
    error: null,
  });
  listBuilder.maybeSingle = vi.fn().mockResolvedValue({
    data: options.row ?? null,
    error: null,
  });

  const updateMaybeSingle = vi.fn().mockResolvedValue({
    data: options.updated ?? null,
    error: null,
  });
  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = vi.fn(() => updateBuilder);
  updateBuilder.select = vi.fn(() => ({
    maybeSingle: updateMaybeSingle,
  }));
  const update = vi.fn(() => updateBuilder);
  const select = vi.fn(() => listBuilder);
  const from = vi.fn(() => ({ select, update }));
  const remove = vi.fn().mockResolvedValue({ error: options.storageError ?? null });
  const service = {
    from,
    storage: { from: vi.fn(() => ({ remove })) },
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({
          data: { users: [{ id: "user-1", email: "user@example.com" }] },
          error: null,
        }),
      },
    },
  };
  vi.mocked(createServiceClient).mockReturnValue(service as never);
  return { service, update, updateBuilder, updateMaybeSingle, remove };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN } as never);
});

describe("admin video presenter requests", () => {
  it("rejects non-admins before opening the service client", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    } as never);
    const response = await GET(request("http://localhost/api/admin/video-presenters"));
    expect(response.status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("lists provider-neutral request data", async () => {
    mockService({ rows: [presenterRow()] });
    const response = await GET(request("http://localhost/api/admin/video-presenters"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.requests[0]).toMatchObject({
      userEmail: "user@example.com",
      name: "Maya",
      status: "needs_login",
    });
    expect(JSON.stringify(payload)).not.toContain("source_video_path");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("jogg");
  });

  it("requeues a login pause without paid confirmation", async () => {
    const current = presenterRow();
    const mocks = mockService({
      row: current,
      updated: { ...current, status: "pending" },
    });
    const response = await POST(
      request("http://localhost/api/admin/video-presenters", {
        action: "retry",
        requestId: "request-1",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      status: "pending",
      claimed_at: null,
      error_code: null,
    });
  });

  it("requires explicit confirmation for a retry that may spend", async () => {
    const current = presenterRow({
      status: "failed",
      error_code: "provider_rejected",
    });
    const mocks = mockService({ row: current });
    const response = await POST(
      request("http://localhost/api/admin/video-presenters", {
        action: "retry",
        requestId: "request-1",
      }),
    );
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requeues a failed request after explicit paid confirmation", async () => {
    const current = presenterRow({
      status: "failed",
      error_code: "provider_rejected",
    });
    const mocks = mockService({
      row: current,
      updated: { ...current, status: "pending" },
    });
    const response = await POST(
      request("http://localhost/api/admin/video-presenters", {
        action: "retry",
        requestId: "request-1",
        confirmSpend: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("does not clean footage while processing is active", async () => {
    const mocks = mockService({ row: presenterRow({ status: "processing" }) });
    const response = await POST(
      request("http://localhost/api/admin/video-presenters", {
        action: "cleanup",
        requestId: "request-1",
      }),
    );
    expect(response.status).toBe(409);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
