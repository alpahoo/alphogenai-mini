import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "../middleware";
import { listCustomAvatars } from "@/lib/jogg-client";
import { createServiceClient } from "@/lib/supabase/service";
import {
  canCleanupVideoPresenterFootage,
  canLinkExistingVideoPresenter,
  canRemoveVideoPresenterRequest,
  getVideoPresenterRetryPolicy,
} from "@/lib/video-presenter-admin";
import {
  linkExistingVideoPresenter,
  ManualVideoPresenterLinkError,
} from "@/lib/video-presenter-manual-link";
import {
  VIDEO_PRESENTER_BUCKET,
  type VideoPresenterRequestRow,
  type VideoPresenterStatus,
} from "@/lib/video-presenters";
import { USER_PRESENTER_BUCKET } from "@/lib/user-presenters";

const SELECT =
  "id, user_id, name, source_video_path, consent_video_path, source_mime, consent_mime, source_size_bytes, consent_size_bytes, status, external_avatar_id, presenter_id, error_code, attempts, claimed_at, submitted_at, ready_at, consent_confirmed_at, consent_statement_version, created_at, updated_at";

interface AdminVideoPresenterRow extends VideoPresenterRequestRow {
  attempts: number;
  claimed_at: string | null;
  submitted_at: string | null;
  ready_at: string | null;
  consent_confirmed_at: string;
  consent_statement_version: string;
}

function projectRow(row: AdminVideoPresenterRow, email: string) {
  return {
    id: row.id,
    userEmail: email,
    name: row.name,
    status: row.status,
    errorCode: row.error_code,
    attempts: row.attempts,
    source: {
      mime: row.source_mime,
      sizeBytes: row.source_size_bytes,
    },
    consent: {
      mime: row.consent_mime,
      sizeBytes: row.consent_size_bytes,
    },
    presenterId: row.presenter_id,
    claimedAt: row.claimed_at,
    submittedAt: row.submitted_at,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retry: getVideoPresenterRetryPolicy(row),
    canLinkExisting: canLinkExistingVideoPresenter(row.status),
    canCleanup: canCleanupVideoPresenterFootage(row.status),
    canRemove: canRemoveVideoPresenterRequest(row.status),
  };
}

async function findRow(id: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("user_video_presenter_requests")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  return {
    service,
    row: data as AdminVideoPresenterRow | null,
    error,
  };
}

async function fetchPresenterCover(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new ManualVideoPresenterLinkError(
      "The presenter preview could not be downloaded.",
      502,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
    throw new ManualVideoPresenterLinkError(
      "The presenter preview has an invalid file size.",
      502,
    );
  }
  return bytes;
}

async function manuallyLinkPresenter(
  service: ReturnType<typeof createServiceClient>,
  row: AdminVideoPresenterRow,
  avatarId: unknown,
) {
  return linkExistingVideoPresenter(
    {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      status: row.status,
      sourceVideoPath: row.source_video_path,
      consentVideoPath: row.consent_video_path,
      consentConfirmedAt: row.consent_confirmed_at,
      consentStatementVersion: row.consent_statement_version,
    },
    avatarId,
    {
      listCompletedAvatars: listCustomAvatars,
      fetchCover: fetchPresenterCover,
      normalizeCover: async (input) =>
        sharp(input)
          .rotate()
          .resize(1024, 1024, { fit: "cover", position: "attention" })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer(),
      makePortraitPath: (userId) => `${userId}/${randomUUID()}.jpg`,
      findPresenterByExternalId: async (userId, externalAvatarId) => {
        const { data, error: lookupError } = await service
          .from("user_presenters")
          .select("id, external_avatar_id")
          .eq("user_id", userId)
          .eq("external_avatar_id", externalAvatarId)
          .neq("status", "removed")
          .maybeSingle();
        if (lookupError) throw lookupError;
        return data
          ? {
              id: String(data.id),
              externalAvatarId:
                typeof data.external_avatar_id === "string"
                  ? data.external_avatar_id
                  : null,
            }
          : null;
      },
      findPresenterByImageHash: async (userId, imageSha256) => {
        const { data, error: lookupError } = await service
          .from("user_presenters")
          .select("id, external_avatar_id")
          .eq("user_id", userId)
          .eq("image_sha256", imageSha256)
          .neq("status", "removed")
          .maybeSingle();
        if (lookupError) throw lookupError;
        return data
          ? {
              id: String(data.id),
              externalAvatarId:
                typeof data.external_avatar_id === "string"
                  ? data.external_avatar_id
                  : null,
            }
          : null;
      },
      storePortrait: async (path, bytes) => {
        const { error: storageError } = await service.storage
          .from(USER_PRESENTER_BUCKET)
          .upload(path, bytes, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (storageError) throw storageError;
      },
      deletePortrait: async (path) => {
        const { error: storageError } = await service.storage
          .from(USER_PRESENTER_BUCKET)
          .remove([path]);
        if (storageError) throw storageError;
      },
      insertPresenter: async (input) => {
        const { data, error: insertError } = await service
          .from("user_presenters")
          .insert({
            user_id: input.userId,
            name: input.name,
            portrait_path: input.portraitPath,
            image_sha256: input.imageSha256,
            external_avatar_id: input.externalAvatarId,
            status: "ready",
            consent_confirmed_at: input.consentConfirmedAt,
            consent_statement_version: input.consentStatementVersion,
          })
          .select("id")
          .single();
        if (insertError || !data) {
          throw insertError ?? new Error("Presenter insert returned no row");
        }
        return { id: String(data.id) };
      },
      markRequestReady: async (input) => {
        const { data, error: updateError } = await service
          .from("user_video_presenter_requests")
          .update({
            status: "ready",
            external_avatar_id: input.externalAvatarId,
            presenter_id: input.presenterId,
            ready_at: input.readyAt,
            error_code: null,
          })
          .eq("id", input.requestId)
          .eq("status", input.previousStatus)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        return Boolean(data);
      },
      cleanupFootage: async (paths) => {
        const { error: storageError } = await service.storage
          .from(VIDEO_PRESENTER_BUCKET)
          .remove(paths);
        if (storageError) {
          console.error("[admin-video-presenters] linked presenter cleanup failed:", storageError);
          return false;
        }
        return true;
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const status = request.nextUrl.searchParams.get("status");
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "25", 10)),
  );
  const offset = (page - 1) * limit;
  const service = createServiceClient();

  let query = service
    .from("user_video_presenter_requests")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) {
    console.error("[admin-video-presenters] list failed:", error);
    return NextResponse.json({ error: "Could not load presenter requests." }, { status: 500 });
  }

  const rows = (data ?? []) as AdminVideoPresenterRow[];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const emails = new Map<string, string>();
  if (userIds.length) {
    const { data: usersData, error: usersError } = await service.auth.admin.listUsers({
      perPage: 1000,
    });
    if (usersError) {
      console.error("[admin-video-presenters] user lookup failed:", usersError);
    } else {
      for (const user of usersData.users) {
        if (userIds.includes(user.id)) emails.set(user.id, user.email ?? "unknown");
      }
    }
  }

  return NextResponse.json({
    requests: rows.map((row) => projectRow(row, emails.get(row.user_id) ?? "unknown")),
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const id = typeof body.requestId === "string" ? body.requestId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id || !action) {
    return NextResponse.json({ error: "Missing request or action." }, { status: 400 });
  }

  const { service, row, error } = await findRow(id);
  if (error) {
    console.error("[admin-video-presenters] read failed:", error);
    return NextResponse.json({ error: "Could not load the presenter request." }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Presenter request not found." }, { status: 404 });

  if (action === "link_existing") {
    try {
      const result = await manuallyLinkPresenter(service, row, body.avatarId);
      console.info("[admin-video-presenters] linked existing presenter", {
        requestId: id,
        presenterId: result.presenterId,
        reused: result.reused,
        cleanupPending: result.cleanupPending,
        adminUserId: auth.user.id,
      });
      return NextResponse.json({
        ok: true,
        presenterId: result.presenterId,
        reused: result.reused,
        cleanupPending: result.cleanupPending,
      });
    } catch (linkError) {
      if (linkError instanceof ManualVideoPresenterLinkError) {
        return NextResponse.json(
          { error: linkError.message },
          { status: linkError.status },
        );
      }
      console.error("[admin-video-presenters] manual link failed:", linkError);
      return NextResponse.json(
        { error: "Could not link the completed presenter." },
        { status: 500 },
      );
    }
  }

  if (action === "retry") {
    const policy = getVideoPresenterRetryPolicy(row);
    if (!policy.allowed) {
      return NextResponse.json({ error: policy.reason }, { status: 409 });
    }
    if (policy.maySpend && body.confirmSpend !== true) {
      return NextResponse.json(
        { error: "Confirm that this retry may start a paid operation." },
        { status: 409 },
      );
    }
    const { data: queued, error: updateError } = await service
      .from("user_video_presenter_requests")
      .update({
        status: "pending",
        claimed_at: null,
        error_code: null,
      })
      .eq("id", id)
      .eq("status", row.status)
      .select(SELECT)
      .maybeSingle();
    if (updateError) {
      console.error("[admin-video-presenters] retry failed:", updateError);
      return NextResponse.json({ error: "Could not requeue the presenter." }, { status: 500 });
    }
    if (!queued) {
      return NextResponse.json(
        { error: "The request changed while the action was running. Refresh and try again." },
        { status: 409 },
      );
    }
    console.info("[admin-video-presenters] requeued", {
      requestId: id,
      previousStatus: row.status,
      maySpend: policy.maySpend,
      adminUserId: auth.user.id,
    });
    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (action === "cleanup") {
    if (!canCleanupVideoPresenterFootage(row.status)) {
      return NextResponse.json(
        { error: "Footage can only be cleaned after processing has stopped." },
        { status: 409 },
      );
    }
    const { error: storageError } = await service.storage
      .from(VIDEO_PRESENTER_BUCKET)
      .remove([row.source_video_path, row.consent_video_path]);
    if (storageError) {
      console.error("[admin-video-presenters] cleanup failed:", storageError);
      return NextResponse.json({ error: "Could not delete the private footage." }, { status: 500 });
    }
    console.info("[admin-video-presenters] footage cleaned", {
      requestId: id,
      adminUserId: auth.user.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    if (!canRemoveVideoPresenterRequest(row.status)) {
      return NextResponse.json(
        { error: "An active provider operation cannot be removed." },
        { status: 409 },
      );
    }
    const previousStatus = row.status as VideoPresenterStatus;
    const { data: removed, error: updateError } = await service
      .from("user_video_presenter_requests")
      .update({ status: "removed", error_code: null })
      .eq("id", id)
      .eq("status", previousStatus)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("[admin-video-presenters] remove failed:", updateError);
      return NextResponse.json({ error: "Could not remove the request." }, { status: 500 });
    }
    if (!removed) {
      return NextResponse.json(
        { error: "The request changed while the action was running. Refresh and try again." },
        { status: 409 },
      );
    }
    const { error: storageError } = await service.storage
      .from(VIDEO_PRESENTER_BUCKET)
      .remove([row.source_video_path, row.consent_video_path]);
    if (storageError) {
      console.error("[admin-video-presenters] remove cleanup failed:", storageError);
    }
    console.info("[admin-video-presenters] removed", {
      requestId: id,
      previousStatus,
      cleanupPending: Boolean(storageError),
      adminUserId: auth.user.id,
    });
    return NextResponse.json({ ok: true, cleanupPending: Boolean(storageError) });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
