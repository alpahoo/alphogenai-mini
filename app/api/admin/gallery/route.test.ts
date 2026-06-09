import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, POST } from "./route";
import { POST as POST_FROM_JOB } from "./from-job/route";
import { DELETE, PATCH } from "./[id]/route";

vi.mock("../middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const ADMIN = { id: "admin-1", email: "admin@alphogen.com" };

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN } as never);
}
function asNonAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
  } as never);
}

function mockService(opts: {
  listData?: unknown[];
  insertData?: unknown;
  insertError?: { message: string };
  jobData?: unknown;
  updateData?: unknown;
  deleteData?: unknown;
} = {}) {
  const builder: Record<string, unknown> = {};
  builder.order = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: opts.jobData ?? null, error: null });
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolve({ data: opts.listData ?? [], error: null }));
  const single = vi.fn().mockResolvedValue({ data: opts.insertData ?? null, error: opts.insertError ?? null });
  const select = vi.fn(() => ({ ...builder, single }));
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const updateMaybeSingle = vi.fn().mockResolvedValue({ data: opts.updateData ?? null, error: null });
  const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: updateMaybeSingle })) })) }));
  const deleteMaybeSingle = vi.fn().mockResolvedValue({ data: opts.deleteData ?? null, error: null });
  const deleteFn = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: deleteMaybeSingle })) })) }));
  const from = vi.fn(() => ({ select, insert, update, delete: deleteFn }));
  const service = { from, select, insert, single, builder, update, updateMaybeSingle, deleteFn, deleteMaybeSingle };
  vi.mocked(createServiceClient).mockReturnValue(service as unknown as ReturnType<typeof createServiceClient>);
  return service;
}

function req(url: string, body?: unknown): NextRequest {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("GET /api/admin/gallery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admins with the middleware response (no DB call)", async () => {
    asNonAdmin();
    const service = mockService();
    const res = await GET(req("http://localhost/api/admin/gallery"));
    expect(res.status).toBe(403);
    expect(service.from).not.toHaveBeenCalled();
  });

  it("lists items for an admin", async () => {
    asAdmin();
    mockService({ listData: [{ id: "g1", status: "draft" }] });
    const res = await GET(req("http://localhost/api/admin/gallery"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it("applies status + category filters", async () => {
    asAdmin();
    const service = mockService({ listData: [] });
    await GET(req("http://localhost/api/admin/gallery?status=published&category=UGC"));
    expect(service.builder.eq).toHaveBeenCalledWith("status", "published");
    expect(service.builder.eq).toHaveBeenCalledWith("category", "ugc");
  });

  it("ignores invalid filter values", async () => {
    asAdmin();
    const service = mockService({ listData: [] });
    await GET(req("http://localhost/api/admin/gallery?status=bogus&category=nsfw"));
    expect(service.builder.eq).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/gallery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admins", async () => {
    asNonAdmin();
    const service = mockService();
    const res = await POST(req("http://localhost/api/admin/gallery", { title: "T", media_url: "u" }));
    expect(res.status).toBe(403);
    expect(service.from).not.toHaveBeenCalled();
  });

  it("validates the body (400 on missing media_url)", async () => {
    asAdmin();
    mockService();
    const res = await POST(req("http://localhost/api/admin/gallery", { title: "T" }));
    expect(res.status).toBe(400);
  });

  it("creates an item and stamps created_by = admin id", async () => {
    asAdmin();
    const service = mockService({ insertData: { id: "g-new", title: "Hero", status: "draft" } });
    const res = await POST(req("http://localhost/api/admin/gallery", { title: "Hero", media_url: "https://cdn/x.mp4" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.id).toBe("g-new");
    const calls = service.insert.mock.calls as unknown as unknown[][];
    const inserted = calls[0][0] as Record<string, unknown>;
    expect(inserted.created_by).toBe("admin-1");
    expect(inserted.status).toBe("draft");
  });

  it("returns 500 on a DB insert error", async () => {
    asAdmin();
    mockService({ insertError: { message: "boom" } });
    const res = await POST(req("http://localhost/api/admin/gallery", { title: "Hero", media_url: "https://cdn/x.mp4" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/admin/gallery/from-job", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a draft from a finished job without copying raw prompt", async () => {
    asAdmin();
    const service = mockService({
      jobData: {
        id: "job-1",
        output_url_final: "https://cdn/final.mp4",
        engine_used: "seedance2_fast_byteplus",
        target_duration_seconds: 8,
      },
      insertData: { id: "gallery-1", status: "draft" },
    });

    const res = await POST_FROM_JOB(req("http://localhost/api/admin/gallery/from-job", { job_id: "job-1" }));

    expect(res.status).toBe(201);
    const calls = service.insert.mock.calls as unknown as unknown[][];
    const inserted = calls[0][0] as Record<string, unknown>;
    expect(inserted.status).toBe("draft");
    expect(inserted.public_prompt).toBeNull();
    expect(JSON.stringify(inserted).toLowerCase()).not.toContain("byteplus");
  });

  it("requires a job_id", async () => {
    asAdmin();
    mockService();
    const res = await POST_FROM_JOB(req("http://localhost/api/admin/gallery/from-job", {}));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/gallery/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a gallery item", async () => {
    asAdmin();
    mockService({ updateData: { id: "gallery-1", status: "published" } });
    const res = await PATCH(
      req("http://localhost/api/admin/gallery/gallery-1", { status: "published" }),
      { params: Promise.resolve({ id: "gallery-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.status).toBe("published");
  });

  it("returns 404 when the item is missing", async () => {
    asAdmin();
    mockService({ updateData: null });
    const res = await PATCH(
      req("http://localhost/api/admin/gallery/missing", { title: "New title" }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/gallery/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes only the gallery row", async () => {
    asAdmin();
    mockService({ deleteData: { id: "gallery-1" } });
    const res = await DELETE(
      req("http://localhost/api/admin/gallery/gallery-1"),
      { params: Promise.resolve({ id: "gallery-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: "gallery-1" });
  });
});
