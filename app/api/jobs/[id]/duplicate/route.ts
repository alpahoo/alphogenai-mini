import { buildDuplicateJobPayload } from "@/lib/job-duplicate-payload";
import type { DuplicateJobSource } from "@/lib/job-duplicate-payload";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/duplicate - Create a new job with the same input setup.
 *
 * Unlike retry, duplicate works on any non-avatar job and always creates a
 * fresh generation. Internally forwards to POST /api/jobs so quota, policy,
 * plan enforcement, and provider routing stay centralized.
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

  const { data: rawJob, error } = await supabase
    .from("jobs")
    .select(
      [
        "prompt",
        "target_duration_seconds",
        "engine_used",
        "image_url",
        "references_payload",
        "storyboard",
        "byteplus_asset_ids",
        "multi_scene_chain",
        "chain_strategy",
        "audio_mode",
        "audio_prompt",
        "voiceover_text",
        "aspect_ratio",
        "caption_mode",
        "caption_style",
        "avatar_final",
        "user_id",
      ].join(", "),
    )
    .eq("id", id)
    .single();

  const job = rawJob as (DuplicateJobSource & { user_id?: string }) | null;

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const duplicate = buildDuplicateJobPayload(job);
  if (!duplicate.ok) {
    return NextResponse.json({ error: duplicate.error }, { status: duplicate.status });
  }

  const origin = new URL(req.url).origin;
  const createRes = await fetch(`${origin}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(duplicate.payload),
  });

  const data = await createRes.json();
  return NextResponse.json(data, { status: createRes.status });
}
