import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/publish/instagram
 * Publishes video to Instagram as a Reel via Graph API.
 * Body: { caption }
 *
 * Flow: Create media container → wait for processing → publish
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

    const body = await req.json();
    const { caption } = body;

    const supabase = createServiceClient();

    const { data: conn } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", "instagram")
      .single();

    if (!conn || !conn.channel_id) {
      return NextResponse.json({ error: "Instagram not connected or no business account" }, { status: 400 });
    }

    const accessToken = decryptSecret({
      encrypted: conn.access_token_encrypted,
      iv: conn.token_iv,
      authTag: conn.token_auth_tag,
    });

    const igAccountId = conn.channel_id;

    // Get video URL (prefer Instagram format)
    const { data: job } = await supabase
      .from("jobs")
      .select("output_url_final, video_url, social_exports")
      .eq("id", id)
      .single();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const socialExports = (job.social_exports as Record<string, string>) || {};
    const videoUrl = socialExports.instagram || job.output_url_final || job.video_url;

    // Step 1: Create media container (Reel)
    const containerParams = new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl!,
      caption: (caption || "").slice(0, 2200),
      access_token: accessToken,
    });

    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${igAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: containerParams,
      }
    );
    const container = await containerRes.json();

    if (!container.id) {
      console.error("[instagram-publish] Container creation failed:", container);
      return NextResponse.json({
        error: container.error?.message || "Failed to create Instagram media container",
      }, { status: 500 });
    }

    const containerId = container.id;
    console.log(`[instagram-publish] Container created: ${containerId}`);

    // Step 2: Wait for processing (poll status)
    let status = "IN_PROGRESS";
    let attempts = 0;
    while (status === "IN_PROGRESS" && attempts < 30) {
      await new Promise((r) => setTimeout(r, 5000)); // 5s intervals
      attempts++;

      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      status = statusData.status_code || "UNKNOWN";

      if (status === "FINISHED") break;
      if (status === "ERROR") {
        return NextResponse.json({
          error: "Instagram video processing failed",
        }, { status: 500 });
      }
    }

    if (status !== "FINISHED") {
      return NextResponse.json({
        error: "Instagram processing timed out. Try again.",
      }, { status: 500 });
    }

    // Step 3: Publish the container
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );
    const publishData = await publishRes.json();

    if (!publishData.id) {
      console.error("[instagram-publish] Publish failed:", publishData);
      return NextResponse.json({
        error: publishData.error?.message || "Failed to publish to Instagram",
      }, { status: 500 });
    }

    console.log(`[instagram-publish] Published: media_id=${publishData.id} (user=${user.id})`);

    return NextResponse.json({
      success: true,
      instagram_media_id: publishData.id,
      message: "Published to Instagram! Check your Reels.",
    });
  } catch (error) {
    console.error("[instagram-publish] Error:", error);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
