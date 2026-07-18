import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createPhotoAvatarMotion, listVoices } from "@/lib/jogg-client";
import {
  signPresenterPortrait,
  toPublicPresenter,
  type UserPresenterRow,
} from "@/lib/user-presenters";

export const maxDuration = 60;

const SELECT =
  "id, user_id, name, portrait_path, thumb_path, image_sha256, external_avatar_id, external_task_id, status, error_message, created_at, updated_at";

function isFrench(language: string) {
  const value = language.toLowerCase();
  return value.includes("french") || value === "fr" || value.startsWith("fr-");
}

async function persistProviderState(
  service: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  values: Record<string, unknown>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await service
      .from("user_presenters")
      .update(values)
      .eq("id", id)
      .eq("user_id", userId)
      .select(SELECT)
      .maybeSingle();
    if (!error && data) return data as UserPresenterRow;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const service = createServiceClient();
    const { data: current, error: readError } = await service
      .from("user_presenters")
      .select(SELECT)
      .eq("id", id)
      .eq("user_id", user.id)
      .neq("status", "removed")
      .maybeSingle();
    if (readError) {
      return NextResponse.json({ error: "Could not load the presenter." }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: "Presenter not found." }, { status: 404 });
    const row = current as UserPresenterRow;
    if (row.status === "ready") {
      return NextResponse.json({
        presenter: await toPublicPresenter(service, row),
        reused: true,
      });
    }
    if (row.status === "processing") {
      if (!row.external_task_id) {
        console.error("[presenters/generate] processing presenter has no task id", {
          presenterId: id,
        });
        return NextResponse.json(
          { error: "Presenter creation needs support before it can be retried." },
          { status: 409 },
        );
      }
      return NextResponse.json({
        presenter: await toPublicPresenter(service, row),
        reused: true,
      });
    }

    const body = await request.json().catch(() => ({}));
    let voiceId =
      typeof body.voiceId === "string" && body.voiceId.trim().length <= 200
        ? body.voiceId.trim()
        : "";
    if (!voiceId) {
      const voices = await listVoices();
      voiceId = (voices.find((voice) => isFrench(voice.language)) ?? voices[0])?.id ?? "";
    }
    if (!voiceId) {
      return NextResponse.json({ error: "No presenter voice is currently available." }, { status: 503 });
    }

    const { data: claimed, error: claimError } = await service
      .from("user_presenters")
      .update({
        status: "processing",
        external_avatar_id: null,
        external_task_id: null,
        error_message: null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .in("status", ["uploaded", "failed"])
      .select(SELECT)
      .maybeSingle();
    if (claimError) {
      return NextResponse.json({ error: "Could not start presenter creation." }, { status: 500 });
    }
    if (!claimed) {
      const { data: latest } = await service
        .from("user_presenters")
        .select(SELECT)
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!latest) return NextResponse.json({ error: "Presenter not found." }, { status: 404 });
      return NextResponse.json({
        presenter: await toPublicPresenter(service, latest as UserPresenterRow),
        reused: true,
      });
    }

    const imageUrl = await signPresenterPortrait(service, row.portrait_path, 60 * 60);
    if (!imageUrl) {
      await persistProviderState(service, id, user.id, {
        status: "failed",
        error_message: "portrait_signing_failed",
      });
      return NextResponse.json({ error: "Could not prepare the private portrait." }, { status: 500 });
    }

    try {
      const task = await createPhotoAvatarMotion({
        imageUrl,
        name: row.name,
        voiceId,
        model: "2.0",
      });
      const saved = await persistProviderState(service, id, user.id, {
        status: task.status === "completed" ? "ready" : "processing",
        external_avatar_id: task.avatarId ?? null,
        external_task_id: task.motionId ?? null,
        error_message: null,
      });
      if (!saved) {
        console.error("[presenters/generate] paid task could not be persisted", {
          presenterId: id,
          taskId: task.motionId,
          avatarId: task.avatarId,
        });
        return NextResponse.json(
          { error: "Presenter creation started, but its status could not be saved. Contact support." },
          { status: 500 },
        );
      }
      return NextResponse.json({
        presenter: await toPublicPresenter(service, saved),
        reused: false,
      });
    } catch (providerError) {
      console.error("[presenters/generate] provider call failed:", providerError);
      await persistProviderState(service, id, user.id, {
        status: "failed",
        error_message: "generation_failed",
      });
      return NextResponse.json(
        { error: "Presenter creation could not be started. No completed presenter was saved." },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("POST /api/presenters/[id]/generate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
