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

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseClient();
    const body = await req.json();
    const { projectId, title, description, tags, privacy } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (!project.final_video_path) {
      return NextResponse.json(
        { error: "Project video is not ready for publishing" },
        { status: 400 }
      );
    }

    // Check if user has YouTube token
    if (!project.youtube_token) {
      return NextResponse.json(
        { error: "YouTube authentication required", needsAuth: true },
        { status: 401 }
      );
    }

    console.log("[YouTube Publish] Request received:", {
      projectId,
      title: title || project.title || project.prompt.substring(0, 50),
      description: description?.substring(0, 50) || project.prompt,
      tags,
      privacy: privacy || "private",
    });

    // TODO: Implement actual YouTube API upload
    // For now, simulate success and store a mock video ID
    const mockYouTubeVideoId = `mock_${Date.now()}`;

    // Update project with YouTube video ID
    await supabase
      .from("projects")
      .update({ youtube_video_id: mockYouTubeVideoId })
      .eq("id", projectId);

    return NextResponse.json({
      success: true,
      message: "Video published to YouTube successfully! (Mock implementation)",
      videoId: mockYouTubeVideoId,
      url: `https://youtube.com/watch?v=${mockYouTubeVideoId}`,
      title: title || project.title || project.prompt.substring(0, 50),
      privacy: privacy || "private",
    });

  } catch (e: unknown) {
    console.error("[YouTube Publish] Error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
