import { NextResponse } from "next/server";
import { buildOverlayPlan, type OverlayScene } from "@/lib/overlay/overlay-plan";
import { triggerApplyOverlays } from "@/lib/modal-client";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type JobRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  video_url: string | null;
  output_url_final: string | null;
  metadata: Record<string, unknown> | null;
};

type ResearchStoryboardRow = {
  scenes_json: unknown;
};

type ResearchAngleRow = {
  title: string | null;
  hook: string | null;
};

function researchJobIdFromMetadata(metadata: Record<string, unknown> | null): string | null {
  const raw = metadata?.research_job_id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function overlayScenesFromJson(value: unknown): OverlayScene[] {
  return Array.isArray(value) ? (value as OverlayScene[]) : [];
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, user_id, status, video_url, output_url_final, metadata")
      .eq("id", id)
      .single<JobRow>();

    if (jobError || !job || job.user_id !== user.id) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "done") {
      return NextResponse.json({ error: "Overlay can only be applied to completed jobs" }, { status: 400 });
    }

    // Brand the most finished cut: a voiced output (T-1113) takes precedence
    // over the raw clip so voice-over + branding chain (voice first, then
    // overlay). Falls back to the raw video when no voiced copy exists.
    const rawVideoUrl = job.output_url_final || job.video_url;
    if (!rawVideoUrl) {
      return NextResponse.json({ error: "Job has no video to overlay" }, { status: 400 });
    }

    const researchJobId = researchJobIdFromMetadata(job.metadata);
    if (!researchJobId) {
      return NextResponse.json({ error: "This job is not linked to a research plan" }, { status: 400 });
    }

    const { data: researchJob, error: researchJobError } = await supabase
      .from("research_jobs")
      .select("id")
      .eq("id", researchJobId)
      .eq("user_id", user.id)
      .single<{ id: string }>();
    if (researchJobError || !researchJob) {
      return NextResponse.json({ error: "Research job not found" }, { status: 404 });
    }

    const { data: storyboard, error: storyboardError } = await supabase
      .from("research_storyboards")
      .select("scenes_json")
      .eq("research_job_id", researchJobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single<ResearchStoryboardRow>();
    if (storyboardError || !storyboard) {
      return NextResponse.json({ error: "Research storyboard not found" }, { status: 404 });
    }

    const { data: angle } = await supabase
      .from("research_angles")
      .select("title, hook")
      .eq("research_job_id", researchJobId)
      .eq("selected", true)
      .limit(1)
      .maybeSingle<ResearchAngleRow>();

    const overlayPlan = buildOverlayPlan({
      scenes: overlayScenesFromJson(storyboard.scenes_json),
      angle: angle ? { title: angle.title, hook: angle.hook } : null,
      brand: { watermark_text: "AlphoGen" },
    });

    if (!overlayPlan.enabled) {
      return NextResponse.json({ error: "No overlay elements available for this research plan" }, { status: 400 });
    }

    try {
      const brandedUrl = await triggerApplyOverlays(job.id, rawVideoUrl, overlayPlan);
      const { error: updateError } = await supabase
        .from("jobs")
        .update({ output_url_final: brandedUrl, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        output_url_final: brandedUrl,
        raw_video_url: job.video_url,
      });
    } catch (error) {
      console.warn("[jobs/overlay] overlay failed; keeping original video", error);
      return NextResponse.json({
        success: false,
        fallback: true,
        video_url: rawVideoUrl,
        error: "Overlay failed; original video kept",
      });
    }
  } catch (error) {
    console.error("[jobs/overlay] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply overlay" },
      { status: 500 }
    );
  }
}
