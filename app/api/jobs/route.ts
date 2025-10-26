import { createClient } from "@/lib/supabase/server";
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

    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        prompt: prompt,
        status: "pending",
        app_state: {
          prompt: prompt,
          duration_sec: duration_sec || 60,
          resolution: resolution || "1920x1080",
          fps: fps || 24,
          seed: seed,
          created_via: "api"
        }
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

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job: job
    });
  } catch (error: any) {
    console.error("Error in POST /api/jobs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
