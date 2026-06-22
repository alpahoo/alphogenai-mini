import { describe, it, expect } from "vitest";
import {
  resolveSpeakerVoices,
  estimateSegmentTimings,
  DEFAULT_HOST_VOICE,
  DEFAULT_GUEST_VOICE,
  INTER_SEGMENT_GAP_MS,
} from "../voices";

describe("resolveSpeakerVoices", () => {
  it("assigns distinct role defaults", () => {
    const map = resolveSpeakerVoices([
      { id: "h", role: "host" },
      { id: "g", role: "guest" },
    ]);
    expect(map.h).toBe(DEFAULT_HOST_VOICE);
    expect(map.g).toBe(DEFAULT_GUEST_VOICE);
    expect(map.h).not.toBe(map.g);
  });

  it("honors an explicit voice_id", () => {
    const map = resolveSpeakerVoices([
      { id: "h", role: "host", voice_id: "bella" },
      { id: "g", role: "guest", voice_id: "josh" },
    ]);
    expect(map.h).toBe("bella");
    expect(map.g).toBe("josh");
  });

  it("forces distinct voices when both resolve to the same one", () => {
    const map = resolveSpeakerVoices([
      { id: "h", role: "host", voice_id: "adam" },
      { id: "g", role: "guest", voice_id: "adam" },
    ]);
    expect(map.h).not.toBe(map.g);
  });

  it("keeps an explicit guest voice and moves the defaulted host on collision", () => {
    const map = resolveSpeakerVoices([
      { id: "h", role: "host" }, // defaults to rachel
      { id: "g", role: "guest", voice_id: "rachel" }, // collides
    ]);
    expect(map.g).toBe("rachel");
    expect(map.h).not.toBe("rachel");
  });
});

describe("estimateSegmentTimings", () => {
  it("produces cumulative start/end with a gap between segments", () => {
    const t = estimateSegmentTimings([1, 2], 300);
    expect(t[0]).toEqual({ start_ms: 0, end_ms: 1000 });
    expect(t[1]).toEqual({ start_ms: 1300, end_ms: 3300 });
  });

  it("uses the default gap", () => {
    const t = estimateSegmentTimings([1, 1]);
    expect(t[1].start_ms).toBe(1000 + INTER_SEGMENT_GAP_MS);
  });

  it("handles empty and non-finite durations", () => {
    expect(estimateSegmentTimings([])).toEqual([]);
    const t = estimateSegmentTimings([NaN, 1]);
    expect(t[0]).toEqual({ start_ms: 0, end_ms: 0 });
    expect(t[1].start_ms).toBe(0 + INTER_SEGMENT_GAP_MS);
  });
});
