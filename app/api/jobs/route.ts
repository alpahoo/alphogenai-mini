import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 chars)" },
        { status: 400 }
      );
    }

    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert({
        prompt: prompt.trim(),
        status: "pending",
        current_stage: "queued",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create job:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // TODO: trigger Modal pipeline here
    // await modal.Function.lookup("video-pipeline", "run_pipeline").remote(job.id, prompt, webhookUrl)

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/jobs:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
