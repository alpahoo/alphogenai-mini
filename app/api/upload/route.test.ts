import { beforeEach, describe, expect, it, vi } from "vitest";
import { fromBuffer as detectFromBuffer } from "file-type";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "uuid-1"),
}));

vi.mock("file-type", () => ({
  fromBuffer: vi.fn(),
}));

const user = { id: "user-1" };

function mockAuthSupabase(currentUser: { id: string } | null, extra: Record<string, unknown> = {}) {
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: currentUser } }) },
    ...extra,
  };
  vi.mocked(createClient).mockResolvedValue(supabase as unknown as Awaited<ReturnType<typeof createClient>>);
  return supabase;
}

function referenceRequest(file?: File): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/upload?bucket=references", {
    method: "POST",
    body: form,
  });
}

function imageFile(type = "image/png", size = 4): File {
  return new File([new Uint8Array(size).fill(1)], "reference.png", { type });
}

describe("/api/upload?bucket=references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectFromBuffer).mockResolvedValue({ ext: "png", mime: "image/png" });
  });

  it("returns 401 without a user", async () => {
    mockAuthSupabase(null);

    const res = await POST(referenceRequest(imageFile()));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Authentication required" });
  });

  it("requires a file before detecting MIME", async () => {
    mockAuthSupabase(user);

    const res = await POST(referenceRequest());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No file provided" });
    expect(detectFromBuffer).not.toHaveBeenCalled();
  });

  it("rejects files when magic-byte detection fails", async () => {
    mockAuthSupabase(user);
    vi.mocked(detectFromBuffer).mockResolvedValue(undefined);

    const res = await POST(referenceRequest(imageFile()));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Reference uploads currently support JPG, PNG, and WEBP only.",
    });
  });

  it("rejects a claimed MIME that does not match detected magic bytes", async () => {
    mockAuthSupabase(user);
    vi.mocked(detectFromBuffer).mockResolvedValue({ ext: "png", mime: "image/png" });

    const res = await POST(referenceRequest(imageFile("image/jpeg")));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "File type mismatch: claimed image/jpeg, detected image/png.",
    });
  });

  it("uploads to the user-scoped references bucket path and returns a signed preview URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example.com/ref.png" }, error: null });
    const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
    mockAuthSupabase(user, { storage: { from: storageFrom } });

    const res = await POST(referenceRequest(imageFile("image/png")));

    expect(res.status).toBe(200);
    expect(storageFrom).toHaveBeenCalledWith("references");
    expect(upload).toHaveBeenCalledWith(
      "user-1/uuid-1.png",
      expect.any(Buffer),
      { contentType: "image/png", upsert: false },
    );
    expect(createSignedUrl).toHaveBeenCalledWith("user-1/uuid-1.png", 21600);
    await expect(res.json()).resolves.toEqual({
      url: "https://signed.example.com/ref.png",
      storage_path: "user-1/uuid-1.png",
    });
  });

  it("returns 500 when storage upload fails", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "bucket denied" } });
    const createSignedUrl = vi.fn();
    const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
    mockAuthSupabase(user, { storage: { from: storageFrom } });

    const res = await POST(referenceRequest(imageFile("image/png")));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Storage upload failed" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
