import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/generate-video
 * 
 * Triggers a new video generation job
 * 
 * Body:
 * {
 *   "prompt": "Create a video about AI innovations"
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
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const { prompt, metadata } = body;
    
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Invalid prompt" },
        { status: 400 }
      );
    }
    
    // Check for cached result first
    const { data: cachedJobs } = await supabase
      .from("video_cache")
      .select("*")
      .eq("prompt", prompt)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .limit(1);
    
    if (cachedJobs && cachedJobs.length > 0) {
      return NextResponse.json({
        job_id: cachedJobs[0].id,
        status: "completed",
        cached: true,
        video_url: cachedJobs[0].result?.video_url,
      });
    }
    
    // Create new job
    const { data: job, error: insertError } = await supabase
      .from("video_cache")
      .insert({
        user_id: user.id,
        prompt: prompt,
        status: "pending",
        metadata: metadata || {},
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
    
    // TODO: Trigger Python worker
    // Options:
    // 1. Message queue (Redis, RabbitMQ, etc.)
    // 2. Webhook to worker service
    // 3. Worker polls database for pending jobs
    // 4. Direct Python subprocess (not recommended for production)
    
    // For now, the worker should poll the database for pending jobs
    // You can implement a more robust solution with a message queue
    
    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      message: "Video generation job created. Processing will begin shortly.",
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
 * Check the status of a video generation job
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Get job_id from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");
    
    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job_id parameter" },
        { status: 400 }
      );
    }
    
    // Fetch job
    const { data: job, error: fetchError } = await supabase
      .from("video_cache")
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
    
    // Return job status
    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      current_stage: job.current_stage,
      error_message: job.error_message,
      result: job.result,
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
