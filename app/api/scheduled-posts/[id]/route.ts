import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * GET /api/scheduled-posts/[id]
 * Get a single scheduled post by ID.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: post, error } = await supabase
      .from("scheduled_posts")
      .select("*, jobs(prompt, output_url_final, video_url, engine_used, plan)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, post });
  } catch (e) {
    console.error("[scheduled-posts] GET [id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/scheduled-posts/[id]
 * Update a scheduled post (only if still "scheduled").
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check ownership + status
    const { data: existing, error: fetchErr } = await supabase
      .from("scheduled_posts")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 });
    }

    if (existing.status !== "scheduled") {
      return NextResponse.json(
        { error: `Cannot edit a post with status "${existing.status}"` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    // Allow updating these fields
    if (body.scheduled_at !== undefined) {
      const d = new Date(body.scheduled_at);
      if (isNaN(d.getTime()) || d.getTime() < Date.now() + 2 * 60_000) {
        return NextResponse.json(
          { error: "scheduled_at must be a valid date at least 2 minutes in the future" },
          { status: 400 }
        );
      }
      updates.scheduled_at = d.toISOString();
    }
    if (body.platforms !== undefined) {
      if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
        return NextResponse.json({ error: "At least one platform is required" }, { status: 400 });
      }
      updates.platforms = body.platforms;
    }
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.hashtags !== undefined) updates.hashtags = body.hashtags;
    if (body.caption_tiktok !== undefined) updates.caption_tiktok = body.caption_tiktok;
    if (body.caption_instagram !== undefined) updates.caption_instagram = body.caption_instagram;
    if (body.privacy_youtube !== undefined) updates.privacy_youtube = body.privacy_youtube;
    if (body.privacy_tiktok !== undefined) updates.privacy_tiktok = body.privacy_tiktok;
    if (body.thumbnail_url !== undefined) updates.thumbnail_url = body.thumbnail_url;
    if (body.timezone !== undefined) updates.timezone = body.timezone;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: post, error: updateErr } = await supabase
      .from("scheduled_posts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      console.error("[scheduled-posts] Update error:", updateErr);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true, post });
  } catch (e) {
    console.error("[scheduled-posts] PATCH error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/scheduled-posts/[id]
 * Cancel a scheduled post (soft-cancel: sets status to "cancelled").
 * Only works on "scheduled" or "failed" posts.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("scheduled_posts")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 });
    }

    if (existing.status !== "scheduled" && existing.status !== "failed") {
      return NextResponse.json(
        { error: `Cannot cancel a post with status "${existing.status}"` },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from("scheduled_posts")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (updateErr) {
      console.error("[scheduled-posts] Cancel error:", updateErr);
      return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Post cancelled" });
  } catch (e) {
    console.error("[scheduled-posts] DELETE error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
