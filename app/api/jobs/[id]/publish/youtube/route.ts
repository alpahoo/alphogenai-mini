import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/publish/youtube
 * Uploads video to user's connected YouTube channel.
 *
 * Body: { title, description, tags?: string[], privacy?: "public"|"unlisted"|"private" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, tags, privacy } = body as {
      title?: string;
      description?: string;
      tags?: string[];
      privacy?: string;
    };

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get YouTube connection
    const { data: connection } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", "youtube")
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: "YouTube not connected. Go to Settings to connect." },
        { status: 400 }
      );
    }

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decryptSecret({
        encrypted: connection.access_token_encrypted,
        iv: connection.token_iv,
        authTag: connection.token_auth_tag,
      });
    } catch {
      return NextResponse.json({ error: "Failed to decrypt YouTube token" }, { status: 500 });
    }

    // Check if token expired — refresh if needed
    if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
      if (!connection.refresh_token_encrypted) {
        return NextResponse.json(
          { error: "YouTube token expired. Reconnect your account." },
          { status: 401 }
        );
      }

      try {
        const refreshToken = decryptSecret({
          encrypted: connection.refresh_token_encrypted,
          iv: connection.refresh_iv!,
          authTag: connection.refresh_auth_tag!,
        });

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        const newTokens = await tokenRes.json();
        if (!newTokens.access_token) {
          return NextResponse.json(
            { error: "Token refresh failed. Reconnect YouTube." },
            { status: 401 }
          );
        }

        accessToken = newTokens.access_token;

        // Update encrypted token in DB
        const { encryptSecret: enc } = await import("@/lib/encryption");
        const newEnc = enc(accessToken);
        await supabase.from("social_connections").update({
          access_token_encrypted: newEnc.encrypted,
          token_iv: newEnc.iv,
          token_auth_tag: newEnc.authTag,
          expires_at: new Date(Date.now() + (newTokens.expires_in ?? 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", connection.id);
      } catch (e) {
        return NextResponse.json({ error: `Refresh failed: ${e}` }, { status: 500 });
      }
    }

    // Get video URL
    const { data: job } = await supabase
      .from("jobs")
      .select("output_url_final, video_url, social_exports")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Use YouTube format if available, else original
    const socialExports = (job.social_exports as Record<string, string>) || {};
    const videoUrl = socialExports.youtube || job.output_url_final || job.video_url;

    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL" }, { status: 400 });
    }

    // Download video bytes
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ error: "Failed to download video" }, { status: 500 });
    }
    const videoBuffer = await videoRes.arrayBuffer();

    // YouTube upload (resumable upload)
    const privacyStatus = ["public", "unlisted", "private"].includes(privacy ?? "")
      ? privacy
      : "unlisted";

    const metadata = {
      snippet: {
        title: title.slice(0, 100),
        description: (description || "").slice(0, 5000),
        tags: (tags || []).slice(0, 30),
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    // Step 1: Initiate resumable upload
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(videoBuffer.byteLength),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      console.error("[youtube-publish] Init failed:", initRes.status, errText);
      // Extract the human-readable reason from YouTube's error JSON
      let reason = errText;
      try {
        const parsed = JSON.parse(errText);
        reason = parsed?.error?.errors?.[0]?.reason
          ?? parsed?.error?.message
          ?? errText;
      } catch { /* keep raw text */ }
      return NextResponse.json(
        { error: `YouTube ${initRes.status}: ${reason}` },
        { status: 500 }
      );
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      return NextResponse.json({ error: "No upload URL from YouTube" }, { status: 500 });
    }

    // Step 2: Upload video bytes
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.byteLength),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("[youtube-publish] Upload failed:", errText);
      return NextResponse.json(
        { error: `YouTube upload failed: ${uploadRes.status}` },
        { status: 500 }
      );
    }

    const uploadResult = await uploadRes.json();
    const videoId = uploadResult.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    console.log(`[youtube-publish] Published: ${youtubeUrl} (user=${user.id}, job=${id})`);

    return NextResponse.json({
      success: true,
      youtube_video_id: videoId,
      youtube_url: youtubeUrl,
      privacy: privacyStatus,
    });
  } catch (error) {
    console.error("[youtube-publish] Error:", error);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
