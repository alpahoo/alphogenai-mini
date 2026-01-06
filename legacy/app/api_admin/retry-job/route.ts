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

export async function POST(request: Request) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId requis" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Remettre le job en pending pour retry manuel
    const { data, error } = await supabase
      .from("jobs")
      .update({
        status: "pending",
        error_message: null,
        current_stage: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select();

    if (error) {
      console.error("Erreur retry job:", error);
      return NextResponse.json(
        { error: "Erreur lors du retry" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Job relancé avec succès",
      job: data?.[0],
    });
  } catch (err: any) {
    console.error("Erreur serveur:", err);
    return NextResponse.json(
      { error: err.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
