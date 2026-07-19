import { describe, expect, it } from "vitest";
import {
  decodePresenterProviderTask,
  encodePresenterProviderTask,
  isPresenterStageTimedOut,
} from "../user-presenters";

describe("presenter provider stages", () => {
  it("round-trips the photo id and voice needed by the next async stage", () => {
    const encoded = encodePresenterProviderTask({
      kind: "photo",
      photoId: "photo-1",
      voiceId: "fr-FR-voice:1",
    });
    expect(decodePresenterProviderTask(encoded)).toEqual({
      kind: "photo",
      photoId: "photo-1",
      voiceId: "fr-FR-voice:1",
    });
  });

  it("supports prefixed and legacy motion task ids", () => {
    expect(decodePresenterProviderTask("motion:motion-1")).toEqual({
      kind: "motion",
      motionId: "motion-1",
    });
    expect(decodePresenterProviderTask("legacy-motion-id")).toEqual({
      kind: "motion",
      motionId: "legacy-motion-id",
    });
  });

  it("stops a stage after ten minutes", () => {
    const now = Date.parse("2026-07-19T12:10:00Z");
    expect(isPresenterStageTimedOut("2026-07-19T12:00:01Z", now)).toBe(false);
    expect(isPresenterStageTimedOut("2026-07-19T12:00:00Z", now)).toBe(true);
  });
});
