import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  pollNativePresenterAnimation,
  startNativePresenterAnimation,
} from "@/lib/video-presenter-native-animation-provider";
import { GET, POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/video-presenter-native-animation-provider", () => ({
  startNativePresenterAnimation: vi.fn(),
  pollNativePresenterAnimation: vi.fn(),
}));

const now = "2026-07-27T10:00:00.000Z";
const speechBytes = Buffer.from("verified speech payload".repeat(600));
const speechSha256 = createHash("sha256").update(speechBytes).digest("hex");

function animation(overrides: Record<string, unknown> = {}) {
  return {
    id: "animation-1",
    user_id: "user-1",
    native_base_id: "base-1",
    audio_path: "user-1/animation-1/speech.mp3",
    audio_mime: "audio/mpeg",
    audio_size_bytes: speechBytes.byteLength,
    audio_sha256: speechSha256,
    output_video_path: "user-1/animation-1/animated.mp4",
    output_duration_seconds: null,
    status: "uploaded",
    provider_task_id: null,
    animation_version: "native-lipsync-v1",
    error_code: null,
    started_at: null,
    completed_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

type Filter =
  | { kind: "eq" | "neq"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] };

function makeService(initial = animation()) {
  let row: Record<string, unknown> | null = { ...initial };
  let base = {
    id: "base-1",
    user_id: "user-1",
    status: "ready",
    normalized_video_path: "user-1/base-1/normalized-v1.mp4",
  };
  let failTaskSave = false;
  const events: string[] = [];

  function matches(candidate: Record<string, unknown>, filters: Filter[]) {
    return filters.every((filter) => {
      switch (filter.kind) {
        case "eq":
          return candidate[filter.column] === filter.value;
        case "neq":
          return candidate[filter.column] !== filter.value;
        case "in":
          return filter.value.includes(candidate[filter.column]);
      }
    });
  }

  function query(
    table: string,
    operation: "select" | "insert" | "update",
    payload?: Record<string, unknown>,
  ) {
    const filters: Filter[] = [];
    const api: Record<string, unknown> = {
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return api;
      },
      neq(column: string, value: unknown) {
        filters.push({ kind: "neq", column, value });
        return api;
      },
      in(column: string, value: unknown[]) {
        filters.push({ kind: "in", column, value });
        return api;
      },
      not(column: string, operator: string, value: string) {
        if (operator === "in") {
          const excluded = value.replace(/[()"]/g, "").split(",");
          for (const item of excluded) {
            filters.push({ kind: "neq", column, value: item });
          }
        }
        return api;
      },
      select() {
        return api;
      },
      async single() {
        return execute();
      },
      async maybeSingle() {
        return execute();
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };

    function execute() {
      if (table === "user_presenter_native_bases") {
        return {
          data: base && matches(base, filters) ? { ...base } : null,
          error: null,
        };
      }
      if (table !== "user_presenter_native_animations") {
        throw new Error(`Unexpected table ${table}`);
      }
      if (operation === "select") {
        return { data: row && matches(row, filters) ? { ...row } : null, error: null };
      }
      if (operation === "insert") {
        row = { ...payload!, created_at: now, updated_at: now };
        events.push("insert");
        return { data: { ...row }, error: null };
      }
      if (!row || !matches(row, filters)) return { data: null, error: null };
      if (failTaskSave && typeof payload?.provider_task_id === "string") {
        failTaskSave = false;
        return { data: null, error: { message: "task save failed" } };
      }
      row = { ...row, ...payload, updated_at: now };
      events.push(`update:${String(payload?.status ?? "fields")}`);
      return { data: { ...row }, error: null };
    }
    return api;
  }

  const storageApi = {
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: { token: `token:${path}` },
      error: null,
    })),
    createSignedUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${path}` },
      error: null,
    })),
    download: vi.fn(async () => ({
      data: new Blob([speechBytes]),
      error: null,
    })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const service = {
    from(table: string) {
      return {
        select: () => query(table, "select"),
        insert: (payload: Record<string, unknown>) => query(table, "insert", payload),
        update: (payload: Record<string, unknown>) => query(table, "update", payload),
      };
    },
    storage: { from: () => storageApi },
  };

  return {
    service,
    storageApi,
    events,
    get row() {
      return row;
    },
    set row(value: Record<string, unknown> | null) {
      row = value;
    },
    set failTaskSave(value: boolean) {
      failTaskSave = value;
    },
    set base(value: typeof base) {
      base = value;
    },
  };
}

function post(body: Record<string, unknown>) {
  return { json: async () => body } as never;
}

function get(id = "animation-1") {
  return {
    nextUrl: new URL(`https://www.alphogen.com/api/presenters/native-animation?id=${id}`),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1" });
  vi.mocked(startNativePresenterAnimation).mockResolvedValue("task-1");
  vi.mocked(pollNativePresenterAnimation).mockResolvedValue({ status: "processing" });
});

describe("/api/presenters/native-animation", () => {
  it("requires bearer authentication", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect((await POST(post({ action: "prepare" }))).status).toBe(401);
  });

  it("returns 404 for a non-owned animation", async () => {
    const state = makeService(animation({ user_id: "someone-else" }));
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);
    expect((await GET(get())).status).toBe(404);
  });

  it("prepares a private audio upload only for a ready owned base", async () => {
    const state = makeService();
    state.row = null;
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);

    const response = await POST(post({
      action: "prepare",
      nativeBaseId: "base-1",
      audio: {
        type: "audio/mpeg",
        size: 12_000,
        sha256: "b".repeat(64),
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.upload).toEqual(expect.objectContaining({
      bucket: "user-presenter-native-animations",
      token: expect.stringMatching(/^token:/),
    }));
    expect(json.animation).not.toHaveProperty("audio_path");
    expect(json.animation).not.toHaveProperty("output_video_path");
  });

  it("claims the row before launching GPU work", async () => {
    const state = makeService();
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);
    vi.mocked(startNativePresenterAnimation).mockImplementation(async () => {
      expect(state.row?.status).toBe("processing");
      expect(state.row?.provider_task_id).toBeNull();
      return "task-1";
    });

    const response = await POST(post({ action: "submit", id: "animation-1" }));
    expect(response.status).toBe(200);
    expect(startNativePresenterAnimation).toHaveBeenCalledTimes(1);
    expect(state.row).toEqual(expect.objectContaining({
      status: "processing",
      provider_task_id: "task-1",
    }));
  });

  it("rejects tampered audio before claiming or launching GPU work", async () => {
    const state = makeService();
    state.storageApi.download.mockResolvedValue({
      data: new Blob([Buffer.from("different audio")]),
      error: null,
    });
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);

    const response = await POST(post({ action: "submit", id: "animation-1" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/verified/);
    expect(startNativePresenterAnimation).not.toHaveBeenCalled();
    expect(state.row?.status).toBe("uploaded");
  });

  it("does not launch twice when the row is already processing", async () => {
    const state = makeService(animation({
      status: "processing",
      provider_task_id: "task-existing",
    }));
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);

    const response = await POST(post({ action: "submit", id: "animation-1" }));
    expect(response.status).toBe(200);
    expect(startNativePresenterAnimation).not.toHaveBeenCalled();
    expect((await response.json()).reused).toBe(true);
  });

  it("quarantines a launched task when its id cannot be persisted", async () => {
    const state = makeService();
    state.failTaskSave = true;
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);

    const response = await POST(post({ action: "submit", id: "animation-1" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Animation started but tracking needs support. Do not retry.",
    });
    expect(state.row?.status).toBe("needs_review");
    expect(startNativePresenterAnimation).toHaveBeenCalledTimes(1);
  });

  it("moves mismatched private output paths to manual review", async () => {
    const state = makeService(animation({
      status: "processing",
      provider_task_id: "task-1",
    }));
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);
    vi.mocked(pollNativePresenterAnimation).mockResolvedValue({
      status: "completed",
      outputPath: "someone-else/animation-1/animated.mp4",
      durationSeconds: 3.2,
    });

    const response = await POST(post({ action: "poll", id: "animation-1" }));
    expect(response.status).toBe(502);
    expect(state.row).toEqual(expect.objectContaining({
      status: "needs_review",
      error_code: "output_path_mismatch",
    }));
  });

  it("signs downloads only for ready private outputs", async () => {
    const state = makeService(animation({
      status: "ready",
      output_duration_seconds: 3.2,
    }));
    vi.mocked(createServiceClient).mockReturnValue(state.service as never);

    const response = await POST(post({ action: "download", id: "animation-1" }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.downloadUrl).toMatch(/^https:\/\/signed\.example\//);
    expect(json.expiresIn).toBe(600);
    expect(json.animation).not.toHaveProperty("output_video_path");
  });

  it("does not delete processing or untracked launched work", async () => {
    for (const status of ["processing", "needs_review"]) {
      const state = makeService(animation({ status }));
      vi.mocked(createServiceClient).mockReturnValue(state.service as never);
      const response = await POST(post({ action: "remove", id: "animation-1" }));
      expect(response.status).toBe(409);
      expect(state.storageApi.remove).not.toHaveBeenCalled();
    }
  });
});
