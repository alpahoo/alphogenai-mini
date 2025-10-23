import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Generate a signed URL for secure video preview
 * 
 * GET /api/videos/[id]/signed
 * 
 * Returns:
 *   200: { url: "https://...signed-url...", expiresIn: 900 }
 *   401: { error: "Unauthorized" }
 *   403: { error: "Forbidden" }
 *   404: { error: "Video not found" }
 *   500: { error: "Failed to generate signed URL" }
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("user_id, final_url")
      .eq("id", params.id)
      .single();
    
    if (jobError || !job) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }
    
    if (job.user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden - you do not own this video" },
        { status: 403 }
      );
    }
    
    const storagePath = `${user.id}/${params.id}_final.mp4`;
    
    const { data: signedUrlData, error: signError } = await supabase
      .storage
      .from('videos')
      .createSignedUrl(storagePath, 900);
    
    if (signError || !signedUrlData) {
      console.error("[Signed URL] Error:", signError);
      return NextResponse.json(
        { error: "Failed to generate signed URL" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      url: signedUrlData.signedUrl,
      expiresIn: 900
    });
    
  } catch (error: any) {
    console.error("[Signed URL] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
