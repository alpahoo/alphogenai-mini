import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { fromBuffer as detectFromBuffer } from "file-type";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("file-type", () => ({ fromBuffer: vi.fn() }));

const USER = { id: "user-1" };

function fakeFile(over: Partial<{ type: string; size: number }> = {}) {
  return {
    type: over.type ?? "image/png",
    size: over.size ?? 1024,
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

// Request with a formData() returning a Map-like get("file").
function req(file: unknown | null) {
  return {
    headers: { get: () => "Bearer tok" },
    formData: async () => ({ get: (k: string) => (k === "file" ? file : null) }),
  } as never;
}

let uploadCalls: Array<{ path: string; opts: unknown }> = [];
function makeService(uploadResult: { error: unknown } = { error: null }) {
  return {
    storage: {
      from: () => ({
        upload: async (path: string, _buf: unknown, opts: unknown) => {
          uploadCalls.push({ path, opts });
          return uploadResult;
        },
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadCalls = [];
  vi.mocked(getUserFromRequest).mockResolvedValue(USER);
  vi.mocked(detectFromBuffer).mockResolvedValue({ mime: "image/png", ext: "png" } as never);
  vi.mocked(createServiceClient).mockReturnValue(makeService() as never);
});

describe("POST /api/podcast-personas/upload", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(req(fakeFile()))).status).toBe(401);
  });

  it("400 with no file", async () => {
    expect((await POST(req(null))).status).toBe(400);
  });

  it("400 for a too-large file", async () => {
    const res = await POST(req(fakeFile({ size: 11 * 1024 * 1024 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too large/i);
  });

  it("400 for a disallowed declared MIME", async () => {
    const res = await POST(req(fakeFile({ type: "image/gif" })));
    expect(res.status).toBe(400);
  });

  it("400 when magic bytes are not a real allowed image", async () => {
    // Declared png but real content isn't an allowed image.
    vi.mocked(detectFromBuffer).mockResolvedValue({ mime: "application/pdf", ext: "pdf" } as never);
    const res = await POST(req(fakeFile({ type: "image/png" })));
    expect(res.status).toBe(400);
  });

  it("uploads to the caller's own folder and returns the storage path", async () => {
    const res = await POST(req(fakeFile({ type: "image/png" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.storage_path).toMatch(/^user-1\/[0-9a-f-]{36}\.png$/);
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].path.startsWith("user-1/")).toBe(true);
    // no public URL is returned
    expect(json.url).toBeUndefined();
  });

  it("500 when storage upload fails", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({ error: { message: "boom" } }) as never);
    expect((await POST(req(fakeFile()))).status).toBe(500);
  });
});
