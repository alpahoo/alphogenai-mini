import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 chars)" },
        { status: 400 }
      );
    }

    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert({
        prompt: prompt.trim(),
        status: "pending",
        current_stage: "queued",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create job:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Trigger Modal pipeline (async - returns immediately)
    const modalUrl = process.env.MODAL_WEBHOOK_URL;
    if (modalUrl) {
      const modalRes = await fetch(`${modalUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
        },
        body: JSON.stringify({
          job_id: job.id,
          prompt: prompt.trim(),
        }),
      });

      if (!modalRes.ok) {
        console.error(
          "Failed to trigger Modal pipeline:",
          await modalRes.text()
        );
        // Job is already created in Supabase - mark it as failed
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: "Failed to start pipeline" })
          .eq("id", job.id);
      }
    } else {
      console.warn("MODAL_WEBHOOK_URL not set - pipeline not triggered");
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/jobs:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
