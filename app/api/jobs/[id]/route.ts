import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isEvoLinkEngine, getEvoLinkTask } from "@/lib/evolink-client";

// Give this route enough time to poll EvoLink and write to Supabase.
// No large file downloads happen here — EvoLink URLs are stored directly.
export const maxDuration = 30;

/**
 * GET /api/jobs/[id]
 * Fetch job status. For EvoLink jobs, lazily polls EvoLink API on each
 * frontend call (every 5 s). When completed, stores the EvoLink CDN URL
 * directly — no file download, no R2 upload in this request (avoids timeout).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: job, error: selectError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (selectError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // ── EvoLink lazy polling ────────────────────────────────────────────
    // Check EvoLink task status on every frontend poll (every 5 s).
    // When EvoLink completes, we store the CDN URL directly — no download,
    // no R2 upload inside this request (that would time out Vercel).
    // R2 archival can happen asynchronously via a separate background job.
    if (
      job.external_task_id &&
      job.status === "in_progress" &&
      job.current_stage !== "completed" &&
      isEvoLinkEngine(job.engine_used ?? "")
    ) {
      try {
        const evolinkResult = await getEvoLinkTask(job.external_task_id);

        if (evolinkResult.status === "completed" && evolinkResult.videoUrl) {
          // Atomic claim — only one concurrent poll wins this update.
          // We guard on status="in_progress" so a duplicate poll after "done"
          // is written is a safe no-op.
          const { error: claimErr } = await supabase
            .from("jobs")
            .update({
              status: "done",
              current_stage: "completed",
              // Store EvoLink CDN URL directly — fast, no timeout risk.
              // These URLs are permanent (EvoLink CDN, not pre-signed).
              video_url: evolinkResult.videoUrl,
              output_url_final: evolinkResult.videoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("status", "in_progress"); // atomic guard

          if (!claimErr) {
            console.log(`[jobs/status] EvoLink done: job=${id} url=${evolinkResult.videoUrl.slice(0, 80)}`);
          }
          // Whether we won or lost the race, fall through and return latest state

        } else if (evolinkResult.status === "failed") {
          await supabase
            .from("jobs")
            .update({
              status: "failed",
              error_message: evolinkResult.error || "EvoLink generation failed",
            })
            .eq("id", id)
            .eq("status", "in_progress");
        }
        // "pending" | "processing" → no action, return current state
      } catch (pollErr) {
        // Non-fatal: log and return current job state
        console.warn(`[jobs/status] EvoLink poll error (job=${id}):`, pollErr instanceof Error ? pollErr.message : pollErr);
      }
    }

    // ── Re-fetch to return latest state ────────────────────────────────
    const { data: latestJob } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    const { data: scenes } = await supabase
      .from("job_scenes")
      .select("*")
      .eq("job_id", id)
      .order("scene_index", { ascending: true });

    return NextResponse.json({
      success: true,
      job: formatJob(latestJob ?? job),
      scenes: scenes ?? [],
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/jobs/[id]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatJob(job: Record<string, unknown>) {
  return {
    id: job.id,
    prompt: job.prompt,
    plan: job.plan,
    status: job.status,
    current_stage: job.current_stage,
    video_url: job.video_url,
    audio_url: job.audio_url,
    output_url_final: job.output_url_final,
    error_message: job.error_message,
    storyboard: job.storyboard ?? null,
    target_duration_seconds: job.target_duration_seconds ?? 5,
    engine_used: job.engine_used ?? null,
    estimated_cost_usd: job.estimated_cost_usd ?? null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

/**
 * DELETE /api/jobs/[id]
 * Permanently deletes a job owned by the authenticated user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from("jobs")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase.from("job_scenes").delete().eq("job_id", id);
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/jobs/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
