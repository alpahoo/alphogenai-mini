import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * GET /api/jobs/[id]
 * Fetch a single job by ID for status polling.
 * Uses service client to bypass RLS (jobs may not have user_id set).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: job, error: selectError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (selectError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Fetch scenes if any exist (Phase 1 multi-scene)
    const { data: scenes } = await supabase
      .from("job_scenes")
      .select("*")
      .eq("job_id", id)
      .order("scene_index", { ascending: true });

    return NextResponse.json({
      success: true,
      job: {
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
      },
      scenes: scenes ?? [],
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/jobs/[id]:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

    // Verify ownership via auth client
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check the job belongs to this user
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

    // Delete scenes first (FK constraint)
    await supabase.from("job_scenes").delete().eq("job_id", id);

    // Delete the job
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
