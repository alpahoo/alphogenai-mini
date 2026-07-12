import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateBalancedBetaQueueSeconds,
  formatBalancedBetaEta,
  isPodcastBalancedBetaEligible,
} from "../lipsync-beta";

afterEach(() => vi.unstubAllEnvs());

describe("podcast Balanced beta", () => {
  it("requires both Premium and an allowlisted email", () => {
    vi.stubEnv("PODCAST_BALANCED_BETA_EMAILS", "beta@example.com");
    expect(isPodcastBalancedBetaEligible({ email: "BETA@example.com", plan: "premium" })).toBe(true);
    expect(isPodcastBalancedBetaEligible({ email: "beta@example.com", plan: "pro" })).toBe(false);
    expect(isPodcastBalancedBetaEligible({ email: "other@example.com", plan: "premium" })).toBe(false);
  });

  it("estimates queue time in waves of two clips", () => {
    expect(estimateBalancedBetaQueueSeconds(0)).toBe(0);
    expect(estimateBalancedBetaQueueSeconds(1)).toBe(220);
    expect(estimateBalancedBetaQueueSeconds(2)).toBe(220);
    expect(estimateBalancedBetaQueueSeconds(3)).toBe(440);
    expect(formatBalancedBetaEta(3)).toBe("About 8 min");
  });
});
