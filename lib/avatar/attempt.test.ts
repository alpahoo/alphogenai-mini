import { describe, expect, it } from "vitest";
import { canSubmit, createAttemptStore, submitBlocker } from "./attempt";
import { avatarErrorMessage, canRenderAgain, expectedVideoLabel } from "./messages";

describe("attempt store", () => {
  it("keeps the same key and seed until reset, so a lost response is retried as the same request", () => {
    let n = 0;
    const store = createAttemptStore(() => `key-${++n}`, () => 1000 + n);
    const a = store.get();
    expect(store.get()).toBe(a);            // double click / retry after a network error
    expect(a).toEqual({ key: "key-1", seed: 1001 });
    store.reset();                          // success or changed inputs
    expect(store.get()).toEqual({ key: "key-2", seed: 1002 });
  });
});

describe("submit guard", () => {
  const ok = { ready: true, portraitPath: "p", audioPath: "a", submitting: false, activeRunId: null };
  it("allows exactly one situation", () => {
    expect(canSubmit(ok)).toBe(true);
    for (const patch of [{ ready: false }, { portraitPath: null }, { audioPath: null }, { submitting: true }, { activeRunId: "run-1" }])
      expect(canSubmit({ ...ok, ...patch })).toBe(false);
  });
  it("explains the first blocker", () => {
    expect(submitBlocker({ ...ok, ready: false }, "GPU locked")).toBe("GPU locked");
    expect(submitBlocker({ ...ok, portraitPath: null }, "")).toBe("Choose a portrait");
    expect(submitBlocker({ ...ok, audioPath: null }, "")).toBe("Choose an audio");
    expect(submitBlocker({ ...ok, activeRunId: "r" }, "")).toBe("A render is already running");
    expect(submitBlocker(ok, "")).toBe("");
  });
});

describe("messages", () => {
  it("explains avatar codes, says when no GPU was used, and never echoes unknown raw text", () => {
    expect(avatarErrorMessage("AUDIO_TOO_LONG")).toMatch(/No GPU was used/);
    expect(avatarErrorMessage("AVATAR_EXECUTION_FAILED")).toMatch(/not retried automatically/);
    expect(avatarErrorMessage("GPU_START_TIMEOUT")).toMatch(/5 minutes/);      // shared Studio code
    expect(avatarErrorMessage(null)).toBeNull();
  });
  it("lets a finished run be rendered again, never an active one", () => {
    for (const s of ["done", "failed", "expired", "cancelled"]) expect(canRenderAgain(s)).toBe(true);
    for (const s of ["queued", "running"]) expect(canRenderAgain(s)).toBe(false);
  });
  it("states the whole-segment video lengths", () => {
    expect(expectedVideoLabel(1)).toBe("3.72 s");
    expect(expectedVideoLabel(2)).toBe("6.92 s");
    expect(expectedVideoLabel(3)).toBe("10.12 s");
    expect(expectedVideoLabel(null)).toMatch(/unknown/);
  });
});
