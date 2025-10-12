import { NextResponse } from "next/server";
import crypto from "crypto";

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_OAUTH_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI!; // e.g., https://your-domain.com/api/publish/youtube/auth/callback

export async function GET() {
  try {
    if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_REDIRECT_URI) {
      return NextResponse.json({ error: "Missing Google OAuth env" }, { status: 500 });
    }

    // PKCE: generate code_verifier and code_challenge (S256)
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(codeVerifier).digest();
    const codeChallenge = Buffer.from(challenge).toString("base64url");

    const scope = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube",
      "openid",
      "email",
      "profile",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      scope,
      prompt: "consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    const res = NextResponse.json({ url: authUrl });
    // Set HttpOnly cookie with code_verifier for callback validation
    res.cookies.set("yt_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/publish/youtube/auth",
      maxAge: 300,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
