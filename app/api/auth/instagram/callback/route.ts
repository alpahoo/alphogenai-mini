import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/instagram/callback
 * Handles Instagram/Facebook OAuth callback.
 * Exchanges short-lived token for long-lived token.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (error) return NextResponse.redirect(`${siteUrl}/home?instagram_error=${error}`);
  if (!code || !state) return NextResponse.redirect(`${siteUrl}/home?instagram_error=missing_params`);

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=invalid_state`);
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${siteUrl}/api/auth/instagram/callback`;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      })
    );
    const shortToken = await tokenRes.json();
    if (!shortToken.access_token) {
      console.error("[instagram-oauth] Short token failed:", shortToken);
      return NextResponse.redirect(`${siteUrl}/home?instagram_error=token_failed`);
    }

    // Step 2: Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken.access_token,
      })
    );
    const longToken = await longRes.json();
    const accessToken = longToken.access_token || shortToken.access_token;
    const expiresIn = longToken.expires_in || 5184000; // 60 days default

    // Step 3: Get Instagram Business Account ID
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();
    const igAccount = pagesData.data?.find(
      (p: { instagram_business_account?: { id: string } }) => p.instagram_business_account
    );
    const igAccountId = igAccount?.instagram_business_account?.id ?? null;
    const pageName = igAccount?.name ?? null;

    // Encrypt + store
    const enc = encryptSecret(accessToken);
    const supabase = createServiceClient();

    await supabase.from("social_connections").upsert(
      {
        user_id: userId,
        platform: "instagram",
        access_token_encrypted: enc.encrypted,
        token_iv: enc.iv,
        token_auth_tag: enc.authTag,
        refresh_token_encrypted: null,
        refresh_iv: null,
        refresh_auth_tag: null,
        channel_name: pageName,
        channel_id: igAccountId,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    console.log(`[instagram-oauth] Connected: user=${userId} ig=${igAccountId} page=${pageName}`);
    return NextResponse.redirect(`${siteUrl}/home?instagram_connected=true`);
  } catch (e) {
    console.error("[instagram-oauth] Exception:", e);
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=exception`);
  }
}
