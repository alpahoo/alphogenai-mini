import { createClient } from "@/lib/supabase/server";
import { insertJob } from "@/lib/jobs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const body = await req.json();
    const { prompt, duration_sec, resolution, fps, seed } = body;

    if (!prompt || prompt.length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 chars)" },
        { status: 400 }
      );
    }

    // V1: no auth requirement. Jobs are created with user_id = NULL.
    const job = await insertJob(supabase, null, {
      prompt,
      duration_sec,
      resolution,
      fps,
      seed,
      created_via: "api",
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job: job
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/jobs:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
