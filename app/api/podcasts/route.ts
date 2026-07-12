import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import {
  DEFAULT_SPEAKERS,
  TITLE_MAX,
  TOPIC_MAX,
  isAspectRatio,
  isHttpUrl,
  isLanguage,
  isLayout,
  isPodcastRenderMode,
  isPodcastStyle,
  isPodcastTargetDuration,
  isSourceMode,
} from "@/lib/podcast/podcast";
import { isPodcastLipsyncQualityMode } from "@/lib/podcast/lipsync-quality";

/**
 * GET /api/podcasts — list the authenticated user's podcasts (newest first).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20"), 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

    const { data, error, count } = await createServiceClient()
      .from("podcasts")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .neq("status", "archived") // hide archived podcasts from the library (T-1141)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("GET /api/podcasts DB error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ podcasts: data || [], total: count || 0, limit, offset });
  } catch (err) {
    console.error("GET /api/podcasts:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/podcasts — create a draft podcast + its two default speakers.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { source_mode, source_topic, source_asset_url, title, layout, aspect_ratio, language,
      podcast_style, target_duration_seconds, render_mode, lipsync_quality_mode } = body;

    if (!isSourceMode(source_mode)) {
      return NextResponse.json({ error: "source_mode must be 'generate' or 'upload'" }, { status: 400 });
    }
    if (source_topic !== undefined && source_topic !== null) {
      if (typeof source_topic !== "string" || source_topic.length > TOPIC_MAX) {
        return NextResponse.json({ error: `source_topic must be a string up to ${TOPIC_MAX} chars` }, { status: 400 });
      }
    }
    if (source_asset_url !== undefined && source_asset_url !== null && !isHttpUrl(source_asset_url)) {
      return NextResponse.json({ error: "source_asset_url must be a valid http/https URL" }, { status: 400 });
    }
    if (title !== undefined && title !== null) {
      if (typeof title !== "string" || title.length < 1 || title.length > TITLE_MAX) {
        return NextResponse.json({ error: `title must be 1..${TITLE_MAX} chars` }, { status: 400 });
      }
    }
    if (layout !== undefined && !isLayout(layout)) {
      return NextResponse.json({ error: "layout must be two_shot | split_screen | talk_show" }, { status: 400 });
    }
    if (aspect_ratio !== undefined && !isAspectRatio(aspect_ratio)) {
      return NextResponse.json({ error: "aspect_ratio must be 16:9 | 9:16" }, { status: 400 });
    }
    if (language !== undefined && !isLanguage(language)) {
      return NextResponse.json({ error: "language must match [a-z]{2}(-[A-Z]{2})?" }, { status: 400 });
    }
    // Studio settings persisted in metadata (T-1141) so a reopened draft restores them.
    const metadata: Record<string, unknown> = {};
    if (podcast_style !== undefined) {
      if (!isPodcastStyle(podcast_style)) {
        return NextResponse.json({ error: "podcast_style must be casual | news | expert | debate | documentary" }, { status: 400 });
      }
      metadata.podcast_style = podcast_style;
    }
    if (target_duration_seconds !== undefined) {
      if (!isPodcastTargetDuration(target_duration_seconds)) {
        return NextResponse.json({ error: "target_duration_seconds must be 30, 60, 120, 300 or 600" }, { status: 400 });
      }
      metadata.target_duration_seconds = target_duration_seconds;
    }
    if (render_mode !== undefined) {
      if (!isPodcastRenderMode(render_mode)) {
        return NextResponse.json({ error: "render_mode must be static | talking_visual | lipsync_premium" }, { status: 400 });
      }
      // lipsync_premium is live as of T-1144b Phase 1 (capped, cached, fallback-safe).
      // Actual spend is gated by POST /api/podcasts/[id]/lipsync, not here.
      metadata.render_mode = render_mode;
    }
    if (lipsync_quality_mode !== undefined) {
      if (!isPodcastLipsyncQualityMode(lipsync_quality_mode)) {
        return NextResponse.json({ error: "lipsync_quality_mode must be economy | balanced | premium | cinema" }, { status: 400 });
      }
      metadata.lipsync_quality_mode = lipsync_quality_mode;
    }

    const service = createServiceClient();
    const { data: podcast, error: insertErr } = await service
      .from("podcasts")
      .insert({
        user_id: user.id,
        title: typeof title === "string" && title.trim() ? title.trim() : "Untitled podcast",
        source_mode,
        source_topic: typeof source_topic === "string" ? source_topic.trim() : null,
        source_asset_url: source_asset_url || null,
        layout: isLayout(layout) ? layout : "two_shot",
        aspect_ratio: isAspectRatio(aspect_ratio) ? aspect_ratio : "16:9",
        language: isLanguage(language) ? language : "en-US",
        status: "draft",
        metadata,
      })
      .select()
      .single();

    if (insertErr || !podcast) {
      console.error("POST /api/podcasts insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create podcast" }, { status: 500 });
    }

    const { data: speakers, error: speakersErr } = await service
      .from("podcast_speakers")
      .insert(DEFAULT_SPEAKERS.map((s) => ({ ...s, podcast_id: podcast.id })))
      .select();

    if (speakersErr) {
      // Roll back the orphan podcast so we never leave a podcast with no cast.
      await service.from("podcasts").delete().eq("id", podcast.id);
      console.error("POST /api/podcasts speakers error:", speakersErr);
      return NextResponse.json({ error: "Failed to create podcast speakers" }, { status: 500 });
    }

    return NextResponse.json({ podcast, speakers: speakers || [] }, { status: 201 });
  } catch (err) {
    console.error("POST /api/podcasts:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
