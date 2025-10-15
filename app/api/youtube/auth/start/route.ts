import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const projectId = searchParams.get("project_id");

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    // TODO: Implement actual YouTube OAuth flow
    // For now, simulate OAuth and store a mock token
    const supabase = getSupabaseClient();
    
    const mockToken = `mock_youtube_token_${Date.now()}`;
    
    if (projectId) {
      // Update specific project with YouTube token
      await supabase
        .from("projects")
        .update({ youtube_token: mockToken })
        .eq("id", projectId)
        .eq("user_id", userId);
    } else {
      // Update all user projects with YouTube token
      await supabase
        .from("projects")
        .update({ youtube_token: mockToken })
        .eq("user_id", userId);
    }

    console.log("[YouTube Auth] Mock authentication completed for user:", userId);

    // Redirect back to the project or history page
    const redirectUrl = projectId 
      ? `/creator/view/${projectId}?youtube_auth=success`
      : `/history?youtube_auth=success`;

    return NextResponse.redirect(new URL(redirectUrl, req.url));

  } catch (e: unknown) {
    console.error("[YouTube Auth] Error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, projectId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Generate OAuth URL (mock implementation)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const authUrl = `${baseUrl}/api/youtube/auth/start?user_id=${userId}${projectId ? `&project_id=${projectId}` : ""}`;

    return NextResponse.json({
      authUrl,
      message: "Redirect to this URL to authenticate with YouTube"
    });

  } catch (e: unknown) {
    console.error("[YouTube Auth] Error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}