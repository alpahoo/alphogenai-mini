import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient as createService } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "videos";

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;

export const runtime = "nodejs";

async function getUserTokens(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("youtube_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: Request) {
  try {
    const { project_id, title, description, privacyStatus, user_id } = await req.json();
    if (!project_id || !title || !user_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createService(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("final_video_path, user_id")
      .eq("id", project_id)
      .single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });
    if (!project?.final_video_path) return NextResponse.json({ error: "No final video for project" }, { status: 400 });

    // RLS-like check: either service role or owner
    if (project.user_id !== user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tokens = await getUserTokens(supabase, user_id);

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      // redirect not used on server refresh flow
      "postmessage"
    );
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : undefined,
    });

    // Refresh if needed
    const now = Date.now();
    if (!tokens.access_token || (tokens.expiry_date && new Date(tokens.expiry_date).getTime() < now)) {
      const newTokens = await oauth2Client.refreshAccessToken();
      const creds = newTokens.credentials;
      await supabase
        .from("youtube_tokens")
        .update({
          access_token: creds.access_token,
          expiry_date: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);
      oauth2Client.setCredentials({
        access_token: creds.access_token!,
        refresh_token: tokens.refresh_token,
        expiry_date: creds.expiry_date,
      });
    }

    // Download the final video from Supabase Storage
    const { data: file, error: dlErr } = await supabase.storage.from(STORAGE_BUCKET).download(project.final_video_path);
    if (dlErr) return NextResponse.json({ error: dlErr.message }, { status: 500 });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: privacyStatus || "unlisted" },
      },
      media: {
        body: file as any, // ReadableStream in edge may vary; in Node it’s a stream
      },
    } as any);

    return NextResponse.json({ ok: true, videoId: res.data.id, link: `https://youtu.be/${res.data.id}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
