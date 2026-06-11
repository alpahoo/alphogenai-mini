import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeChangedetectionWebhook,
  topicFromWatchlistEvent,
} from "@/lib/research/watchlists";

function getSupabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.CHANGEDETECTION_WEBHOOK_SECRET;
  if (!expected) return false;
  const headerSecret = request.headers.get("x-webhook-secret") ?? "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return headerSecret === expected || bearer === expected;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalized = normalizeChangedetectionWebhook(await request.json());
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const event = normalized.value;
    const supabase = getSupabaseService();

    const { data: watchlist, error: watchlistError } = await supabase
      .from("research_watchlists")
      .select("id, user_id, name, topic, url, mode, status")
      .eq("id", event.watchlistId)
      .single();

    if (watchlistError || !watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    if (watchlist.status !== "active") {
      return NextResponse.json({ ignored: true, reason: "watchlist_paused" });
    }

    const { data: researchJob, error: jobError } = await supabase
      .from("research_jobs")
      .insert({
        user_id: watchlist.user_id,
        topic: topicFromWatchlistEvent(watchlist.topic, event.title),
        input_url: event.url,
        mode: watchlist.mode,
        language: "en-US",
        target_duration_seconds: 60,
        status: "draft",
      })
      .select("id, status")
      .single();

    if (jobError || !researchJob) {
      console.error("changedetection research job insert:", jobError);
      return NextResponse.json({ error: "Failed to create draft research job" }, { status: 500 });
    }

    const { data: watchlistEvent, error: eventError } = await supabase
      .from("research_watchlist_events")
      .insert({
        watchlist_id: watchlist.id,
        user_id: watchlist.user_id,
        research_job_id: researchJob.id,
        source_url: event.url,
        title: event.title,
        summary: event.summary,
        change_url: event.changeUrl,
        snapshot_url: event.snapshotUrl,
        detected_at: event.detectedAt,
        status: "draft_created",
      })
      .select("id")
      .single();

    if (eventError) {
      console.error("changedetection event insert:", eventError);
      return NextResponse.json({ error: "Failed to store watchlist event" }, { status: 500 });
    }

    await supabase
      .from("research_watchlists")
      .update({
        last_checked_at: event.detectedAt,
        last_changed_at: event.detectedAt,
      })
      .eq("id", watchlist.id);

    return NextResponse.json({
      ok: true,
      event_id: watchlistEvent?.id,
      research_job_id: researchJob.id,
      status: "draft_created",
    });
  } catch (err) {
    console.error("POST /api/webhooks/changedetection:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
