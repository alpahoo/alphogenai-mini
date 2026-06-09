/**
 * Admin Gallery Manager — seed a DRAFT gallery item from a finished job (T-1003).
 *
 *   POST /api/admin/gallery/from-job  { job_id }
 *
 * Creates a privacy-safe DRAFT (status='draft', public_prompt=null — the raw
 * private prompt is NEVER copied). The admin then edits the public copy and
 * publishes explicitly via PATCH. Admin-gated + service-role.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { galleryDraftFromJob } from "@/lib/gallery-admin";

const GALLERY_COLUMNS =
  "id, source_job_id, media_type, status, title, subtitle, public_prompt, category, media_url, thumbnail_url, poster_url, aspect_ratio, duration_seconds, display_model, sort_order, featured, created_by, created_at, updated_at, published_at";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  let body: { job_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";
  if (!jobId) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, output_url_final, video_url, engine_used, aspect_ratio, target_duration_seconds, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const draft = galleryDraftFromJob(job);
  if (!draft.ok) {
    return NextResponse.json({ error: draft.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("gallery_items")
    .insert({ ...draft.values, created_by: auth.user.id })
    .select(GALLERY_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data }, { status: 201 });
}
