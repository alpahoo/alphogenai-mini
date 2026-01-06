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

    // Annuler le job
    const { data, error } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        error_message: "Annulé manuellement via admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select();

    if (error) {
      console.error("Erreur cancel job:", error);
      return NextResponse.json(
        { error: "Erreur lors de l'annulation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Job annulé avec succès",
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
