import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import {
  createPhotoAvatarMotion,
  getPhotoAvatarGeneration,
  getPhotoAvatarMotion,
} from "@/lib/jogg-client";
import {
  decodePresenterProviderTask,
  encodePresenterProviderTask,
  isPresenterStageTimedOut,
  toPublicPresenter,
  type UserPresenterRow,
} from "@/lib/user-presenters";

const SELECT =
  "id, user_id, name, portrait_path, thumb_path, image_sha256, external_avatar_id, external_task_id, status, error_message, created_at, updated_at";

async function updatePresenter(
  service: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await service
    .from("user_presenters")
    .update(values)
    .eq("id", id)
    .eq("user_id", userId)
    .select(SELECT)
    .single();
  if (error || !data) throw new Error("Could not save presenter state");
  return data as UserPresenterRow;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const service = createServiceClient();
    const { data, error } = await service
      .from("user_presenters")
      .select(SELECT)
      .eq("id", id)
      .eq("user_id", user.id)
      .neq("status", "removed")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "Could not load the presenter." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Presenter not found." }, { status: 404 });
    let row = data as UserPresenterRow;

    if (row.status === "processing" && isPresenterStageTimedOut(row.updated_at)) {
      row = await updatePresenter(service, id, user.id, {
        status: "failed",
        error_message: "generation_timeout",
      });
    } else if (row.status === "processing" && row.external_task_id) {
      try {
        const task = decodePresenterProviderTask(row.external_task_id);
        if (!task) {
          row = await updatePresenter(service, id, user.id, {
            status: "failed",
            error_message: "generation_failed",
          });
        } else if (task.kind === "photo") {
          const photo = await getPhotoAvatarGeneration(task.photoId);
          if (photo.status === "completed") {
            const motion = await createPhotoAvatarMotion({
              photoId: photo.photoId,
              imageUrl: photo.imageUrls[0],
              name: row.name,
              voiceId: task.voiceId,
              model: "2.0",
            });
            const avatarId = motion.avatarId ?? null;
            if (motion.status === "completed") {
              if (!avatarId) throw new Error("Completed presenter has no avatar id");
              row = await updatePresenter(service, id, user.id, {
                status: "ready",
                external_avatar_id: avatarId,
                external_task_id: motion.motionId
                  ? encodePresenterProviderTask({ kind: "motion", motionId: motion.motionId })
                  : row.external_task_id,
                error_message: null,
              });
            } else {
              if (!motion.motionId) throw new Error("Presenter motion returned no task id");
              row = await updatePresenter(service, id, user.id, {
                status: "processing",
                external_avatar_id: avatarId,
                external_task_id: encodePresenterProviderTask({
                  kind: "motion",
                  motionId: motion.motionId,
                }),
                error_message: null,
              });
            }
          } else if (photo.status === "failed") {
            row = await updatePresenter(service, id, user.id, {
              status: "failed",
              error_message: "generation_failed",
            });
          }
        } else {
          const result = await getPhotoAvatarMotion(task.motionId);
          if (result.status === "completed") {
            const avatarId = result.avatarId ?? row.external_avatar_id;
            if (!avatarId) throw new Error("Completed presenter has no avatar id");
            row = await updatePresenter(service, id, user.id, {
              status: "ready",
              external_avatar_id: avatarId,
              error_message: null,
            });
          } else if (result.status === "failed") {
            console.error("[presenters/status] generation failed:", result.error);
            row = await updatePresenter(service, id, user.id, {
              status: "failed",
              error_message: "generation_failed",
            });
          }
        }
      } catch (providerError) {
        console.error("[presenters/status] poll failed:", providerError);
        return NextResponse.json(
          { error: "Presenter status is temporarily unavailable." },
          { status: 502 },
        );
      }
    } else if (row.status === "processing") {
      console.error("[presenters/status] processing presenter has no task id", {
        presenterId: id,
      });
      return NextResponse.json(
        { error: "Presenter creation needs support before it can continue." },
        { status: 409 },
      );
    }

    return NextResponse.json({ presenter: await toPublicPresenter(service, row) });
  } catch (error) {
    console.error("GET /api/presenters/[id]/status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
