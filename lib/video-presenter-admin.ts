import type { VideoPresenterStatus } from "@/lib/video-presenters";

export const VIDEO_PRESENTER_STALE_CLAIM_MS = 30 * 60 * 1000;
export const VIDEO_PRESENTER_AMBIGUOUS_SUBMISSION_MS = 6 * 60 * 60 * 1000;
export const VIDEO_PRESENTER_MAX_ATTEMPTS = 3;

export interface VideoPresenterAdminPolicyInput {
  status: VideoPresenterStatus;
  error_code: string | null;
  attempts: number;
  claimed_at: string | null;
  submitted_at: string | null;
}

export interface VideoPresenterRetryPolicy {
  allowed: boolean;
  maySpend: boolean;
  reason: string;
}

function ageMs(value: string | null, now: number) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
}

export function getVideoPresenterRetryPolicy(
  row: VideoPresenterAdminPolicyInput,
  now = Date.now(),
): VideoPresenterRetryPolicy {
  if (row.attempts >= VIDEO_PRESENTER_MAX_ATTEMPTS) {
    return {
      allowed: false,
      maySpend: false,
      reason: "Maximum retry count reached. Review the request manually.",
    };
  }

  if (row.status === "needs_login") {
    return {
      allowed: true,
      maySpend: false,
      reason: "The worker can resume after its account session is restored.",
    };
  }

  if (row.status === "claimed") {
    const claimedAge = ageMs(row.claimed_at, now);
    if (claimedAge !== null && claimedAge >= VIDEO_PRESENTER_STALE_CLAIM_MS) {
      return {
        allowed: true,
        maySpend: false,
        reason: "The worker claim is stale and can be released safely.",
      };
    }
    return {
      allowed: false,
      maySpend: false,
      reason: "The request is still owned by an active worker.",
    };
  }

  if (row.status === "needs_review") {
    const submissionAge = ageMs(row.submitted_at, now);
    if (
      submissionAge !== null
      && submissionAge < VIDEO_PRESENTER_AMBIGUOUS_SUBMISSION_MS
    ) {
      return {
        allowed: false,
        maySpend: false,
        reason: "The last submission is still ambiguous. Check the account catalog before retrying.",
      };
    }
    return {
      allowed: true,
      maySpend: true,
      reason: "Retry only after checking that no presenter is already processing.",
    };
  }

  if (row.status === "failed") {
    if (row.error_code === "invalid_footage" || row.error_code === "consent_rejected") {
      return {
        allowed: false,
        maySpend: false,
        reason: "The user must submit new footage or consent.",
      };
    }
    return {
      allowed: true,
      maySpend: true,
      reason: "A retry may start a new paid provider operation.",
    };
  }

  return {
    allowed: false,
    maySpend: false,
    reason: "This state is not eligible for retry.",
  };
}

export function canCleanupVideoPresenterFootage(status: VideoPresenterStatus) {
  return status === "ready" || status === "failed" || status === "removed";
}

export function canRemoveVideoPresenterRequest(status: VideoPresenterStatus) {
  return !["claimed", "submitted", "processing"].includes(status);
}

export function canLinkExistingVideoPresenter(status: VideoPresenterStatus) {
  return ["pending", "failed", "needs_login", "needs_review"].includes(status);
}
