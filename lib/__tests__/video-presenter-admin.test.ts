import { describe, expect, it } from "vitest";
import {
  canCleanupVideoPresenterFootage,
  canRemoveVideoPresenterRequest,
  getVideoPresenterRetryPolicy,
  VIDEO_PRESENTER_AMBIGUOUS_SUBMISSION_MS,
  VIDEO_PRESENTER_STALE_CLAIM_MS,
} from "@/lib/video-presenter-admin";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

function row(
  overrides: Partial<Parameters<typeof getVideoPresenterRetryPolicy>[0]> = {},
) {
  return {
    status: "failed" as const,
    error_code: "provider_rejected",
    attempts: 1,
    claimed_at: null,
    submitted_at: null,
    ...overrides,
  };
}

describe("video presenter admin retry policy", () => {
  it("resumes a worker after login without classifying it as new spend", () => {
    expect(getVideoPresenterRetryPolicy(row({ status: "needs_login" }), NOW)).toEqual({
      allowed: true,
      maySpend: false,
      reason: expect.stringMatching(/session/i),
    });
  });

  it("does not release an active claim", () => {
    const claimedAt = new Date(NOW - VIDEO_PRESENTER_STALE_CLAIM_MS + 1_000).toISOString();
    expect(getVideoPresenterRetryPolicy(row({ status: "claimed", claimed_at: claimedAt }), NOW))
      .toMatchObject({ allowed: false, maySpend: false });
  });

  it("releases only a stale claim", () => {
    const claimedAt = new Date(NOW - VIDEO_PRESENTER_STALE_CLAIM_MS).toISOString();
    expect(getVideoPresenterRetryPolicy(row({ status: "claimed", claimed_at: claimedAt }), NOW))
      .toMatchObject({ allowed: true, maySpend: false });
  });

  it("blocks an ambiguous recent submission", () => {
    const submittedAt = new Date(
      NOW - VIDEO_PRESENTER_AMBIGUOUS_SUBMISSION_MS + 1_000,
    ).toISOString();
    expect(
      getVideoPresenterRetryPolicy(
        row({ status: "needs_review", submitted_at: submittedAt }),
        NOW,
      ),
    ).toMatchObject({ allowed: false, maySpend: false });
  });

  it("allows an explicitly confirmed retry after the ambiguity window", () => {
    const submittedAt = new Date(
      NOW - VIDEO_PRESENTER_AMBIGUOUS_SUBMISSION_MS,
    ).toISOString();
    expect(
      getVideoPresenterRetryPolicy(
        row({ status: "needs_review", submitted_at: submittedAt }),
        NOW,
      ),
    ).toMatchObject({ allowed: true, maySpend: true });
  });

  it("requires new footage for invalid footage and consent failures", () => {
    for (const errorCode of ["invalid_footage", "consent_rejected"]) {
      expect(
        getVideoPresenterRetryPolicy(row({ error_code: errorCode }), NOW),
      ).toMatchObject({ allowed: false, maySpend: false });
    }
  });

  it("stops after the maximum number of attempts", () => {
    expect(getVideoPresenterRetryPolicy(row({ attempts: 3 }), NOW))
      .toMatchObject({ allowed: false, maySpend: false });
  });
});

describe("video presenter admin cleanup policy", () => {
  it("cleans footage only after processing has stopped", () => {
    expect(canCleanupVideoPresenterFootage("ready")).toBe(true);
    expect(canCleanupVideoPresenterFootage("failed")).toBe(true);
    expect(canCleanupVideoPresenterFootage("processing")).toBe(false);
  });

  it("does not remove active provider operations", () => {
    expect(canRemoveVideoPresenterRequest("claimed")).toBe(false);
    expect(canRemoveVideoPresenterRequest("submitted")).toBe(false);
    expect(canRemoveVideoPresenterRequest("processing")).toBe(false);
    expect(canRemoveVideoPresenterRequest("needs_review")).toBe(true);
  });
});
