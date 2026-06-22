import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { TOPIC_MAX } from "@/lib/podcast/podcast";
import { buildPodcastDialoguePrompt, parseAndValidateDialogue } from "@/lib/podcast/dialogue";
import { callLLMForPodcastDialogue } from "@/lib/podcast/dialogue-llm";

/**
 * POST /api/podcasts/[id]/script
 * Generate the host/guest dialogue via the LiteLLM gateway and store it as
 * podcast_segments. No TTS, no audio yet. 404 if not owned.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service
      .from("podcasts")
      .select("*")
      .eq("id", id)
      .single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!["draft", "failed", "ready"].includes(podcast.status)) {
      return NextResponse.json(
        { error: `Cannot generate a script while status is '${podcast.status}'` },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const topicRaw = typeof body.topic === "string" ? body.topic : podcast.source_topic;
    const topic = typeof topicRaw === "string" ? topicRaw.trim() : "";
    if (!topic || topic.length < 3 || topic.length > TOPIC_MAX) {
      return NextResponse.json(
        { error: "A topic (3..2000 chars) is required to generate the dialogue" },
        { status: 400 },
      );
    }

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("id, name, role")
      .eq("podcast_id", id);
    const host = speakers?.find((s) => s.role === "host");
    const guest = speakers?.find((s) => s.role === "guest");
    if (!host || !guest) {
      return NextResponse.json({ error: "Podcast is missing its speakers" }, { status: 500 });
    }

    // Mark in-progress (best effort).
    await service.from("podcasts").update({ status: "scripting", error_message: null }).eq("id", id);

    const failWith = async (message: string, code: number) => {
      await service.from("podcasts").update({ status: "failed", error_message: message }).eq("id", id);
      return NextResponse.json({ error: message, status: "failed" }, { status: code });
    };

    const prompt = buildPodcastDialoguePrompt({
      topic,
      language: podcast.language,
      hostName: host.name,
      guestName: guest.name,
    });

    const llm = await callLLMForPodcastDialogue(prompt);
    if (llm.error || !llm.content) {
      return failWith(llm.error || "The dialogue generator returned nothing.", 502);
    }

    const result = parseAndValidateDialogue(llm.content, { topic });
    if (!result.ok) {
      return failWith(result.error, 422);
    }

    const rows = result.segments.map((seg, i) => ({
      podcast_id: id,
      speaker_id: seg.speaker_role === "host" ? host.id : guest.id,
      order_index: i,
      text: seg.text,
      status: "pending" as const,
    }));

    // Invalidate the stale render BEFORE mutating any segments, so the DB can
    // never hold "new dialogue + old MP4". If this reset fails, the existing
    // dialogue AND video stay untouched and coherent.
    const { error: resetErr } = await service
      .from("podcasts")
      .update({
        status: "ready",
        error_message: null,
        video_url: null,
        render_status: "idle",
        render_error: null,
      })
      .eq("id", id);
    if (resetErr) {
      console.error(`[podcast/script] could not reset render state for ${id}:`, resetErr);
      return NextResponse.json(
        { error: "Failed to save the new dialogue state. Your previous script was kept." },
        { status: 500 },
      );
    }

    // Render is cleared — now it's safe to replace the dialogue. Snapshot first so
    // a failed insert can be rolled back (the already-cleared video is fine).
    const { data: previousSegments } = await service
      .from("podcast_segments")
      .select("*")
      .eq("podcast_id", id);

    await service.from("podcast_segments").delete().eq("podcast_id", id);

    const { data: inserted, error: insertErr } = await service
      .from("podcast_segments")
      .insert(rows)
      .select();
    if (insertErr) {
      // Restore the prior dialogue so regeneration is non-destructive on failure.
      if (previousSegments && previousSegments.length > 0) {
        await service.from("podcast_segments").insert(previousSegments);
      }
      return failWith("Failed to save the generated dialogue. Your previous script was kept.", 500);
    }

    return NextResponse.json({ status: "ready", segments: inserted || [] });
  } catch (err) {
    console.error("POST /api/podcasts/[id]/script:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
