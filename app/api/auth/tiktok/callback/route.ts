import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/tiktok/callback
 * Handles TikTok OAuth callback. Exchanges code for tokens.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${siteUrl}/home?tiktok_error=${error}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/home?tiktok_error=missing_params`);
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(`${siteUrl}/home?tiktok_error=invalid_state`);
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
  const redirectUri = `${siteUrl}/api/auth/tiktok/callback`;

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("[tiktok-oauth] Token exchange failed:", tokens);
      return NextResponse.redirect(`${siteUrl}/home?tiktok_error=token_failed`);
    }

    // Get user info
    const userRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const userData = await userRes.json();
    const displayName = userData?.data?.user?.display_name ?? null;

    // Encrypt + store
    const accessEnc = encryptSecret(tokens.access_token);
    const refreshEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const supabase = createServiceClient();
    await supabase.from("social_connections").upsert(
      {
        user_id: userId,
        platform: "tiktok",
        access_token_encrypted: accessEnc.encrypted,
        token_iv: accessEnc.iv,
        token_auth_tag: accessEnc.authTag,
        refresh_token_encrypted: refreshEnc?.encrypted ?? null,
        refresh_iv: refreshEnc?.iv ?? null,
        refresh_auth_tag: refreshEnc?.authTag ?? null,
        channel_name: displayName,
        channel_id: tokens.open_id ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    console.log(`[tiktok-oauth] Connected: user=${userId} name=${displayName}`);
    return NextResponse.redirect(`${siteUrl}/home?tiktok_connected=true`);
  } catch (e) {
    console.error("[tiktok-oauth] Exception:", e);
    return NextResponse.redirect(`${siteUrl}/home?tiktok_error=exception`);
  }
}
