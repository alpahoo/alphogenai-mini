import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/retry-scenes — Retry only the failed scenes in an
 * existing job. Resets failed scenes to 'pending' and the job back to
 * 'in_progress' so the poller picks them up automatically.
 *
 * This is much faster than creating a new job: all previously completed
 * scenes (clips, frames) are preserved. The state machine will chain
 * from the last successful scene.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth check
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch the job
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, user_id, status, current_stage")
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Ownership check
  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only allow retry on failed jobs
  if (job.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed jobs can have scenes retried" },
      { status: 400 },
    );
  }

  // Find failed scenes
  const { data: failedScenes } = await supabase
    .from("job_scenes")
    .select("id, scene_index")
    .eq("job_id", id)
    .eq("status", "failed");

  if (!failedScenes || failedScenes.length === 0) {
    return NextResponse.json(
      { error: "No failed scenes to retry" },
      { status: 400 },
    );
  }

  const failedIds = failedScenes.map((s) => s.id);
  const failedIndices = failedScenes.map((s) => s.scene_index + 1);

  // Reset failed scenes to pending
  const { error: sceneErr } = await supabase
    .from("job_scenes")
    .update({
      status: "pending",
      error_message: null,
      external_task_id: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", failedIds);

  if (sceneErr) {
    console.error("[retry-scenes] Failed to reset scenes:", sceneErr.message);
    return NextResponse.json(
      { error: "Failed to reset scenes" },
      { status: 500 },
    );
  }

  // Reset the job back to in_progress
  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      status: "in_progress",
      current_stage: "generating_scene_5",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (jobErr) {
    console.error("[retry-scenes] Failed to reset job:", jobErr.message);
    return NextResponse.json(
      { error: "Failed to reset job status" },
      { status: 500 },
    );
  }

  console.log(
    `[retry-scenes] Reset ${failedScenes.length} failed scenes ` +
    `(${failedIndices.join(", ")}) for job=${id}`
  );

  return NextResponse.json({
    success: true,
    retriedScenes: failedIndices,
    message: `Retrying ${failedScenes.length} scene(s): ${failedIndices.join(", ")}`,
  });
}
