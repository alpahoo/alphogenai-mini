import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { getPhotoAvatarMotion } from "@/lib/jogg-client";
import { toPublicPresenter, type UserPresenterRow } from "@/lib/user-presenters";

const SELECT =
  "id, user_id, name, portrait_path, thumb_path, image_sha256, external_avatar_id, external_task_id, status, error_message, created_at, updated_at";

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

    if (row.status === "processing" && row.external_task_id) {
      try {
        const result = await getPhotoAvatarMotion(row.external_task_id);
        if (result.status === "completed") {
          const avatarId = result.avatarId ?? row.external_avatar_id;
          if (!avatarId) throw new Error("Completed presenter has no avatar id");
          const { data: updated, error: updateError } = await service
            .from("user_presenters")
            .update({
              status: "ready",
              external_avatar_id: avatarId,
              error_message: null,
            })
            .eq("id", id)
            .eq("user_id", user.id)
            .select(SELECT)
            .single();
          if (updateError || !updated) {
            console.error("[presenters/status] completion update failed:", updateError);
            return NextResponse.json({ error: "Could not save presenter completion." }, { status: 500 });
          }
          row = updated as UserPresenterRow;
        } else if (result.status === "failed") {
          console.error("[presenters/status] generation failed:", result.error);
          const { data: updated, error: updateError } = await service
            .from("user_presenters")
            .update({ status: "failed", error_message: "generation_failed" })
            .eq("id", id)
            .eq("user_id", user.id)
            .select(SELECT)
            .single();
          if (updateError || !updated) {
            console.error("[presenters/status] failure update failed:", updateError);
            return NextResponse.json({ error: "Could not save presenter failure." }, { status: 500 });
          }
          row = updated as UserPresenterRow;
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
