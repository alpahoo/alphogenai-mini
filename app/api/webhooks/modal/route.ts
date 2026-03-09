import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/** Fields that the Modal webhook is allowed to update */
const ALLOWED_UPDATE_FIELDS = new Set([
  "status",
  "current_stage",
  "video_url",
  "audio_url",
  "output_url_final",
  "error_message",
]);

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * POST /api/webhooks/modal
 * Called by the Modal pipeline to update job progress.
 * Uses service client to bypass RLS (external webhook, no user session).
 *
 * Body: { job_id, status?, current_stage?, video_url?, audio_url?, output_url_final?, error_message? }
 */
export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (!secret || !expectedSecret || !safeCompare(secret, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, ...rawUpdates } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Only allow whitelisted fields
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawUpdates)) {
      if (ALLOWED_UPDATE_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid update fields provided" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { error: updateError } = await supabase
      .from("jobs")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", job_id);

    if (updateError) {
      console.error("Webhook update failed:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error in POST /api/webhooks/modal:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
