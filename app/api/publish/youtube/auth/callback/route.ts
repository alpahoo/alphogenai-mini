import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient as createService } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
const GOOGLE_OAUTH_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI!; // https://your-domain.com/api/publish/youtube/auth/callback

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("user_id");
    if (!code || !userId) return NextResponse.json({ error: "Missing code or user_id" }, { status: 400 });

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.json({ error: "Missing tokens from Google" }, { status: 400 });
    }

    const supabase = createService(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

    const { error } = await supabase
      .from("youtube_tokens")
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: expiryDate,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
