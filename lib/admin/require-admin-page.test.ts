import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/app/api/admin/middleware";
import { redirect } from "next/navigation";
import { requireAdminPage } from "./require-admin-page";

vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));

const denied = (status: number) => ({ response: new Response("x", { status }) as never });

describe("server-side admin page gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects anonymous visitors to login", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(denied(401));
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("refuses an authenticated non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(denied(403));
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/home");
  });

  it("lets an administrator through, using the same guard as the admin APIs", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1", email: "admin@example.com" } });
    await expect(requireAdminPage()).resolves.toEqual({ id: "admin-1", email: "admin@example.com" });
    expect(redirect).not.toHaveBeenCalled();
    expect(requireAdmin).toHaveBeenCalledWith(); // cookie session, no client-supplied token
  });

  it("the Studio page awaits the gate before rendering and is never prerendered", () => {
    const src = readFileSync(path.resolve(__dirname, "../../app/(admin)/admin/studio/page.tsx"), "utf8");
    const body = src.slice(src.indexOf("export default async function StudioPage"));
    expect(body.indexOf("await requireAdminPage()")).toBeGreaterThan(-1);
    expect(body.indexOf("await requireAdminPage()")).toBeLessThan(body.indexOf("<Studio"));
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).not.toMatch(/^["']use client["']/);
  });
});
