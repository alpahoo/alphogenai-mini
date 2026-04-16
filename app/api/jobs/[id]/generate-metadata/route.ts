import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSocialMetadata } from "@/lib/social-metadata";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/generate-metadata
 * Generate AI-powered social media metadata (title, hashtags, descriptions).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (!profile || profile.plan === "free") {
      return NextResponse.json(
        { error: "Social metadata is available for Pro and Premium plans", upgrade: true },
        { status: 403 }
      );
    }

    // Get job
    const { data: job } = await supabase
      .from("jobs")
      .select("id, prompt, engine_used, status")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const metadata = generateSocialMetadata(job.prompt, job.engine_used ?? undefined);
    return NextResponse.json({ metadata });
  } catch (error) {
    console.error("[generate-metadata] Error:", error);
    return NextResponse.json({ error: "Metadata generation failed" }, { status: 500 });
  }
}
