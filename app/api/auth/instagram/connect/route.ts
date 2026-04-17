import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/instagram/connect
 * Initiates Instagram OAuth via the new Instagram Business API.
 * Uses instagram.com/oauth/authorize (not Facebook dialog).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
    );
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not configured" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const redirectUri = `${siteUrl}/api/auth/instagram/callback`;
  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString("base64url");

  // New Instagram Business API scopes
  const scope = [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_comments",
  ].join(",");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });

  // New Instagram OAuth endpoint (not Facebook dialog)
  const url = `https://www.instagram.com/oauth/authorize?${params}`;
  return NextResponse.redirect(url);
}
