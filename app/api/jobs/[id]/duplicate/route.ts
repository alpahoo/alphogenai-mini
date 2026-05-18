import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/duplicate — Create a new job with the same parameters.
 *
 * Unlike retry, duplicate works on any job (done, failed, etc.) and always
 * creates a fresh generation. Internally forwards to POST /api/jobs so all
 * quota/plan enforcement stays centralized.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the original job
  const { data: job, error } = await supabase
    .from("jobs")
    .select("prompt, plan, target_duration_seconds, engine_used, image_url, references_payload, user_id")
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Ownership check
  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build the payload matching POST /api/jobs body shape
  const payload: Record<string, unknown> = {
    prompt: job.prompt,
    target_duration_seconds: job.target_duration_seconds,
  };

  if (job.engine_used) payload.preferred_engine = job.engine_used;
  if (job.image_url) payload.image_url = job.image_url;
  if (job.references_payload) payload.references = job.references_payload;

  // Forward to POST /api/jobs — reuse all existing validation/quota/routing
  const origin = new URL(req.url).origin;
  const createRes = await fetch(`${origin}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(payload),
  });

  const data = await createRes.json();
  return NextResponse.json(data, { status: createRes.status });
}
