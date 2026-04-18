import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateSocialMetadata } from "@/lib/social-metadata";

/**
 * POST /api/jobs/[id]/generate-metadata
 * Generates AI-crafted social media metadata for a completed job.
 *
 * Uses EvoLink LLM (DeepSeek) — platform-optimized:
 *   title, hashtags, TikTok caption, YouTube description, Instagram caption
 *
 * Falls back to keyword-template generation if LLM is unavailable.
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
      return NextResponse.json({ error: "Auth required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from("jobs")
      .select("id, prompt, plan, engine_used, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.plan === "free") {
      return NextResponse.json(
        { error: "Upgrade to Pro to generate AI metadata" },
        { status: 403 }
      );
    }

    console.log(`[generate-metadata] job=${id} prompt="${String(job.prompt).slice(0, 60)}"`);

    const metadata = await generateSocialMetadata(
      String(job.prompt),
      job.engine_used ? String(job.engine_used) : undefined
    );

    return NextResponse.json({ success: true, metadata });
  } catch (error) {
    console.error("[generate-metadata] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
