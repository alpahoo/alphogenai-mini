import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/publish/tiktok
 * Uploads video to TikTok via Content Posting API (direct post).
 * Body: { title, privacy?: "PUBLIC_TO_EVERYONE"|"MUTUAL_FOLLOW_FRIENDS"|"SELF_ONLY" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Auth required" }, { status: 401 });
    }

    const body = await req.json();
    const { title, privacy } = body;

    const supabase = createServiceClient();

    // Get TikTok connection
    const { data: conn } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", "tiktok")
      .single();

    if (!conn) {
      return NextResponse.json({ error: "TikTok not connected" }, { status: 400 });
    }

    let accessToken = decryptSecret({
      encrypted: conn.access_token_encrypted,
      iv: conn.token_iv,
      authTag: conn.token_auth_tag,
    });

    // Refresh if expired
    if (conn.expires_at && new Date(conn.expires_at) < new Date() && conn.refresh_token_encrypted) {
      const refreshToken = decryptSecret({
        encrypted: conn.refresh_token_encrypted,
        iv: conn.refresh_iv!,
        authTag: conn.refresh_auth_tag!,
      });

      const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY!,
          client_secret: process.env.TIKTOK_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      const newTokens = await tokenRes.json();
      if (newTokens.access_token) {
        accessToken = newTokens.access_token;
        const enc = encryptSecret(accessToken);
        await supabase.from("social_connections").update({
          access_token_encrypted: enc.encrypted,
          token_iv: enc.iv,
          token_auth_tag: enc.authTag,
          expires_at: new Date(Date.now() + (newTokens.expires_in ?? 86400) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", conn.id);
      }
    }

    // Get video URL
    const { data: job } = await supabase
      .from("jobs")
      .select("output_url_final, video_url, social_exports")
      .eq("id", id)
      .single();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const socialExports = (job.social_exports as Record<string, string>) || {};
    const videoUrl = socialExports.tiktok || job.output_url_final || job.video_url;

    // TikTok Direct Post API — initialize upload
    const initRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_info: {
            title: (title || "").slice(0, 150),
            privacy_level: privacy || "SELF_ONLY",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoUrl,
          },
        }),
      }
    );

    const initData = await initRes.json();

    if (!initRes.ok || initData.error?.code) {
      console.error("[tiktok-publish] Init failed:", initData);
      return NextResponse.json({
        error: initData.error?.message || `TikTok API error: ${initRes.status}`,
      }, { status: 500 });
    }

    const publishId = initData.data?.publish_id;
    console.log(`[tiktok-publish] Initiated: publish_id=${publishId} (user=${user.id})`);

    return NextResponse.json({
      success: true,
      publish_id: publishId,
      message: "Video submitted to TikTok. It may take a few minutes to appear on your profile.",
      note: "TikTok processes the video asynchronously. Check your TikTok app for the post.",
    });
  } catch (error) {
    console.error("[tiktok-publish] Error:", error);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
