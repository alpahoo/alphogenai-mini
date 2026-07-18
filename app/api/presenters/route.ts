import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { toPublicPresenter, type UserPresenterRow } from "@/lib/user-presenters";

const SELECT =
  "id, user_id, name, portrait_path, thumb_path, image_sha256, external_avatar_id, external_task_id, status, error_message, created_at, updated_at";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceClient();
    const { data, error } = await service
      .from("user_presenters")
      .select(SELECT)
      .eq("user_id", user.id)
      .neq("status", "removed")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[presenters] list failed:", error);
      return NextResponse.json({ error: "Could not load your presenters." }, { status: 500 });
    }
    const presenters = await Promise.all(
      ((data ?? []) as UserPresenterRow[]).map((row) => toPublicPresenter(service, row)),
    );
    return NextResponse.json({ presenters });
  } catch (error) {
    console.error("GET /api/presenters:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
