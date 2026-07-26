import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";
import {
  expireNativePresenterBase,
  isNativeNormalizationActive,
} from "@/lib/video-presenter-native-retention";

export const maxDuration = 60;
const BATCH_SIZE = 25;

export async function GET(request: Request) {
  const denied = assertCronAuth(request);
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("user_presenter_native_bases")
    .select("id, user_id, video_path, normalized_video_path, status, updated_at")
    .lt("retention_until", new Date().toISOString())
    .neq("status", "removed")
    .order("retention_until", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    console.error("[native-presenter-retention] fetch failed:", error);
    return NextResponse.json({ error: "Could not load expired presenter footage." }, { status: 500 });
  }

  let removed = 0;
  let errors = 0;
  let active = 0;
  for (const row of data ?? []) {
    if (
      isNativeNormalizationActive(
        String(row.status),
        String(row.updated_at),
      )
    ) {
      active += 1;
      continue;
    }
    const result = await expireNativePresenterBase(
      {
        id: String(row.id),
        userId: String(row.user_id),
        videoPath: String(row.video_path),
        normalizedVideoPath:
          typeof row.normalized_video_path === "string"
            ? row.normalized_video_path
            : null,
      },
      {
        removeObjects: async (paths) => {
          const { error: storageError } = await service.storage
            .from(NATIVE_PRESENTER_BASE_BUCKET)
            .remove(paths);
          if (storageError) {
            console.error("[native-presenter-retention] storage cleanup failed:", {
              baseId: row.id,
              error: storageError,
            });
            return false;
          }
          return true;
        },
        markRemoved: async (id, userId, deletedAt) => {
          const { data: updated, error: updateError } = await service
            .from("user_presenter_native_bases")
            .update({
              status: "removed",
              deleted_at: deletedAt,
              error_code: null,
            })
            .eq("id", id)
            .eq("user_id", userId)
            .neq("status", "removed")
            .select("id")
            .maybeSingle();
          if (updateError) {
            console.error("[native-presenter-retention] state cleanup failed:", {
              baseId: row.id,
              error: updateError,
            });
            return false;
          }
          return Boolean(updated);
        },
      },
    );
    if (result === "removed") removed += 1;
    else errors += 1;
  }

  return NextResponse.json({
    scanned: (data ?? []).length,
    removed,
    errors,
    active,
    hasMore: (data ?? []).length === BATCH_SIZE,
  });
}
