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
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    // Check if project exists and get scenes
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get completed scenes
    const { data: scenes, error: scenesError } = await supabase
      .from("project_scenes")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .not("output_url", "is", null)
      .order("scene_number");

    if (scenesError || !scenes || scenes.length === 0) {
      return NextResponse.json({ error: "No completed scenes found" }, { status: 400 });
    }

    // Create a job for the video assembly worker
    const { data: assemblyJob, error: jobError } = await supabase
      .from("jobs")
      .insert({
        prompt: `Assemble video for project: ${project.prompt}`,
        status: "pending",
        current_stage: "video_assembly",
        app_state: {
          type: "video_assembly",
          project_id: projectId,
          scenes: scenes.map(s => ({
            scene_number: s.scene_number,
            output_url: s.output_url,
            music_url: s.music_url,
            duration: s.duration
          }))
        }
      })
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    // Update project status
    await supabase
      .from("projects")
      .update({ status: "generating" })
      .eq("id", projectId);

    return NextResponse.json({ 
      message: "Video assembly started",
      jobId: assemblyJob.id 
    });

  } catch (error: any) {
    console.error("Assembly API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}