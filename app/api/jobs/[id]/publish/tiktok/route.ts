import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/publish/tiktok
 * Uploads video to TikTok via Content Posting API — FILE_UPLOAD method.
 * (PULL_FROM_URL requires verified domain; FILE_UPLOAD has no such constraint)
 *
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

    // ── Get TikTok connection ───────────────────────────────────
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

    // ── Refresh token if expired ────────────────────────────────
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

    // ── Get video URL ───────────────────────────────────────────
    const { data: job } = await supabase
      .from("jobs")
      .select("output_url_final, video_url, social_exports")
      .eq("id", id)
      .single();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const socialExports = (job.social_exports as Record<string, string>) || {};
    const videoUrl = socialExports.tiktok || job.output_url_final || job.video_url;

    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL found" }, { status: 400 });
    }

    // ── Download video bytes from R2 ────────────────────────────
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ error: `Failed to download video: ${videoRes.status}` }, { status: 500 });
    }
    const videoBuffer = await videoRes.arrayBuffer();
    const videoSize = videoBuffer.byteLength;

    // TikTok chunk size: min 5MB except last chunk, max 64MB
    const chunkSize = 10 * 1024 * 1024; // 10MB
    const totalChunks = Math.ceil(videoSize / chunkSize);

    console.log(`[tiktok-publish] FILE_UPLOAD: size=${videoSize} chunks=${totalChunks} user=${user.id}`);

    // ── Init upload (FILE_UPLOAD) ───────────────────────────────
    const initRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: (title || "AI Generated Video").slice(0, 150),
            privacy_level: privacy || "SELF_ONLY",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: chunkSize,
            total_chunk_count: totalChunks,
          },
        }),
      }
    );

    const initData = await initRes.json();
    console.log("[tiktok-publish] Init response:", JSON.stringify(initData));

    if (!initRes.ok || initData.error?.code) {
      return NextResponse.json({
        error: initData.error?.message || `TikTok init error: ${initRes.status}`,
        details: initData,
      }, { status: 500 });
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl) {
      return NextResponse.json({ error: "No upload URL returned", details: initData }, { status: 500 });
    }

    // ── Upload chunks ───────────────────────────────────────────
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, videoSize);
      const chunk = videoBuffer.slice(start, end);

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${start}-${end - 1}/${videoSize}`,
        },
        body: chunk,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error(`[tiktok-publish] Chunk ${i + 1}/${totalChunks} failed:`, uploadRes.status, errText);
        return NextResponse.json({
          error: `Chunk upload failed at ${i + 1}/${totalChunks}: ${uploadRes.status}`,
        }, { status: 500 });
      }

      console.log(`[tiktok-publish] Chunk ${i + 1}/${totalChunks} uploaded`);
    }

    console.log(`[tiktok-publish] All chunks uploaded. publish_id=${publishId}`);

    return NextResponse.json({
      success: true,
      publish_id: publishId,
      message: "Video submitted to TikTok. Check your TikTok app in a few minutes.",
    });
  } catch (error) {
    console.error("[tiktok-publish] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
