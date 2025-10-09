import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId requis" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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
