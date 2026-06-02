import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { downloadAndUploadToR2 } from "@/lib/r2";

/**
 * GET  /api/looks — List the user's saved cinematic Looks (reusable shots).
 * POST /api/looks — Save a completed cinematic job's clip as a reusable Look.
 *   Downloads the HeyGen clip (its URL expires ~24h) into R2 for persistence.
 * DELETE /api/looks?id=... — Remove a saved Look.
 *
 * A Look is a cinematic shot you can reuse: new scripts are lip-synced onto it
 * (no Seedance regen) → cheaper, faster, and a consistent visual.
 */

// Video download + R2 upload can take a few seconds.
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data } = await svc
    .from("cinematic_looks")
    .select("id, name, video_url, thumbnail_url, duration_sec, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ looks: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { job_id, name } = body as { job_id?: string; name?: string };
  if (!job_id) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Load the job + its first scene (the cinematic clip to reuse)
  const { data: job } = await svc
    .from("jobs")
    .select("id, user_id, engine_used, prompt, output_url_final, video_url")
    .eq("id", job_id)
    .single();

  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.engine_used !== "heygen_avatar_shots") {
    return NextResponse.json(
      { error: "Only cinematic (Avatar Shots) jobs can be saved as a Look." },
      { status: 400 }
    );
  }

  // Prefer a single scene's clip (a clean reusable shot); fall back to the
  // job's final video.
  const { data: scenes } = await svc
    .from("job_scenes")
    .select("clip_url, duration_sec, metadata, scene_index")
    .eq("job_id", job_id)
    .order("scene_index", { ascending: true });

  const firstScene = (scenes ?? [])[0];
  const sourceUrl =
    (firstScene?.clip_url as string) ||
    (job.output_url_final as string) ||
    (job.video_url as string);

  if (!sourceUrl) {
    return NextResponse.json(
      { error: "No video found on this job yet." },
      { status: 400 }
    );
  }

  // Persist the clip to R2 (HeyGen URLs expire ~24h)
  let r2Url: string;
  try {
    const key = `looks/${user.id}/${job_id}-${Date.now()}.mp4`;
    r2Url = await downloadAndUploadToR2(sourceUrl, key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[looks] R2 save failed:", msg);
    return NextResponse.json({ error: `Could not save clip: ${msg}` }, { status: 500 });
  }

  const duration = Number(firstScene?.duration_sec ?? 0) || null;
  const lookName =
    name?.trim() ||
    (job.prompt as string | null)?.slice(0, 40) ||
    "Cinematic Look";

  const { data: look, error: insertErr } = await svc
    .from("cinematic_looks")
    .insert({
      user_id: user.id,
      name: lookName,
      video_url: r2Url,
      thumbnail_url: null,
      duration_sec: duration,
      source_job_id: job_id,
    })
    .select("id, name, video_url, thumbnail_url, duration_sec, created_at")
    .single();

  if (insertErr) {
    console.error("[looks] insert failed:", insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  console.log(`[looks] saved look ${look.id} for user=${user.id}`);
  return NextResponse.json({ success: true, look });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const svc = createServiceClient();
  await svc.from("cinematic_looks").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
