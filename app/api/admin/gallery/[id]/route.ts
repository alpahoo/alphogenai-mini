/**
 * Admin Gallery Manager — update + remove a single item (T-1003).
 *
 *   PATCH  /api/admin/gallery/[id]  — edit fields / publish / unpublish / hide
 *   DELETE /api/admin/gallery/[id]  — remove from gallery (does NOT delete the
 *                                     source job; source_job_id is ON DELETE SET
 *                                     NULL, but here we only delete the gallery row)
 *
 * Admin-gated + service-role. The set of writable fields is whitelisted in
 * lib/gallery-admin (id/created_by/timestamps can never be set from input;
 * display_model is provider-scrubbed; published_at is derived from status).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeGalleryWrite } from "@/lib/gallery-admin";

const GALLERY_COLUMNS =
  "id, source_job_id, media_type, status, title, subtitle, public_prompt, category, media_url, thumbnail_url, poster_url, aspect_ratio, duration_seconds, display_model, sort_order, featured, created_by, created_at, updated_at, published_at";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeGalleryWrite(body, "update");
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }
  if (Object.keys(normalized.values).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gallery_items")
    .update(normalized.values)
    .eq("id", id)
    .select(GALLERY_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Gallery item not found" }, { status: 404 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await params;

  const supabase = createServiceClient();
  // Remove ONLY the gallery row. The source job is never touched.
  const { data, error } = await supabase
    .from("gallery_items")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Gallery item not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
