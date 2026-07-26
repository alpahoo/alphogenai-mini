import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { screenPersonaName } from "@/lib/content-policy";
import { triggerNormalizeNativePresenterBase } from "@/lib/modal-client";
import {
  VIDEO_PRESENTER_BUCKET,
  VIDEO_PRESENTER_CONSENT_VERSION,
  toPublicVideoPresenterRequest,
  validateVideoUpload,
  videoExtension,
  type VideoPresenterRequestRow,
} from "@/lib/video-presenters";
import {
  NATIVE_PRESENTER_BASE_BUCKET,
  NATIVE_PRESENTER_RETENTION_CONSENT_VERSION,
  canStartNativePresenterNormalization,
  type NativePresenterBaseRow,
  toPublicNativePresenterBase,
  wantsNativePresenterBase,
} from "@/lib/video-presenter-native";

export const maxDuration = 30;

const SELECT =
  "id, user_id, name, provider_name, source_video_path, consent_video_path, source_mime, consent_mime, source_size_bytes, consent_size_bytes, status, external_avatar_id, presenter_id, error_code, created_at, updated_at";
const NATIVE_SELECT =
  "id, user_id, request_id, name, video_path, video_mime, video_size_bytes, normalized_video_path, normalized_duration_seconds, normalized_width, normalized_height, normalized_fps, normalization_version, normalization_started_at, normalized_at, status, error_code, consent_confirmed_at, consent_statement_version, retention_until, deleted_at, created_at, updated_at";

function providerSafeName(id: string, name: string) {
  const clean = name.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim();
  return `AG-${id.slice(0, 8)}-${clean || "Presenter"}`.slice(0, 150);
}

async function claimNativeNormalization(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  row: NativePresenterBaseRow,
) {
  if (row.status === "ready" || row.status === "normalizing") {
    return { row, reused: true };
  }
  if (!canStartNativePresenterNormalization(row.status)) {
    throw new Error("native_base_not_ready");
  }

  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await service
    .from("user_presenter_native_bases")
    .update({
      status: "normalizing",
      error_code: null,
      normalization_started_at: startedAt,
    })
    .eq("id", row.id)
    .eq("user_id", userId)
    .in("status", ["uploaded", "failed"])
    .select(NATIVE_SELECT)
    .maybeSingle();
  if (claimError) throw new Error("native_base_claim_failed");
  if (!claimed) return { row: { ...row, status: "normalizing" as const }, reused: true };

  try {
    await triggerNormalizeNativePresenterBase(row.id);
  } catch (error) {
    console.error("[video-presenters] native normalization trigger failed:", {
      baseId: row.id,
      error,
    });
    await service
      .from("user_presenter_native_bases")
      .update({
        status: "uploaded",
        error_code: "normalization_trigger_failed",
        normalization_started_at: null,
      })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("status", "normalizing");
    throw new Error("native_base_trigger_failed");
  }

  return { row: claimed as NativePresenterBaseRow, reused: false };
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
    const { data: nativeBases, error: nativeError } = await service
      .from("user_presenter_native_bases")
      .select("id, request_id, status, retention_until, normalized_at")
      .eq("user_id", user.id)
      .neq("status", "removed");
    if (nativeError) {
      console.error("[video-presenters] native base list failed:", nativeError);
      return NextResponse.json({ error: "Could not load retained presenter footage." }, { status: 500 });
    }
    const nativeByRequest = new Map(
      ((nativeBases ?? []) as Pick<
        NativePresenterBaseRow,
        "id" | "request_id" | "status" | "retention_until" | "normalized_at"
      >[])
        .filter((base) => base.request_id)
        .map((base) => [base.request_id as string, base]),
    );
    return NextResponse.json({
      requests: ((data ?? []) as VideoPresenterRequestRow[]).map((row) => {
        const nativeBase = nativeByRequest.get(row.id);
        return {
          ...toPublicVideoPresenterRequest(row),
          nativeBase: nativeBase
            ? toPublicNativePresenterBase(nativeBase)
            : null,
        };
      }),
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
      const nativeRetention = wantsNativePresenterBase(body);
      if (nativeRetention.error) {
        return NextResponse.json({ error: nativeRetention.error }, { status: 400 });
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
      const nativeBaseId = nativeRetention.requested ? randomUUID() : null;
      const sourceMime = String(source.type).toLowerCase();
      const consentMime = String(consent.type).toLowerCase();
      const sourcePath = `${user.id}/${id}/source.${videoExtension(sourceMime)}`;
      const consentPath = `${user.id}/${id}/consent.${videoExtension(consentMime)}`;
      const nativeBasePath = nativeBaseId
        ? `${user.id}/${nativeBaseId}/base.${videoExtension(sourceMime)}`
        : null;
      const consentConfirmedAt = new Date().toISOString();
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
        consent_confirmed_at: consentConfirmedAt,
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
      if (nativeBaseId && nativeBasePath) {
        const { error: nativeInsertError } = await service
          .from("user_presenter_native_bases")
          .insert({
            id: nativeBaseId,
            user_id: user.id,
            request_id: id,
            name,
            video_path: nativeBasePath,
            video_mime: sourceMime,
            video_size_bytes: Number(source.size),
            status: "uploading",
            consent_confirmed_at: consentConfirmedAt,
            consent_statement_version: NATIVE_PRESENTER_RETENTION_CONSENT_VERSION,
          });
        if (nativeInsertError) {
          console.error("[video-presenters] native base insert failed:", nativeInsertError);
          await service
            .from("user_video_presenter_requests")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);
          return NextResponse.json(
            { error: "Could not prepare the reusable presenter footage." },
            { status: 500 },
          );
        }
      }

      const storage = service.storage.from(VIDEO_PRESENTER_BUCKET);
      const [sourceSigned, consentSigned, nativeSigned] = await Promise.all([
        storage.createSignedUploadUrl(sourcePath, { upsert: false }),
        storage.createSignedUploadUrl(consentPath, { upsert: false }),
        nativeBasePath
          ? service.storage
              .from(NATIVE_PRESENTER_BASE_BUCKET)
              .createSignedUploadUrl(nativeBasePath, { upsert: false })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (
        sourceSigned.error
        || consentSigned.error
        || nativeSigned.error
        || !sourceSigned.data
        || !consentSigned.data
        || (nativeBasePath && !nativeSigned.data)
      ) {
        console.error("[video-presenters] signed upload failed:", {
          source: sourceSigned.error,
          consent: consentSigned.error,
          native: nativeSigned.error,
        });
        if (nativeBaseId) {
          await service
            .from("user_presenter_native_bases")
            .delete()
            .eq("id", nativeBaseId)
            .eq("user_id", user.id);
        }
        await service.from("user_video_presenter_requests").delete().eq("id", id).eq("user_id", user.id);
        return NextResponse.json({ error: "Could not prepare private video uploads." }, { status: 500 });
      }
      return NextResponse.json({
        request: toPublicVideoPresenterRequest(data as VideoPresenterRequestRow),
        uploads: {
          bucket: VIDEO_PRESENTER_BUCKET,
          source: { path: sourcePath, token: sourceSigned.data.token },
          consent: { path: consentPath, token: consentSigned.data.token },
          nativeBase: nativeBasePath && nativeSigned.data
            ? {
                bucket: NATIVE_PRESENTER_BASE_BUCKET,
                path: nativeBasePath,
                token: nativeSigned.data.token,
              }
            : null,
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
      const { data: nativeBase, error: nativeReadError } = await service
        .from("user_presenter_native_bases")
        .select(NATIVE_SELECT)
        .eq("request_id", id)
        .eq("user_id", user.id)
        .neq("status", "removed")
        .maybeSingle();
      if (nativeReadError) {
        return NextResponse.json(
          { error: "Could not verify the reusable presenter footage." },
          { status: 500 },
        );
      }
      let publicNativeBase = nativeBase
        ? toPublicNativePresenterBase(nativeBase as NativePresenterBaseRow)
        : null;
      if (nativeBase) {
        const nativeFolder = String(nativeBase.video_path).slice(
          0,
          String(nativeBase.video_path).lastIndexOf("/"),
        );
        const nativeName = String(nativeBase.video_path).slice(
          String(nativeBase.video_path).lastIndexOf("/") + 1,
        );
        const { data: nativeObjects, error: nativeListError } = await service.storage
          .from(NATIVE_PRESENTER_BASE_BUCKET)
          .list(nativeFolder, { limit: 10 });
        if (
          nativeListError
          || !(nativeObjects ?? []).some((object) => object.name === nativeName)
        ) {
          return NextResponse.json(
            { error: "The reusable presenter upload has not finished yet." },
            { status: 409 },
          );
        }
        if (nativeBase.status === "uploading") {
          const { error: nativeUpdateError } = await service
            .from("user_presenter_native_bases")
            .update({ status: "uploaded", error_code: null })
            .eq("id", nativeBase.id)
            .eq("user_id", user.id)
            .eq("status", "uploading");
          if (nativeUpdateError) {
            return NextResponse.json(
              { error: "Could not save the reusable presenter footage." },
              { status: 500 },
            );
          }
        }
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
      if (nativeBase) {
        const normalizationRow = {
          ...(nativeBase as NativePresenterBaseRow),
          status: nativeBase.status === "uploading" ? "uploaded" as const : nativeBase.status,
        };
        try {
          const normalization = await claimNativeNormalization(
            service,
            user.id,
            normalizationRow,
          );
          publicNativeBase = toPublicNativePresenterBase(normalization.row);
        } catch (normalizationError) {
          console.error(
            "[video-presenters] native normalization deferred:",
            normalizationError,
          );
          publicNativeBase = {
            ...toPublicNativePresenterBase(normalizationRow),
            status: "uploaded",
          };
        }
      }
      return NextResponse.json({
        request: {
          ...toPublicVideoPresenterRequest(queued as VideoPresenterRequestRow),
          nativeBase: publicNativeBase,
        },
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
      const { data: nativeBase } = await service
        .from("user_presenter_native_bases")
        .select("id, video_path")
        .eq("request_id", id)
        .eq("user_id", user.id)
        .neq("status", "removed")
        .maybeSingle();
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
      if (nativeBase) {
        await service.storage
          .from(NATIVE_PRESENTER_BASE_BUCKET)
          .remove([String(nativeBase.video_path)]);
        await service
          .from("user_presenter_native_bases")
          .update({
            status: "removed",
            deleted_at: new Date().toISOString(),
            error_code: null,
          })
          .eq("id", nativeBase.id)
          .eq("user_id", user.id);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_native_base") {
      const id = typeof body.requestId === "string" ? body.requestId : "";
      if (!id) return NextResponse.json({ error: "Missing presenter request." }, { status: 400 });
      const { data: requestRow, error: requestError } = await service
        .from("user_video_presenter_requests")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (requestError) {
        return NextResponse.json({ error: "Could not load the presenter." }, { status: 500 });
      }
      if (!requestRow) {
        return NextResponse.json({ error: "Presenter request not found." }, { status: 404 });
      }
      const { data: nativeBase, error: nativeReadError } = await service
        .from("user_presenter_native_bases")
        .select("id, video_path, normalized_video_path, status")
        .eq("request_id", id)
        .eq("user_id", user.id)
        .neq("status", "removed")
        .maybeSingle();
      if (nativeReadError) {
        return NextResponse.json(
          { error: "Could not load the reusable presenter footage." },
          { status: 500 },
        );
      }
      if (!nativeBase) return NextResponse.json({ ok: true, reused: true });
      if (nativeBase.status === "normalizing") {
        return NextResponse.json(
          { error: "Wait for the current presenter processing step to finish before deleting it." },
          { status: 409 },
        );
      }
      const { error: storageError } = await service.storage
        .from(NATIVE_PRESENTER_BASE_BUCKET)
        .remove(
          [nativeBase.video_path, nativeBase.normalized_video_path]
            .filter((path): path is string => typeof path === "string" && path.length > 0),
        );
      if (storageError) {
        console.error("[video-presenters] native base deletion failed:", storageError);
        return NextResponse.json(
          { error: "Could not delete the reusable presenter footage." },
          { status: 500 },
        );
      }
      const { error: deleteError } = await service
        .from("user_presenter_native_bases")
        .update({
          status: "removed",
          deleted_at: new Date().toISOString(),
          error_code: null,
        })
        .eq("id", nativeBase.id)
        .eq("user_id", user.id)
        .neq("status", "removed");
      if (deleteError) {
        console.error("[video-presenters] native base state deletion failed:", deleteError);
        return NextResponse.json(
          { error: "The footage was deleted but its account state could not be updated." },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, reused: false });
    }

    if (action === "normalize_native_base") {
      const id = typeof body.requestId === "string" ? body.requestId : "";
      if (!id) return NextResponse.json({ error: "Missing presenter request." }, { status: 400 });
      const { data: nativeBase, error: nativeReadError } = await service
        .from("user_presenter_native_bases")
        .select(NATIVE_SELECT)
        .eq("request_id", id)
        .eq("user_id", user.id)
        .neq("status", "removed")
        .maybeSingle();
      if (nativeReadError) {
        return NextResponse.json(
          { error: "Could not load the reusable presenter footage." },
          { status: 500 },
        );
      }
      if (!nativeBase) {
        return NextResponse.json(
          { error: "Reusable presenter footage not found." },
          { status: 404 },
        );
      }
      if (nativeBase.status === "uploading") {
        return NextResponse.json(
          { error: "The private upload must finish before processing." },
          { status: 409 },
        );
      }
      try {
        const normalization = await claimNativeNormalization(
          service,
          user.id,
          nativeBase as NativePresenterBaseRow,
        );
        return NextResponse.json({
          nativeBase: toPublicNativePresenterBase(normalization.row),
          reused: normalization.reused,
        });
      } catch (normalizationError) {
        console.error("[video-presenters] native normalization start failed:", normalizationError);
        return NextResponse.json(
          { error: "Could not start private presenter preparation. Please retry." },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/presenters/video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
