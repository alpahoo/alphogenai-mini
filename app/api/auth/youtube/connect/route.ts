import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/youtube/connect
 * Initiates Google OAuth 2.0 flow for YouTube access.
 * Redirects to Google's consent screen.
 *
 * Accepts optional ?return_to=/jobs/xxx to redirect back after OAuth.
 */
export async function GET(req: Request) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ].join(" ");

  // Capture return_to from query string (e.g., /jobs/abc-123)
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return_to") || "/home";

  // Include user_id + return path in state for security (CSRF protection)
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    ts: Date.now(),
    returnTo,
  })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return NextResponse.redirect(oauthUrl);
}
