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

export async function POST() {
  try {
    const supabase = getSupabaseClient();

    // Annuler tous les jobs pending ou in_progress
    const { data, error } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        error_message: "Annulé manuellement via admin",
        updated_at: new Date().toISOString(),
      })
      .in("status", ["pending", "processing", "in_progress"])
      .select();

    if (error) {
      console.error("Erreur annulation jobs:", error);
      return NextResponse.json(
        { error: "Erreur lors de l'annulation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      cancelled: data?.length || 0,
    });
  } catch (err: any) {
    console.error("Erreur serveur:", err);
    return NextResponse.json(
      { error: err.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
