import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/instagram/connect
 * Initiates Instagram OAuth via Meta/Facebook Login.
 * Requires Facebook app with Instagram Graph API enabled.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "Instagram/Facebook not configured" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const redirectUri = `${siteUrl}/api/auth/instagram/callback`;

  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString("base64url");

  // Scopes for Instagram content publishing
  const scope = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
  ].join(",");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope,
    response_type: "code",
    state,
  });

  const url = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  return NextResponse.redirect(url);
}
