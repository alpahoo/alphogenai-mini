import { createClient } from "@/lib/supabase/server";
import { insertJob } from "@/lib/jobs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Legacy endpoint kept for backward compatibility.
    // V1 rule: strict wrapper around /api/jobs (create job only).
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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
      seed: seed ?? null,
      created_via: "api_generate_video_legacy",
    });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // Legacy endpoint kept for backward compatibility.
  // V1 rule: strict wrapper around /api/jobs/[id] (read job only).
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: error?.message || "Job not found" },
        { status: 404 }
      );
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ success: true, job });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
