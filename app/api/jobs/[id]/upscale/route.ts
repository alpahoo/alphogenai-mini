import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/upscale — Trigger 4x upscale of a completed video.
 *
 * Calls the Modal Real-ESRGAN function to upscale the video.
 * Pro/Premium only. Result stored as `upscaled_url` on the job.
 *
 * Status: STUB — returns 501 until Modal deployment of Real-ESRGAN.
 * The endpoint is wired up so the frontend can call it; the actual
 * GPU processing will be enabled in a future deploy.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch job + verify ownership
  const { data: job } = await supabase
    .from("jobs")
    .select("id, user_id, status, output_url_final, plan")
    .eq("id", id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (job.status !== "done" || !job.output_url_final) {
    return NextResponse.json(
      { error: "Only completed videos can be upscaled" },
      { status: 400 },
    );
  }

  // Plan gate: Pro/Premium only
  if (job.plan === "free") {
    return NextResponse.json(
      { error: "Upscaling requires Pro or Premium plan.", upgrade: true },
      { status: 403 },
    );
  }

  // TODO: Call Modal Real-ESRGAN function when deployed
  // const upscaledUrl = await triggerModalUpscale(job.output_url_final, id);
  // await supabase.from("jobs").update({ upscaled_url: upscaledUrl }).eq("id", id);

  return NextResponse.json(
    {
      error: "Upscaling is coming soon! Real-ESRGAN 4x will be available after the next Modal deployment.",
      coming_soon: true,
    },
    { status: 501 },
  );
}
