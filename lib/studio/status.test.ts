import { describe, expect, it } from "vitest";
import { errorMessage, formatElapsed, isActive, pollDelay, statusView } from "./status";

describe("Studio run status", () => {
  it("maps only real states", () => {
    expect(statusView("queued").label).toBe("Queued");
    expect(statusView("running").label).toBe("Generating");
    expect(statusView("done").label).toBe("Completed");
    expect(statusView("expired").tone).toBe("danger");
  });
  it("polls active runs only, slower when old", () => {
    expect(pollDelay("running", 10_000)).toBe(3_000);
    expect(pollDelay("queued", 300_000)).toBe(6_000);
    expect(pollDelay("done", 0)).toBeNull();
    expect(isActive("failed")).toBe(false);
  });
  it("formats elapsed time and known errors", () => {
    expect(formatElapsed("2026-11-09T10:00:00Z", Date.parse("2026-11-09T10:01:17Z"))).toBe("1m 17s");
    expect(errorMessage("TIMEOUT")).toMatch(/deadline/);
    expect(errorMessage(null)).toBeNull();
  });
  it("explains start timeout separately from an unconfirmed cancellation", () => {
    expect(errorMessage("GPU_START_TIMEOUT")).toMatch(/5 minutes.*cancelled/);
    expect(errorMessage("GPU_CANCELLATION_FAILED")).toMatch(/could not be confirmed/);
    expect(errorMessage("GPU_SUBMISSION_FAILED")).toMatch(/before another attempt/);
    expect(errorMessage("GPU_SDK_UNSUPPORTED")).toMatch(/No GPU request was submitted/);
    expect(errorMessage("GPU_EXECUTION_TIMEOUT")).toMatch(/result deadline/);
  });
});
