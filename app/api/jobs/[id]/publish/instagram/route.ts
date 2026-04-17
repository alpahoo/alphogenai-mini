import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/publish/instagram
 * Publishes video to Instagram as a Reel via the new Instagram Graph API.
 * Body: { caption }
 *
 * Flow:
 *   1. Create media container (Reel) → container_id
 *   2. Poll container status until FINISHED
 *   3. Publish container → media_id
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

    // ── Get Instagram connection ────────────────────────────────────────────
    const { data: conn } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", "instagram")
      .single();

    if (!conn) {
      return NextResponse.json({ error: "Instagram not connected" }, { status: 400 });
    }
    if (!conn.channel_id) {
      return NextResponse.json(
        { error: "No Instagram User ID found. Please reconnect your account." },
        { status: 400 }
      );
    }

    let accessToken = decryptSecret({
      encrypted: conn.access_token_encrypted,
      iv: conn.token_iv,
      authTag: conn.token_auth_tag,
    });

    // ── Proactive token refresh (Instagram long-lived tokens expire after 60 days) ──
    // Refresh if the token expires within 7 days — extends it by another 60 days.
    // Instagram has no separate refresh_token; you refresh the token itself while it's still valid.
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (conn.expires_at && new Date(conn.expires_at) < sevenDaysFromNow) {
      try {
        const refreshRes = await fetch(
          `https://graph.instagram.com/refresh_access_token?` +
          new URLSearchParams({
            grant_type: "ig_refresh_token",
            access_token: accessToken,
          })
        );
        const refreshData = await refreshRes.json();

        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          const { encryptSecret } = await import("@/lib/encryption");
          const enc = encryptSecret(accessToken);
          await supabase.from("social_connections").update({
            access_token_encrypted: enc.encrypted,
            token_iv: enc.iv,
            token_auth_tag: enc.authTag,
            expires_at: new Date(Date.now() + (refreshData.expires_in ?? 5184000) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", conn.id);
          console.log(`[instagram-publish] Token refreshed, new expiry in ${refreshData.expires_in ?? 5184000}s`);
        } else {
          console.warn("[instagram-publish] Token refresh failed (token may be expired):", refreshData);
          // Continue with existing token — it may still work if not yet expired
        }
      } catch (e) {
        console.warn("[instagram-publish] Token refresh error (non-fatal):", e);
      }
    }

    const igUserId = conn.channel_id;

    // ── Get video URL ───────────────────────────────────────────────────────
    const { data: job } = await supabase
      .from("jobs")
      .select("output_url_final, video_url, social_exports")
      .eq("id", id)
      .single();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const socialExports = (job.social_exports as Record<string, string>) || {};
    const videoUrl = socialExports.instagram || job.output_url_final || job.video_url;

    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL found" }, { status: 400 });
    }

    console.log(`[instagram-publish] Starting: user=${user.id} ig=${igUserId}`);

    // ── Step 1: Create Reel media container ────────────────────────────────
    // Uses new Instagram Graph API (graph.instagram.com, not graph.facebook.com)
    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          media_type: "REELS",
          video_url: videoUrl,
          caption: (caption || "").slice(0, 2200),
          access_token: accessToken,
        }),
      }
    );
    const container = await containerRes.json();

    if (!container.id) {
      console.error("[instagram-publish] Container creation failed:", container);
      const errMsg = container.error?.message || "Failed to create Instagram media container";
      return NextResponse.json({ error: errMsg, details: container }, { status: 500 });
    }

    const containerId = container.id;
    console.log(`[instagram-publish] Container created: ${containerId}`);

    // ── Step 2: Poll container status until FINISHED ────────────────────────
    let status = "IN_PROGRESS";
    let attempts = 0;
    const MAX_ATTEMPTS = 36; // 3 min max (36 × 5s)

    while (status === "IN_PROGRESS" && attempts < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 5000)); // 5s wait
      attempts++;

      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      status = statusData.status_code || "UNKNOWN";

      console.log(`[instagram-publish] Poll #${attempts}: status=${status}`);

      if (status === "FINISHED") break;
      if (status === "ERROR") {
        return NextResponse.json(
          { error: "Instagram video processing failed. Check that the video URL is publicly accessible." },
          { status: 500 }
        );
      }
    }

    if (status !== "FINISHED") {
      return NextResponse.json(
        { error: `Instagram processing timed out (status: ${status}). Try again.` },
        { status: 500 }
      );
    }

    // ── Step 3: Publish the container ──────────────────────────────────────
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
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
      const errMsg = publishData.error?.message || "Failed to publish to Instagram";
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    console.log(
      `[instagram-publish] Published: media_id=${publishData.id} (user=${user.id} ig=${igUserId})`
    );

    return NextResponse.json({
      success: true,
      instagram_media_id: publishData.id,
      message: "Published to Instagram! Check your Reels in a few minutes.",
    });
  } catch (error) {
    console.error("[instagram-publish] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
