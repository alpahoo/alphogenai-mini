import { createServiceClient } from "@/lib/supabase/service";
import { sendVideoReadyEmail, sendVideoFailedEmail } from "@/lib/email";
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

    // Send email notification on terminal status change (done/failed)
    const newStatus = updates.status as string | undefined;
    if (newStatus === "done" || newStatus === "failed") {
      try {
        await sendNotificationEmail(supabase, job_id, newStatus, updates);
      } catch (emailError) {
        // Non-blocking — log but don't fail the webhook
        console.error("[email] notification failed:", emailError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error in POST /api/webhooks/modal:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ----------------------------------------------------------------------------
// Email notification helper
// ----------------------------------------------------------------------------
async function sendNotificationEmail(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  status: string,
  updates: Record<string, unknown>
): Promise<void> {
  // Fetch job details + user email + preferences
  const { data: job } = await supabase
    .from("jobs")
    .select("id, prompt, user_id, output_url_final, video_url, error_message")
    .eq("id", jobId)
    .single();

  if (!job?.user_id) {
    console.log(`[email] skipping: job ${jobId} has no user_id`);
    return;
  }

  // Check user preferences
  const { data: profile } = await supabase
    .from("profiles")
    .select("email_notifications")
    .eq("id", job.user_id)
    .single();

  if (profile?.email_notifications === false) {
    console.log(`[email] skipping: user ${job.user_id} opted out`);
    return;
  }

  // Get user email from auth.users
  const { data: authUser } = await supabase.auth.admin.getUserById(job.user_id);
  const email = authUser?.user?.email;

  if (!email) {
    console.log(`[email] skipping: no email for user ${job.user_id}`);
    return;
  }

  if (status === "done") {
    await sendVideoReadyEmail({
      to: email,
      jobId: job.id,
      prompt: job.prompt,
      videoUrl: (updates.output_url_final ?? job.output_url_final ?? job.video_url) as string | null,
    });
    console.log(`[email] sent video-ready to ${email} for job ${jobId}`);
  } else if (status === "failed") {
    await sendVideoFailedEmail({
      to: email,
      jobId: job.id,
      prompt: job.prompt,
      errorMessage: (updates.error_message ?? job.error_message) as string | null,
    });
    console.log(`[email] sent video-failed to ${email} for job ${jobId}`);
  }
}
