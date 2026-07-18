import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = { id: "user-1" };
const inserted: Record<string, unknown>[] = [];
const uploaded: string[] = [];

function makeQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    insert: vi.fn((value: Record<string, unknown>) => {
      inserted.push(value);
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({
      data: {
        id: "presenter-1",
        user_id: USER.id,
        name: inserted.at(-1)?.name ?? "Presenter",
        portrait_path: inserted.at(-1)?.portrait_path,
        thumb_path: null,
        image_sha256: inserted.at(-1)?.image_sha256,
        external_avatar_id: null,
        external_task_id: null,
        status: "uploaded",
        error_message: null,
        created_at: "2026-07-18T00:00:00Z",
        updated_at: "2026-07-18T00:00:00Z",
      },
      error: null,
    })),
  };
  return query;
}

function makeService() {
  return {
    from: vi.fn(() => makeQuery()),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          uploaded.push(path);
          return { error: null };
        }),
        remove: vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: "https://signed.example/" + path },
          error: null,
        })),
      })),
    },
  };
}

function request(values: Record<string, unknown>) {
  return {
    headers: { get: () => "Bearer token" },
    formData: async () => ({ get: (key: string) => values[key] ?? null }),
  } as never;
}

async function imageFile(width = 600, height = 600) {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: "#dddddd" },
  })
    .jpeg()
    .toBuffer();
  return {
    type: "image/jpeg",
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  uploaded.length = 0;
  vi.mocked(getUserFromRequest).mockResolvedValue(USER);
  vi.mocked(createServiceClient).mockReturnValue(makeService() as never);
});

describe("POST /api/presenters/upload", () => {
  it("requires bearer authentication", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(401);
  });

  it("requires explicit likeness consent before reading the image", async () => {
    const response = await POST(
      request({ file: await imageFile(), name: "My Presenter", consent: "false" }),
    );
    expect(response.status).toBe(400);
    expect(uploaded).toHaveLength(0);
  });

  it("rejects portraits below the minimum dimensions", async () => {
    const response = await POST(
      request({ file: await imageFile(400, 400), name: "My Presenter", consent: "true" }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/512 x 512/);
  });

  it("normalizes, privately stores, and records a consented portrait", async () => {
    const response = await POST(
      request({ file: await imageFile(), name: "My Presenter", consent: "true" }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.presenter).toMatchObject({
      id: "presenter-1",
      name: "My Presenter",
      status: "uploaded",
      avatarId: null,
    });
    expect(json.presenter.provider).toBeUndefined();
    expect(uploaded[0]).toMatch(/^user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(inserted[0]).toMatchObject({
      user_id: "user-1",
      name: "My Presenter",
      status: "uploaded",
      consent_statement_version: "v1-2026-07-18",
    });
  });
});
