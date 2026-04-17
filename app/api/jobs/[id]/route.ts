import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isEvoLinkEngine, getEvoLinkTask } from "@/lib/evolink-client";
import { downloadAndUploadToR2 } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";

/**
 * GET /api/jobs/[id]
 * Fetch job status. For EvoLink jobs, lazily polls EvoLink API and
 * triggers R2 upload on completion — no Modal, no cold start.
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
    // If this is an active EvoLink job, check its status on every frontend poll.
    // When EvoLink completes, we download the video and upload to R2 inline.
    if (
      job.external_task_id &&
      job.status === "in_progress" &&
      job.current_stage !== "uploading" &&
      isEvoLinkEngine(job.engine_used ?? "")
    ) {
      try {
        const evolinkResult = await getEvoLinkTask(job.external_task_id);

        if (evolinkResult.status === "completed" && evolinkResult.videoUrl) {
          // Claim the "uploading" slot atomically — prevents duplicate uploads
          // if two polls arrive simultaneously when EvoLink completes.
          const { count: claimed } = await supabase
            .from("jobs")
            .update({ current_stage: "uploading" })
            .eq("id", id)
            .eq("current_stage", "generating_scene_1")
            .select("id", { count: "exact", head: true });

          if (claimed && claimed > 0) {
            // We won the race — do the upload
            try {
              const r2Key = `videos/${uuidv4()}.mp4`;
              const r2Url = await downloadAndUploadToR2(evolinkResult.videoUrl, r2Key);

              await supabase
                .from("jobs")
                .update({
                  status: "done",
                  current_stage: "completed",
                  output_url_final: r2Url,
                  video_url: r2Url,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);

              console.log(`[jobs/status] EvoLink done: job=${id} r2=${r2Url}`);

              // Return updated job immediately
              const { data: updatedJob } = await supabase
                .from("jobs")
                .select("*")
                .eq("id", id)
                .single();

              if (updatedJob) {
                return NextResponse.json({
                  success: true,
                  job: formatJob(updatedJob),
                  scenes: [],
                });
              }
            } catch (uploadErr) {
              const errMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
              console.error(`[jobs/status] EvoLink upload failed: job=${id}`, errMsg);
              await supabase
                .from("jobs")
                .update({
                  status: "failed",
                  error_message: `Upload failed: ${errMsg}`,
                })
                .eq("id", id);
            }
          }
          // else: another request already claimed upload — fall through and return current state
        } else if (evolinkResult.status === "failed") {
          await supabase
            .from("jobs")
            .update({
              status: "failed",
              error_message: evolinkResult.error || "EvoLink generation failed",
            })
            .eq("id", id);
        }
        // status "pending" | "processing" → no action, return current state
      } catch (pollErr) {
        // Non-fatal: log and return current job state without failing the request
        console.warn(`[jobs/status] EvoLink poll error (job=${id}):`, pollErr);
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
