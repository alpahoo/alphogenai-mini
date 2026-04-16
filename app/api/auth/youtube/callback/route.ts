import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/youtube/callback
 * Handles Google OAuth callback. Exchanges code for tokens,
 * stores encrypted tokens in social_connections table.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (error) {
    console.error(`[youtube-oauth] Error: ${error}`);
    return NextResponse.redirect(`${siteUrl}/home?youtube_error=${error}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/home?youtube_error=missing_params`);
  }

  // Decode state
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
    if (!userId) throw new Error("no userId");
  } catch {
    return NextResponse.redirect(`${siteUrl}/home?youtube_error=invalid_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok || !tokens.access_token) {
      console.error("[youtube-oauth] Token exchange failed:", tokens);
      return NextResponse.redirect(`${siteUrl}/home?youtube_error=token_failed`);
    }

    // Get YouTube channel info
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    // Encrypt tokens
    const accessEnc = encryptSecret(tokens.access_token);
    const refreshEnc = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : null;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Store in DB (upsert)
    const supabase = createServiceClient();
    const { error: dbError } = await supabase.from("social_connections").upsert(
      {
        user_id: userId,
        platform: "youtube",
        access_token_encrypted: accessEnc.encrypted,
        token_iv: accessEnc.iv,
        token_auth_tag: accessEnc.authTag,
        refresh_token_encrypted: refreshEnc?.encrypted ?? null,
        refresh_iv: refreshEnc?.iv ?? null,
        refresh_auth_tag: refreshEnc?.authTag ?? null,
        channel_name: channel?.snippet?.title ?? null,
        channel_id: channel?.id ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    if (dbError) {
      console.error("[youtube-oauth] DB error:", dbError);
      return NextResponse.redirect(`${siteUrl}/home?youtube_error=db_failed`);
    }

    console.log(
      `[youtube-oauth] Connected: user=${userId} channel=${channel?.snippet?.title ?? "?"}`
    );
    return NextResponse.redirect(`${siteUrl}/home?youtube_connected=true`);
  } catch (e) {
    console.error("[youtube-oauth] Exception:", e);
    return NextResponse.redirect(`${siteUrl}/home?youtube_error=exception`);
  }
}
