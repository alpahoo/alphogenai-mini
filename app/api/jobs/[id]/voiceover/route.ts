import { NextResponse } from "next/server";
import { triggerApplyResearchVoiceover } from "@/lib/modal-client";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { isHeyGenEngine } from "@/lib/heygen-client";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";

type JobRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  video_url: string | null;
  output_url_final: string | null;
  voiceover_url: string | null;
  voiceover_text: string | null;
  engine_used: string | null;
};

/**
 * T-1113 — Mux the Research Story voice-over into the final video.
 *
 * Story (Seedance/EvoLink) jobs only: this lays a TTS narration over the video.
 * It is NOT lip-sync — Avatar/Presenter (HeyGen) jobs have their own muxed
 * voice path (avatar_final.audio_url) and are rejected here.
 *
 * Like the overlay route, the voiced copy is written to output_url_final while
 * video_url stays raw, so a Modal failure never destroys the original.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, user_id, status, video_url, output_url_final, voiceover_url, voiceover_text, engine_used")
      .eq("id", id)
      .single<JobRow>();

    if (jobError || !job || job.user_id !== user.id) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "done") {
      return NextResponse.json({ error: "Voice-over can only be applied to completed jobs" }, { status: 400 });
    }
    // Avatar/Presenter jobs carry a lip-synced or cloned-voice track already;
    // they use the avatar_final voice path, not this Story voice-over.
    if (job.engine_used && isHeyGenEngine(job.engine_used)) {
      return NextResponse.json(
        { error: "Avatar videos already include their own voice track" },
        { status: 400 }
      );
    }

    const rawVideoUrl = job.video_url || job.output_url_final;
    if (!rawVideoUrl) {
      return NextResponse.json({ error: "Job has no video to add voice-over to" }, { status: 400 });
    }

    // Ensure a voiceover_url exists. Normally the GET poller generates it once
    // from voiceover_text; if it hasn't yet, generate it here on demand.
    let voiceoverUrl = job.voiceover_url;
    if (!voiceoverUrl) {
      const text =
        typeof job.voiceover_text === "string" && job.voiceover_text.trim().length > 2
          ? job.voiceover_text.trim()
          : "";
      if (!text) {
        return NextResponse.json({ error: "This job has no voice-over narration" }, { status: 400 });
      }
      if (!isTTSAvailable()) {
        return NextResponse.json({ error: "Voice-over synthesis is unavailable" }, { status: 503 });
      }
      try {
        const tts = await generateVoiceover({ text, format: "mp3" });
        voiceoverUrl = await uploadBufferToR2(
          Buffer.from(tts.audio),
          `audio/voiceover/${job.id}.mp3`,
          "audio/mpeg"
        );
        await supabase
          .from("jobs")
          .update({ voiceover_url: voiceoverUrl, updated_at: new Date().toISOString() })
          .eq("id", job.id);
      } catch (e) {
        console.warn("[jobs/voiceover] TTS generation failed", e);
        return NextResponse.json({ error: "Could not synthesize the voice-over" }, { status: 502 });
      }
    }

    try {
      const voicedUrl = await triggerApplyResearchVoiceover(job.id);
      const { error: updateError } = await supabase
        .from("jobs")
        .update({ output_url_final: voicedUrl, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        output_url_final: voicedUrl,
        raw_video_url: job.video_url,
      });
    } catch (error) {
      console.warn("[jobs/voiceover] mux failed; keeping original video", error);
      return NextResponse.json({
        success: false,
        fallback: true,
        video_url: rawVideoUrl,
        error: "Voice-over mux failed; original video kept",
      });
    }
  } catch (error) {
    console.error("[jobs/voiceover] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply voice-over" },
      { status: 500 }
    );
  }
}
