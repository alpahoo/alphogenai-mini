import type { createServiceClient } from "@/lib/supabase/service";

export const USER_PRESENTER_BUCKET = "user-presenters";
export const USER_PRESENTER_CONSENT_VERSION = "v1-2026-07-18";
export const USER_PRESENTER_CONSENT =
  "I confirm that I own this image or have explicit permission from the person shown to create and use an AI presenter from their likeness.";
export const USER_PRESENTER_SIGNED_URL_TTL = 24 * 60 * 60;

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
  return "Presenter creation could not be completed. You can retry.";
}
