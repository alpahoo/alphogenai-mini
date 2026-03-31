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
