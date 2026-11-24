import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, PATCH } from "./route";

vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const auth = vi.mocked(requireAdmin);
const service = vi.mocked(createServiceClient);
const request = (method: string, body?: unknown) => new NextRequest("http://local/api/admin/modules", {
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

describe("admin Parallax module controls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects a non-admin before reading or writing settings", async () => {
    auth.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as never);
    expect((await GET(request("GET"))).status).toBe(403);
    expect((await PATCH(request("PATCH", { module: "parallax_shorts", enabled: true }))).status).toBe(403);
    expect(service).not.toHaveBeenCalled();
  });

  const upsert = vi.fn();
  const fakeService = (stored: unknown) => service.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored === undefined ? null : { value: stored }, error: null }) }) }),
      upsert: upsert.mockResolvedValue({ error: null }),
    }),
  } as never);

  it("stores the administrator-only mode and keeps the other modules", async () => {
    auth.mockResolvedValue({ user: { id: "admin" } } as never);
    fakeService({ parallax_remix: true });
    const res = await PATCH(request("PATCH", { module: "parallax_shorts", mode: "admin" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.modules.parallax_shorts).toBe("admin");
    expect(body.modules.parallax_remix).toBe(true);
    expect(upsert.mock.calls[0][0].value.parallax_shorts).toBe("admin");
  });

  it("still accepts the older boolean form and refuses any other mode", async () => {
    auth.mockResolvedValue({ user: { id: "admin" } } as never);
    fakeService(undefined);
    expect((await PATCH(request("PATCH", { module: "parallax_audio", enabled: true }))).status).toBe(200);
    for (const mode of ["everyone", 1, null, ["admin"]]) {
      upsert.mockClear();
      expect((await PATCH(request("PATCH", { module: "parallax_audio", mode }))).status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    }
  });

  it("reports a save failure with a fixed message and no detail", async () => {
    auth.mockResolvedValue({ user: { id: "admin" } } as never);
    service.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: { code: "XX000", message: "secret-looking detail" } }),
      }),
    } as never);
    const res = await PATCH(request("PATCH", { module: "parallax_audio", mode: true }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret-looking");
  });

  it("rejects unknown module ids before touching settings", async () => {
    auth.mockResolvedValue({ user: { id: "admin" } } as never);
    expect((await PATCH(request("PATCH", { module: "not-a-module", enabled: true }))).status).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });
});
