import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { publishScheduledPost } from "@/lib/publish-worker";

/**
 * POST /api/scheduled-posts/[id]/publish-now
 * Immediately publish a scheduled post (bypasses scheduled_at).
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

    const { data: post, error: fetchErr } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !post) {
      return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 });
    }

    if (post.status !== "scheduled" && post.status !== "failed") {
      return NextResponse.json(
        { error: `Cannot publish a post with status "${post.status}"` },
        { status: 400 }
      );
    }

    // Publish immediately
    const result = await publishScheduledPost(post, supabase);

    return NextResponse.json({
      success: true,
      status: result.status,
      results: result.publish_results,
      message: result.status === "published"
        ? "Published to all platforms!"
        : result.status === "partially_published"
          ? "Published to some platforms. Check results for details."
          : `Publishing failed: ${result.error_message}`,
    });
  } catch (e) {
    console.error("[scheduled-posts] Publish-now error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
