import { describe, it, expect, vi } from "vitest";
import {
  settleJoggJob,
  toPublicPollSummary,
  type SettleDeps,
  type JoggJobRow,
} from "../jogg-poll-core";

const baseJob: JoggJobRow = { id: "job-1", external_task_id: "vd_1", app_state: { engine: "jogg" } };
const okWrite = async () => ({ error: null });
const failWrite = async () => ({ error: { message: "db down" } });

const deps = (over: Partial<SettleDeps>): SettleDeps => ({
  getProductVideo: async () => ({ status: "pending" }),
  download: async () => "https://r2/x.mp4",
  updateJob: okWrite,
  now: () => "2026-07-16T00:00:00.000Z",
  ...over,
});

describe("toPublicPollSummary", () => {
  it("preserves the historical plural `errors` response key", () => {
    const summary = toPublicPollSummary({ done: 2, failed: 1, pending: 3, error: 4 });

    expect(summary).toEqual({ done: 2, failed: 1, pending: 3, errors: 4 });
    expect(summary).not.toHaveProperty("error");
  });
});

describe("settleJoggJob — honest persistence", () => {
  it("completed + successful write → done", async () => {
    const out = await settleJoggJob(
      baseJob,
      deps({ getProductVideo: async () => ({ status: "completed", videoUrl: "u" }) }),
    );
    expect(out).toBe("done");
  });

  it("completed but final write FAILS → error (never a false done)", async () => {
    const out = await settleJoggJob(
      baseJob,
      deps({ getProductVideo: async () => ({ status: "completed", videoUrl: "u" }), updateJob: failWrite }),
    );
    expect(out).toBe("error");
  });

  it("failed status + successful write → failed", async () => {
    const out = await settleJoggJob(
      baseJob,
      deps({ getProductVideo: async () => ({ status: "failed", error: "boom" }) }),
    );
    expect(out).toBe("failed");
  });

  it("failed status but markFailed write FAILS → error", async () => {
    const out = await settleJoggJob(
      baseJob,
      deps({ getProductVideo: async () => ({ status: "failed", error: "boom" }), updateJob: failWrite }),
    );
    expect(out).toBe("error");
  });

  it("missing external_task_id + write ok → failed", async () => {
    const out = await settleJoggJob({ ...baseJob, external_task_id: null }, deps({}));
    expect(out).toBe("failed");
  });

  it("missing external_task_id + write FAILS → error", async () => {
    const out = await settleJoggJob({ ...baseJob, external_task_id: null }, deps({ updateJob: failWrite }));
    expect(out).toBe("error");
  });

  it("still processing → pending, no DB write, no download", async () => {
    const write = vi.fn(okWrite);
    const dl = vi.fn(async () => "x");
    const out = await settleJoggJob(
      baseJob,
      deps({ getProductVideo: async () => ({ status: "processing" }), updateJob: write, download: dl }),
    );
    expect(out).toBe("pending");
    expect(write).not.toHaveBeenCalled();
    expect(dl).not.toHaveBeenCalled();
  });

  it("downloads to the idempotent per-job key on completion", async () => {
    const dl = vi.fn(async () => "https://r2/url-to-video/job-1.mp4");
    await settleJoggJob(
      baseJob,
      deps({ getProductVideo: async () => ({ status: "completed", videoUrl: "u" }), download: dl }),
    );
    expect(dl).toHaveBeenCalledWith("u", "url-to-video/job-1.mp4");
  });
});
