import { createClient } from "@/lib/supabase/server";
import { insertJob } from "@/lib/jobs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { prompt, duration_sec, resolution, fps, seed } = body;

    if (!prompt || prompt.length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 chars)" },
        { status: 400 }
      );
    }

    const job = await insertJob(supabase, user.id, {
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
