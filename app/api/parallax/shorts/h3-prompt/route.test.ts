import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { isModuleEnabled } from "@/lib/parallax-modules";
import { rewriteH3Prompt } from "@/lib/parallax-h3-prompt";

vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/parallax-modules", () => ({ isModuleEnabled: vi.fn() }));
vi.mock("@/lib/parallax-h3-prompt", () => ({ rewriteH3Prompt: vi.fn() }));

const request = (body: unknown) => new Request("http://localhost/api/parallax/shorts/h3-prompt", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1", email: "admin@example.com" } });
  vi.mocked(isModuleEnabled).mockResolvedValue(true);
  vi.mocked(rewriteH3Prompt).mockResolvedValue({ prompt: "A latte. Soundscape: pouring milk.", rewritten: true });
});

describe("H3 prompt proposal for Shorts", () => {
  it("returns the rewrite for the chosen duration, with nothing admitted", async () => {
    const response = await POST(request({ prompt: "un latte art", engine: "h3_turbo_480", target_duration_seconds: 10 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ prompt: "A latte. Soundscape: pouring milk.", rewritten: true });
    expect(rewriteH3Prompt).toHaveBeenCalledWith("un latte art", 10);
  });

  it("uses 5 s for 704p", async () => {
    await POST(request({ prompt: "un latte art", engine: "h3_turbo_704", target_duration_seconds: 10 }));
    expect(rewriteH3Prompt).toHaveBeenCalledWith("un latte art", 5);
  });

  it("refuses non-admins before anything else", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request({ prompt: "un latte art", engine: "h3_turbo_480" }))).status).toBe(403);
    expect(rewriteH3Prompt).not.toHaveBeenCalled();
  });

  it("refuses when Shorts is off, for another engine, or for an empty idea", async () => {
    expect((await POST(request({ prompt: "un latte art", engine: "ltx_2_5" }))).status).toBe(400);
    expect((await POST(request({ prompt: "ab", engine: "h3_turbo_480" }))).status).toBe(400);
    vi.mocked(isModuleEnabled).mockResolvedValue(false);
    expect((await POST(request({ prompt: "un latte art", engine: "h3_turbo_480" }))).status).toBe(404);
    expect(rewriteH3Prompt).not.toHaveBeenCalled();
  });

  it("never rewrites an idea the content policy refuses", async () => {
    const response = await POST(request({ prompt: "Mickey Mouse dancing", engine: "h3_turbo_480" }));
    expect(response.status).toBe(400);
    expect(rewriteH3Prompt).not.toHaveBeenCalled();
  });
});
