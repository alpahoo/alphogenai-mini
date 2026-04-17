import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/tiktok/connect
 * Initiates TikTok OAuth 2.0 flow (Login Kit for Web).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json({ error: "TikTok not configured" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const redirectUri = `${siteUrl}/api/auth/tiktok/callback`;

  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString("base64url");

  // TikTok OAuth v2 scopes for video upload
  const scope = "user.info.basic,video.publish,video.upload";

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope,
    redirect_uri: redirectUri,
    state,
  });

  const url = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  return NextResponse.redirect(url);
}
