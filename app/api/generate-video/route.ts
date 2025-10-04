import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/generate-video
 * 
 * Crée un nouveau job de génération vidéo
 * 
 * Body:
 * {
 *   "prompt": "Créer une vidéo sur l'IA"
 * }
 * 
 * Returns:
 * {
 *   "job_id": "uuid",
 *   "status": "pending"
 * }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Parser le body
    const body = await request.json();
    const { prompt } = body;
    
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Invalid prompt" },
        { status: 400 }
      );
    }
    
    // Créer le job dans la table jobs
    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        prompt: prompt,
        status: "pending",
        app_state: {},
      })
      .select()
      .single();
    
    if (insertError) {
      console.error("Error creating job:", insertError);
      return NextResponse.json(
        { error: "Failed to create job" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      message: "Job créé. Le worker va le traiter automatiquement.",
    });
    
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate-video?job_id=uuid
 * 
 * Vérifie le statut d'un job
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Récupérer job_id
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");
    
    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job_id parameter" },
        { status: 400 }
      );
    }
    
    // Récupérer le job
    const { data: job, error: fetchError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();
    
    if (fetchError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }
    
    // Retourner le statut
    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      current_stage: job.current_stage,
      error_message: job.error_message,
      video_url: job.video_url,
      app_state: job.app_state,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
    
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
