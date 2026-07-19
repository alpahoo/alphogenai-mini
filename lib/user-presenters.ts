import type { createServiceClient } from "@/lib/supabase/service";

export const USER_PRESENTER_BUCKET = "user-presenters";
export const USER_PRESENTER_CONSENT_VERSION = "v1-2026-07-18";
export const USER_PRESENTER_CONSENT =
  "I confirm that I own this image or have explicit permission from the person shown to create and use an AI presenter from their likeness.";
export const USER_PRESENTER_SIGNED_URL_TTL = 24 * 60 * 60;
export const USER_PRESENTER_STAGE_TIMEOUT_MS = 10 * 60 * 1000;

export interface UserPresenterRow {
  id: string;
  user_id: string;
  name: string;
  portrait_path: string;
  thumb_path: string | null;
  image_sha256: string;
  external_avatar_id: string | null;
  external_task_id: string | null;
  status: "uploaded" | "processing" | "ready" | "failed" | "removed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type PresenterProviderTask =
  | { kind: "photo"; photoId: string; voiceId: string }
  | { kind: "motion"; motionId: string };

export function encodePresenterProviderTask(task: PresenterProviderTask) {
  if (task.kind === "motion") return `motion:${task.motionId}`;
  const payload = Buffer.from(
    JSON.stringify({ photoId: task.photoId, voiceId: task.voiceId }),
    "utf8",
  ).toString("base64url");
  return `photo:${payload}`;
}

export function decodePresenterProviderTask(value: string): PresenterProviderTask | null {
  if (value.startsWith("motion:")) {
    const motionId = value.slice("motion:".length).trim();
    return motionId ? { kind: "motion", motionId } : null;
  }
  if (value.startsWith("photo:")) {
    try {
      const parsed = JSON.parse(
        Buffer.from(value.slice("photo:".length), "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const photoId = typeof parsed.photoId === "string" ? parsed.photoId.trim() : "";
      const voiceId = typeof parsed.voiceId === "string" ? parsed.voiceId.trim() : "";
      return photoId && voiceId ? { kind: "photo", photoId, voiceId } : null;
    } catch {
      return null;
    }
  }
  // Rows created by the first presenter implementation stored the raw motion id.
  return value.trim() ? { kind: "motion", motionId: value.trim() } : null;
}

export function isPresenterStageTimedOut(updatedAt: string, now = Date.now()) {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && now - timestamp >= USER_PRESENTER_STAGE_TIMEOUT_MS;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function signPresenterPortrait(
  service: ServiceClient,
  path: string,
  expiresIn = USER_PRESENTER_SIGNED_URL_TTL,
): Promise<string | null> {
  const { data, error } = await service.storage
    .from(USER_PRESENTER_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function toPublicPresenter(service: ServiceClient, row: UserPresenterRow) {
  const imageUrl = await signPresenterPortrait(
    service,
    row.thumb_path ?? row.portrait_path,
  );
  const avatarId =
    row.status === "ready" && Number.isFinite(Number(row.external_avatar_id))
      ? Number(row.external_avatar_id)
      : null;
  return {
    id: row.id,
    name: row.name,
    imageUrl,
    avatarId,
    status: row.status,
    error:
      row.status === "failed"
        ? presenterFailureMessage(row.error_message)
        : null,
    createdAt: row.created_at,
  };
}

export function classifyPresenterProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/18020|insufficient credit/i.test(message)) return "insufficient_credits";
  if (/18025|no permission/i.test(message)) return "feature_unavailable";
  if (/40000|parameter error|image|portrait|face/i.test(message)) return "invalid_portrait";
  return "generation_failed";
}

export function presenterFailureMessage(code: string | null) {
  if (code === "insufficient_credits") {
    return "Animated presenter credits are currently unavailable. You can retry after the account is topped up.";
  }
  if (code === "feature_unavailable") {
    return "Animated presenter creation is not enabled for this account yet.";
  }
  if (code === "invalid_portrait") {
    return "This portrait could not be animated. Try a clear, front-facing photo.";
  }
  if (code === "generation_timeout") {
    return "Presenter creation took too long and was stopped. You can retry.";
  }
  return "Presenter creation could not be completed. You can retry.";
}
