import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createClient();

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
