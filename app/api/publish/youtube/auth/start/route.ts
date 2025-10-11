import { NextResponse } from "next/server";

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_OAUTH_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI!; // e.g., https://your-domain.com/api/publish/youtube/auth/callback

export async function GET() {
  try {
    if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_REDIRECT_URI) {
      return NextResponse.json({ error: "Missing Google OAuth env" }, { status: 500 });
    }

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
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return NextResponse.json({ url: authUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
