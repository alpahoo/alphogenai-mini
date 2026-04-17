import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/encryption";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/instagram/callback
 * Handles Instagram OAuth callback (new Business API — instagram.com/oauth).
 *
 * Flow:
 *   1. Exchange code → short-lived token (api.instagram.com)
 *   2. Exchange → long-lived token (graph.instagram.com)
 *   3. Get user ID + username (graph.instagram.com/me)
 *   4. Store encrypted token in social_connections
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (errorParam) {
    console.error("[instagram-cb] OAuth error:", errorParam);
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=${errorParam}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=missing_params`);
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=invalid_state`);
  }

  const appId = process.env.INSTAGRAM_APP_ID!;
  const appSecret = process.env.INSTAGRAM_APP_SECRET!;
  const redirectUri = `${siteUrl}/api/auth/instagram/callback`;

  if (!appId || !appSecret) {
    console.error("[instagram-cb] INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET not set");
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=not_configured`);
  }

  try {
    // ── Step 1: Exchange code → short-lived access token ──────────────────
    const shortTokenForm = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });

    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: shortTokenForm,
    });
    const shortData = await shortRes.json();

    if (!shortData.access_token) {
      console.error("[instagram-cb] Short-lived token failed:", shortData);
      return NextResponse.redirect(`${siteUrl}/home?instagram_error=token_failed`);
    }

    const shortToken = shortData.access_token as string;
    // user_id is the Instagram User ID returned directly in the short token response
    const igUserId = String(shortData.user_id ?? "");

    // ── Step 2: Exchange → long-lived token (60 days) ─────────────────────
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?` +
      new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        access_token: shortToken,
      })
    );
    const longData = await longRes.json();

    const accessToken = longData.access_token || shortToken;
    const expiresIn: number = longData.expires_in ?? 5184000; // 60 days default

    // ── Step 3: Get username from Instagram Graph API ──────────────────────
    let username: string | null = null;
    let resolvedIgUserId = igUserId;
    try {
      const meRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
      );
      const meData = await meRes.json();
      username = meData.username ?? null;
      if (meData.id) resolvedIgUserId = meData.id;
    } catch { /* ignore — will work without username */ }

    // ── Step 4: Encrypt + store ────────────────────────────────────────────
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
        // channel_id = Instagram User ID (used for media publishing)
        channel_id: resolvedIgUserId || null,
        channel_name: username,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    console.log(
      `[instagram-cb] Connected: user=${userId} ig_user=${resolvedIgUserId} username=${username}`
    );
    return NextResponse.redirect(`${siteUrl}/home?instagram_connected=true`);
  } catch (e) {
    console.error("[instagram-cb] Exception:", e);
    return NextResponse.redirect(`${siteUrl}/home?instagram_error=exception`);
  }
}
