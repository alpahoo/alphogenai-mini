import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { DELETE, GET, PATCH, POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const user = { id: "user-1" };

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/byteplus-assets", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthSupabase(currentUser: { id: string } | null, extra: Record<string, unknown> = {}) {
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: currentUser } }) },
    ...extra,
  };
  vi.mocked(createClient).mockResolvedValue(supabase as unknown as Awaited<ReturnType<typeof createClient>>);
  return supabase;
}

describe("/api/byteplus-assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 without a user", async () => {
    mockAuthSupabase(null);

    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET scopes assets to the current user and signs thumbnails", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "row-1",
          asset_id: "asset-123",
          group_id: "group-1",
          name: "Paul",
          thumb_path: "user-1/thumb.jpg",
          created_at: "2026-06-08",
        },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example.com/thumb.jpg" } });
    const storageFrom = vi.fn(() => ({ createSignedUrl }));

    mockAuthSupabase(user, { from, storage: { from: storageFrom } });

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      assets: [
        {
          id: "row-1",
          asset_id: "asset-123",
          group_id: "group-1",
          name: "Paul",
          thumb_path: "user-1/thumb.jpg",
          created_at: "2026-06-08",
          thumb_url: "https://signed.example.com/thumb.jpg",
        },
      ],
    });
    expect(from).toHaveBeenCalledWith("byteplus_assets");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(storageFrom).toHaveBeenCalledWith("references");
    expect(createSignedUrl).toHaveBeenCalledWith("user-1/thumb.jpg", 86400);
  });

  it("POST validates asset IDs before writing", async () => {
    const from = vi.fn();
    mockAuthSupabase(user, { from });

    const res = await POST(jsonRequest({ asset_id: "bad-id" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "A valid BytePlus Asset ID (asset-...) is required." });
    expect(from).not.toHaveBeenCalled();
  });

  it("POST upserts a trimmed verified face asset and signs its thumbnail", async () => {
    const row = {
      id: "row-1",
      asset_id: "asset-123",
      group_id: "group-1",
      name: "Hero face",
      thumb_path: "user-1/thumb.jpg",
      created_at: "2026-06-08",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example.com/thumb.jpg" } });
    const storageFrom = vi.fn(() => ({ createSignedUrl }));

    mockAuthSupabase(user, { from, storage: { from: storageFrom } });

    const res = await POST(jsonRequest({
      asset_id: " asset-123 ",
      name: "  Hero face  ",
      group_id: " group-1 ",
      thumb_path: " user-1/thumb.jpg ",
    }));

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        asset_id: "asset-123",
        group_id: "group-1",
        name: "Hero face",
        thumb_path: "user-1/thumb.jpg",
      },
      { onConflict: "user_id,asset_id" },
    );
    await expect(res.json()).resolves.toEqual({ asset: { ...row, thumb_url: "https://signed.example.com/thumb.jpg" } });
  });

  it("PATCH requires a patch and scopes updates by row id + user id", async () => {
    mockAuthSupabase(user, { from: vi.fn() });

    const empty = await PATCH(jsonRequest({ id: "row-1" }, "PATCH"));
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toEqual({ error: "nothing to update" });

    const row = {
      id: "row-1",
      asset_id: "asset-123",
      group_id: null,
      name: "New name",
      thumb_path: null,
      created_at: "2026-06-08",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn(() => ({ single }));
    const eqUser = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const update = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ update }));
    mockAuthSupabase(user, { from });

    const res = await PATCH(jsonRequest({ id: "row-1", name: "  New name  " }, "PATCH"));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ name: "New name" });
    expect(eqId).toHaveBeenCalledWith("id", "row-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
    await expect(res.json()).resolves.toEqual({ asset: { ...row, thumb_url: null } });
  });

  it("DELETE requires an id and scopes deletion by row id + user id", async () => {
    mockAuthSupabase(user, { from: vi.fn() });

    const missing = await DELETE(new Request("http://localhost/api/byteplus-assets", { method: "DELETE" }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: "id required" });

    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const deleteFn = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ delete: deleteFn }));
    mockAuthSupabase(user, { from });

    const res = await DELETE(new Request("http://localhost/api/byteplus-assets?id=row-1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(deleteFn).toHaveBeenCalled();
    expect(eqId).toHaveBeenCalledWith("id", "row-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
