import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import {
  canCleanupVideoPresenterFootage,
  canRemoveVideoPresenterRequest,
  getVideoPresenterRetryPolicy,
} from "@/lib/video-presenter-admin";
import {
  VIDEO_PRESENTER_BUCKET,
  type VideoPresenterRequestRow,
  type VideoPresenterStatus,
} from "@/lib/video-presenters";

const SELECT =
  "id, user_id, name, source_video_path, consent_video_path, source_mime, consent_mime, source_size_bytes, consent_size_bytes, status, presenter_id, error_code, attempts, claimed_at, submitted_at, ready_at, created_at, updated_at";

interface AdminVideoPresenterRow extends VideoPresenterRequestRow {
  attempts: number;
  claimed_at: string | null;
  submitted_at: string | null;
  ready_at: string | null;
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
