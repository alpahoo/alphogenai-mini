import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { screenPersonaName } from "@/lib/content-policy";
import {
  VIDEO_PRESENTER_BUCKET,
  VIDEO_PRESENTER_CONSENT_VERSION,
  toPublicVideoPresenterRequest,
  validateVideoUpload,
  videoExtension,
  type VideoPresenterRequestRow,
} from "@/lib/video-presenters";

export const maxDuration = 30;

const SELECT =
  "id, user_id, name, provider_name, source_video_path, consent_video_path, source_mime, consent_mime, source_size_bytes, consent_size_bytes, status, external_avatar_id, presenter_id, error_code, created_at, updated_at";

function providerSafeName(id: string, name: string) {
  const clean = name.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim();
  return `AG-${id.slice(0, 8)}-${clean || "Presenter"}`.slice(0, 150);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const service = createServiceClient();
    const { data, error } = await service
      .from("user_video_presenter_requests")
      .select(SELECT)
      .eq("user_id", user.id)
      .neq("status", "removed")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[video-presenters] list failed:", error);
      return NextResponse.json({ error: "Could not load video presenters." }, { status: 500 });
    }
    return NextResponse.json({
      requests: ((data ?? []) as VideoPresenterRequestRow[]).map(toPublicVideoPresenterRequest),
    });
  } catch (error) {
    console.error("GET /api/presenters/video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "prepare";
    const service = createServiceClient();

    if (action === "prepare") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!name) return NextResponse.json({ error: "Name your presenter." }, { status: 400 });
      if (body.consent !== true) {
        return NextResponse.json(
          { error: "You must confirm permission to create this video presenter." },
          { status: 400 },
        );
      }
      const screen = screenPersonaName(name);
      if (screen.blocked) {
        return NextResponse.json(
          { error: screen.findings[0]?.message ?? "This presenter name is not allowed." },
          { status: 400 },
        );
      }
      const source = body.source && typeof body.source === "object" ? body.source : {};
      const consent = body.consentFile && typeof body.consentFile === "object"
        ? body.consentFile
        : {};
      const sourceError = validateVideoUpload(source, "source");
      const consentError = validateVideoUpload(consent, "consent");
      if (sourceError || consentError) {
        return NextResponse.json({ error: sourceError ?? consentError }, { status: 400 });
      }

      const id = randomUUID();
      const sourceMime = String(source.type).toLowerCase();
      const consentMime = String(consent.type).toLowerCase();
      const sourcePath = `${user.id}/${id}/source.${videoExtension(sourceMime)}`;
      const consentPath = `${user.id}/${id}/consent.${videoExtension(consentMime)}`;
      const values = {
        id,
        user_id: user.id,
        name,
        provider_name: providerSafeName(id, name),
        source_video_path: sourcePath,
        consent_video_path: consentPath,
        source_mime: sourceMime,
        consent_mime: consentMime,
        source_size_bytes: Number(source.size),
        consent_size_bytes: Number(consent.size),
        status: "uploading",
        consent_confirmed_at: new Date().toISOString(),
        consent_statement_version: VIDEO_PRESENTER_CONSENT_VERSION,
      };
      const { data, error } = await service
        .from("user_video_presenter_requests")
        .insert(values)
        .select(SELECT)
        .single();
      if (error || !data) {
        console.error("[video-presenters] prepare insert failed:", error);
        return NextResponse.json({ error: "Could not prepare the upload." }, { status: 500 });
      }

      const storage = service.storage.from(VIDEO_PRESENTER_BUCKET);
      const [sourceSigned, consentSigned] = await Promise.all([
        storage.createSignedUploadUrl(sourcePath, { upsert: false }),
        storage.createSignedUploadUrl(consentPath, { upsert: false }),
      ]);
      if (sourceSigned.error || consentSigned.error || !sourceSigned.data || !consentSigned.data) {
        console.error("[video-presenters] signed upload failed:", {
          source: sourceSigned.error,
          consent: consentSigned.error,
        });
        await service.from("user_video_presenter_requests").delete().eq("id", id).eq("user_id", user.id);
        return NextResponse.json({ error: "Could not prepare private video uploads." }, { status: 500 });
      }
      return NextResponse.json({
        request: toPublicVideoPresenterRequest(data as VideoPresenterRequestRow),
        uploads: {
          bucket: VIDEO_PRESENTER_BUCKET,
          source: { path: sourcePath, token: sourceSigned.data.token },
          consent: { path: consentPath, token: consentSigned.data.token },
        },
      });
    }

    if (action === "submit") {
      const id = typeof body.requestId === "string" ? body.requestId : "";
      if (!id) return NextResponse.json({ error: "Missing presenter request." }, { status: 400 });
      const { data: current, error: readError } = await service
        .from("user_video_presenter_requests")
        .select(SELECT)
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (readError) return NextResponse.json({ error: "Could not load the upload." }, { status: 500 });
      if (!current) return NextResponse.json({ error: "Presenter request not found." }, { status: 404 });
      const row = current as VideoPresenterRequestRow;
      if (row.status !== "uploading") {
        return NextResponse.json({ request: toPublicVideoPresenterRequest(row), reused: true });
      }
      const folder = `${user.id}/${id}`;
      const { data: objects, error: listError } = await service.storage
        .from(VIDEO_PRESENTER_BUCKET)
        .list(folder, { limit: 10 });
      const names = new Set((objects ?? []).map((object) => object.name));
      const sourceName = row.source_video_path.slice(row.source_video_path.lastIndexOf("/") + 1);
      const consentName = row.consent_video_path.slice(row.consent_video_path.lastIndexOf("/") + 1);
      if (listError || !names.has(sourceName) || !names.has(consentName)) {
        return NextResponse.json(
          { error: "Both videos must finish uploading before submission." },
          { status: 409 },
        );
      }
      const { data: queued, error: updateError } = await service
        .from("user_video_presenter_requests")
        .update({ status: "pending", error_code: null })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "uploading")
        .select(SELECT)
        .maybeSingle();
      if (updateError || !queued) {
        return NextResponse.json({ error: "Could not queue the presenter." }, { status: 500 });
      }
      return NextResponse.json({
        request: toPublicVideoPresenterRequest(queued as VideoPresenterRequestRow),
        reused: false,
      });
    }

    if (action === "cancel") {
      const id = typeof body.requestId === "string" ? body.requestId : "";
      if (!id) return NextResponse.json({ error: "Missing presenter request." }, { status: 400 });
      const { data: current, error: readError } = await service
        .from("user_video_presenter_requests")
        .select(SELECT)
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (readError) return NextResponse.json({ error: "Could not load the upload." }, { status: 500 });
      if (!current) return NextResponse.json({ ok: true });
      const row = current as VideoPresenterRequestRow;
      if (row.status !== "uploading") {
        return NextResponse.json({ request: toPublicVideoPresenterRequest(row), reused: true });
      }
      const { error: updateError } = await service
        .from("user_video_presenter_requests")
        .update({ status: "removed", error_code: null })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "uploading");
      if (updateError) return NextResponse.json({ error: "Could not cancel the upload." }, { status: 500 });
      await service.storage.from(VIDEO_PRESENTER_BUCKET).remove([
        row.source_video_path,
        row.consent_video_path,
      ]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/presenters/video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
