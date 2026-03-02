import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    const { id } = params;

    const { data: job, error: selectError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (selectError) {
      console.error("Failed to fetch job:", selectError);
      return NextResponse.json(
        { error: selectError.message },
        { status: 500 }
      );
    }

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        prompt: job.prompt,
        status: job.status,
        current_stage: job.current_stage,
        video_url: job.video_url,
        output_url_final: job.output_url_final,
        error_message: job.error_message,
        created_at: job.created_at,
        updated_at: job.updated_at,
        app_state: job.app_state
      }
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/jobs/[id]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
