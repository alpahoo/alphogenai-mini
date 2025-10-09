import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Erreur récupération jobs:", error);
      return NextResponse.json(
        { error: "Erreur lors de la récupération des jobs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobs: data || [],
    });
  } catch (err: any) {
    console.error("Erreur serveur:", err);
    return NextResponse.json(
      { error: err.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
