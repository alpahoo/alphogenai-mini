import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, PATCH } from "./route";

vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const auth = vi.mocked(requireAdmin);
const service = vi.mocked(createServiceClient);
const request = (method: string, body?: unknown) => new Request("http://local/api/admin/modules", {
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

  it("rejects unknown module ids before touching settings", async () => {
    auth.mockResolvedValue({ user: { id: "admin" } } as never);
    expect((await PATCH(request("PATCH", { module: "not-a-module", enabled: true }))).status).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });
});
