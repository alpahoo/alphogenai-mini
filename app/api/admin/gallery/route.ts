/**
 * Admin Gallery Manager — list + create (T-1003).
 *
 *   GET  /api/admin/gallery?status=&category=  — list items (admin only)
 *   POST /api/admin/gallery                    — create an item (admin only)
 *
 * Admin-gated by requireAdmin() (isAdminEmail) and operated through the
 * service-role client (bypasses RLS). The public /gallery NEVER uses this route
 * and reads only published rows via lib/gallery-showcase.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import {
  normalizeGalleryWrite,
  GALLERY_STATUSES,
  GALLERY_DB_CATEGORIES,
} from "@/lib/gallery-admin";

const GALLERY_COLUMNS =
  "id, source_job_id, media_type, status, title, subtitle, public_prompt, category, media_url, thumbnail_url, poster_url, aspect_ratio, duration_seconds, display_model, sort_order, featured, created_by, created_at, updated_at, published_at";

// ── GET (admin only) — list with optional status/category filters ──────────
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  const supabase = createServiceClient();
  let query = supabase
    .from("gallery_items")
    .select(GALLERY_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (status && (GALLERY_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  if (category && (GALLERY_DB_CATEGORIES as readonly string[]).includes(category.toLowerCase())) {
    query = query.eq("category", category.toLowerCase());
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

// ── POST (admin only) — create a gallery item ──────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeGalleryWrite(body, "create");
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gallery_items")
    .insert({ ...normalized.values, created_by: auth.user.id })
    .select(GALLERY_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data }, { status: 201 });
}
