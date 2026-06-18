import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateStoryboard, enrichStoryboardWithLLM } from "@/lib/storyboard";
import {
  isEvoLinkEngine,
  createEvoLinkTask,
  engineSupportsFirstFrame,
  enhanceScenePrompt,
  EVOLINK_ENGINES,
} from "@/lib/evolink-client";
import {
  isBailianEngine,
  createBailianTask,
  maybeRerouteToBailian,
  BAILIAN_ENGINES,
} from "@/lib/bailian-client";
import {
  isBytePlusEngine,
  createBytePlusTask,
  BYTEPLUS_ENGINES,
} from "@/lib/byteplus-client";
import {
  isAtlasEngine,
  createAtlasTask,
  ATLAS_ENGINES,
} from "@/lib/atlascloud-client";
import {
  isHeyGenEngine,
  isHeyGenShotsEngine,
  createAvatarVideo,
  createAvatarShotsVideo,
  createLipsync,
  generateSpeech,
  splitScriptIntoChunks,
} from "@/lib/heygen-client";
import { enhancePrompt } from "@/lib/prompt-enhancer";
import type { JobPlan, ReferencePayload } from "@/lib/types";
import { assertCanCreateJob } from "@/lib/jobs/guard";
import { buildVoiceoverScript, type VoiceoverScene } from "@/lib/voiceover/voiceover-script";

// LLM calls (enhancePrompt + enrichStoryboardWithLLM) can add 4-8 s on top of
// the normal Supabase + EvoLink/Modal round-trips. 60 s is safe on Vercel Pro.
export const maxDuration = 60;

// All valid engine keys (Modal + EvoLink + Bailian + HeyGen)
const VALID_ENGINES = [
  "wan_i2v",
  "ltx_2_3",
  "seedance",
  "heygen_avatar_iv",
  "heygen_avatar_shots",
  ...Object.keys(EVOLINK_ENGINES),
  ...Object.keys(BAILIAN_ENGINES),
  ...Object.keys(BYTEPLUS_ENGINES),
  ...Object.keys(ATLAS_ENGINES),
];

// Hard cap on multi-scene chaining length (defense in depth — storyboard
// is already capped per-plan). Even premium can't ask EvoLink for >6 chained
// scenes — beyond that, generation cost & wait time become unreasonable.
const MAX_CHAIN_LENGTH = 25;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// V1 Étape C — Reference validation imported from lib/validate-references.ts
// (pure function, extracted for testability)

/**
 * Strip "[SCENE N - LABEL]" markers and tighten whitespace before sending to
 * EvoLink. Markers leak into prompts when the LLM enricher prepends labels;
 * EvoLink's content-policy filter sometimes flags them as suspicious.
 */
function cleanEvoLinkPrompt(raw: string): string {
  return raw
    .replace(/\[SCENE\s*\d+[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const supabase = createServiceClient();
    const body = await req.json();
    const {
      prompt,
      target_duration_seconds,
      preferred_engine,
      image_url,
      research_job_id,
      references,
      multi_scene_chain,
      chain_strategy,
      num_scenes,
      byteplus_asset_ids,
      scenes: clientScenes,
      audio_mode,
      audio_prompt,
      voiceover_text,
      aspect_ratio,
      caption_mode,
      caption_style,
      // HeyGen Avatar params
      avatar_id,
      voice_id,
      scene_prompt,
      script_text,
      look_id,
      lipsync_mode,
      voice_mode,
    } = body as {
      prompt: string;
      target_duration_seconds?: unknown;
      preferred_engine?: string;
      image_url?: string;
      research_job_id?: unknown;
      references?: Record<string, unknown>;
      multi_scene_chain?: boolean;
      /** Scene chaining strategy: "continuity" (fluid, quality decays) | "anchor" (stable quality) */
      chain_strategy?: string;
      /** Explicit scene count ("auto" or omitted = duration-based auto split) */
      num_scenes?: unknown;
      /** Verified BytePlus real-human asset IDs (asset-...) for Seedance 2.0 r2v */
      byteplus_asset_ids?: unknown;
      /** Optional pre-edited scenes from the editor (Phase C). Skips server-side storyboard generation. */
      scenes?: Array<{ prompt: string; engine?: string; duration_sec: number }>;
      /** Audio generation mode: "none" | "auto" | "custom" */
      audio_mode?: string;
      /** Custom audio description (when audio_mode = "custom") */
      audio_prompt?: string;
      /** Voice-over narration text (TTS) */
      voiceover_text?: string;
      /** Video aspect ratio: "16:9" | "9:16" | "1:1" */
      aspect_ratio?: string;
      /** Caption mode: "none" | "auto" */
      caption_mode?: string;
      /** Caption style when caption_mode = "custom" */
      caption_style?: string;
      /** HeyGen Photo Avatar ID */
      avatar_id?: string;
      /** HeyGen voice ID (cloned or stock) */
      voice_id?: string;
      /** HeyGen Avatar Shots scene prompt (director's brief — cinematic mode) */
      scene_prompt?: string;
      /** HeyGen Avatar Shots dialogue script (for lip-sync — cinematic mode) */
      script_text?: string;
      /** Reuse a saved cinematic Look (lipsync-only — skips Seedance) */
      look_id?: string;
      /** Lip-sync quality: "speed" (cheaper, faster) or "precision" */
      lipsync_mode?: string;
      /** Story Video voice mode: "lipsync" (burned-in, mouth synced) | "voiceover" (muxed audio track) */
      voice_mode?: string;
    };

    // Default ON. Only set OFF if explicitly false (the user toggled it off
    // in Advanced settings, or the chosen engine doesn't support I2V).
    const chainOptIn = multi_scene_chain !== false;
    // Scene chaining strategy (only relevant when chaining is ON).
    const safeChainStrategy = chain_strategy === "anchor" ? "anchor" : "continuity";
    // Verified BytePlus real-human asset IDs (asset-...) for Seedance 2.0 r2v.
    const safeAssetIds = Array.isArray(byteplus_asset_ids)
      ? byteplus_asset_ids
          .filter((x): x is string => typeof x === "string" && /^asset-/.test(x.trim()))
          .map((s) => s.trim())
          .slice(0, 9)
      : [];

    // Validate image_url if provided
    const safeImageUrl =
      image_url && typeof image_url === "string" && image_url.startsWith("http")
        ? image_url
        : undefined;

    // Validate references payload
    const safeReferences = references && typeof references === "object"
      ? references
      : undefined;

    // Validate preferred_engine — plan gate applied after plan is resolved below
    const safePreferredEngine =
      preferred_engine && VALID_ENGINES.includes(preferred_engine)
        ? preferred_engine
        : undefined;

    // --- create-job gate (shared, single source of truth) -----------------
    // Prompt validation → content policy → references ownership → plan
    // resolution → active-generation limit → daily quota → engine plan gate.
    // Extracted to lib/jobs/guard.ts so a future /api/mcp/* route reuses the
    // exact same enforcement (see docs/product/alphogen-mcp-auth-design.md §5).
    const gate = await assertCanCreateJob(supabase, {
      userId: user?.id,
      prompt,
      scriptText: script_text,
      references: safeReferences as ReferencePayload | undefined,
      preferredEngine: safePreferredEngine,
      avatarId: avatar_id,
      lookId: look_id,
      voiceId: voice_id,
    });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }
    const plan: JobPlan = gate.plan;

    let researchMetadata: Record<string, unknown> | undefined;
    // T-1112: voice-over narration derived from the linked Research plan.
    let researchVoiceoverText: string | null = null;
    if (research_job_id !== undefined) {
      const safeResearchJobId =
        typeof research_job_id === "string" && UUID_RE.test(research_job_id.trim())
          ? research_job_id.trim()
          : null;
      if (!safeResearchJobId) {
        return NextResponse.json({ error: "Invalid research job id" }, { status: 400 });
      }
      const { data: researchJob, error: researchError } = await supabase
        .from("research_jobs")
        .select("id")
        .eq("id", safeResearchJobId)
        .eq("user_id", user?.id)
        .single();
      if (researchError || !researchJob) {
        return NextResponse.json({ error: "Research job not found" }, { status: 404 });
      }
      researchMetadata = { research_job_id: safeResearchJobId };

      // T-1112: derive the spoken voice-over from the Research narration so a
      // Research-backed job gets a voice-over without manual entry. Canonical
      // source = per-scene voiceover_line (aligned with overlay captions),
      // fallback = full script prose. Best-effort and non-fatal: any failure
      // just leaves voiceover_text unset. An explicit caller-provided
      // voiceover_text always wins (handled at insert time below).
      try {
        const { data: sb } = await supabase
          .from("research_storyboards")
          .select("scenes_json, script_id")
          .eq("research_job_id", safeResearchJobId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ scenes_json: unknown; script_id: string | null }>();

        let scriptText: string | null = null;
        if (sb?.script_id) {
          const { data: scriptRow } = await supabase
            .from("research_scripts")
            .select("script")
            .eq("id", sb.script_id)
            .maybeSingle<{ script: string | null }>();
          scriptText = scriptRow?.script ?? null;
        }

        const built = buildVoiceoverScript({
          scenes: Array.isArray(sb?.scenes_json)
            ? (sb!.scenes_json as VoiceoverScene[])
            : [],
          script: scriptText,
        });
        if (built.text) {
          researchVoiceoverText = built.text;
        }
      } catch (e) {
        console.warn(
          `[jobs] Research voice-over derivation failed (non-fatal):`,
          e instanceof Error ? e.message : e
        );
      }
    }

    const rawDuration = Number(target_duration_seconds);
    const safeDuration =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : plan === "pro" ? 15 : 5;

    // ── HeyGen avatar jobs are ALWAYS single-scene ─────────────────────
    // The avatar engine generates one complete video; never split into a
    // multi-scene storyboard (which would leave scenes 2..N to fail in the
    // normal pipeline). Skip prompt enhancement too — the script is verbatim.
    const isAvatarJob =
      Boolean(safePreferredEngine) && isHeyGenEngine(safePreferredEngine!);

    // ── Reuse a saved Look (lipsync-only — skips Seedance) ───────────────
    if (isAvatarJob && look_id) {
      if (!script_text?.trim() || !voice_id) {
        return NextResponse.json(
          { error: "A script and a voice are required to reuse a Look." },
          { status: 400 }
        );
      }

      const { data: look } = await supabase
        .from("cinematic_looks")
        .select("id, user_id, video_url, name")
        .eq("id", look_id)
        .single();
      if (!look || look.user_id !== user?.id) {
        return NextResponse.json({ error: "Look not found" }, { status: 404 });
      }

      const { data: job, error: insertError } = await supabase
        .from("jobs")
        .insert({
          prompt: script_text.trim(),
          plan,
          status: "pending",
          current_stage: "queued",
          target_duration_seconds: 0,
          storyboard: [
            { scene_index: 0, prompt: script_text.trim().slice(0, 2000), engine: safePreferredEngine, duration_sec: 0 },
          ],
          multi_scene_chain: false,
          ...(user?.id ? { user_id: user.id } : {}),
          audio_mode: "none",
          aspect_ratio: "16:9",
          caption_mode: "none",
        })
        .select()
        .single();

      if (insertError || !job) {
        return NextResponse.json(
          { error: insertError?.message ?? "Failed to create job" },
          { status: 500 }
        );
      }

      await supabase.from("job_scenes").insert({
        job_id: job.id,
        scene_index: 0,
        prompt: script_text.trim().slice(0, 2000),
        engine: safePreferredEngine,
        duration_sec: 0,
        status: "pending" as const,
        metadata: {},
      });

      try {
        // TTS the exact words, then lipsync onto the saved Look clip. Clip the
        // look video to the speech length (end_time) so the durations match —
        // the look has a fixed length but the new script varies.
        const speech = await generateSpeech(script_text.trim(), voice_id);
        if (!speech?.audioUrl) throw new Error("TTS produced no audio");
        const lipsyncId = await createLipsync(
          look.video_url,
          speech.audioUrl,
          lipsync_mode === "precision" ? "precision" : "speed",
          speech.durationSeconds ?? undefined
        );

        await supabase
          .from("job_scenes")
          .update({
            status: "generating",
            external_task_id: lipsyncId,
            metadata: { stage: "lipsync", lipsync_id: lipsyncId, cinematic_url: look.video_url },
          })
          .eq("job_id", job.id)
          .eq("scene_index", 0);

        await supabase
          .from("jobs")
          .update({
            status: "in_progress",
            current_stage: "muxing_audio",
            engine_used: safePreferredEngine,
            multi_scene_chain: false,
          })
          .eq("id", job.id);

        console.log(`[jobs] Look reuse: job=${job.id} look=${look_id} lipsync=${lipsyncId}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[jobs] Look reuse failed:`, errMsg);
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: `Lipsync error: ${errMsg}` })
          .eq("id", job.id);
        await supabase
          .from("job_scenes")
          .update({ status: "failed", error_message: errMsg.slice(0, 400) })
          .eq("job_id", job.id)
          .eq("scene_index", 0);
      }

      return NextResponse.json({ success: true, jobId: job.id, job });
    }

    if (isAvatarJob) {
      const isCinematic = isHeyGenShotsEngine(safePreferredEngine!);
      const safeAvatarAspect =
        aspect_ratio && ["16:9", "9:16", "1:1"].includes(aspect_ratio)
          ? aspect_ratio
          : "16:9";

      // ── Build the list of shots to generate ──────────────────────────
      // Presenter → 1 Avatar IV scene.
      // Cinematic + dialogue + voice → LIPSYNC flow (the Graal): each chunk is
      //   a Seedance cinematic shot; the poller then TTS+lip-syncs the exact
      //   words in the cloned voice onto it.
      // Cinematic + dialogue, no voice → native (dialogue embedded in prompt).
      // Cinematic, no dialogue → single vibe shot.
      interface Shot {
        sceneText: string;   // dialogue (native-embed fallback only); "" otherwise
        duration: number;    // 4–15s
        audioUrl?: string;   // cloned-voice TTS chunk → native lip-sync reference
      }
      let shots: Shot[] = [];
      const cinematicDialogue = (script_text?.trim() || "");
      const useLipsync = isCinematic && Boolean(cinematicDialogue) && Boolean(voice_id);

      const wordsToDur = (t: string) => {
        const w = t.split(/\s+/).filter(Boolean).length;
        return Math.max(4, Math.min(15, Math.ceil(w / 2.3) + 1));
      };

      // Native lip-sync flow: split the dialogue into chunks (<=~14s of speech
      // each), TTS each chunk in the cloned voice, and generate ONE cinematic
      // shot per chunk WITH that audio as a reference. HeyGen lip-syncs the
      // exact words natively during generation — no post-hoc lipsync (which
      // sounded like a voice-over laid over the clip).
      const finalAudioUrl: string | undefined = undefined; // legacy post-lipsync flow disabled
      const finalAudioDur: number | undefined = undefined;

      if (!isCinematic) {
        shots = [{ sceneText: prompt.trim(), duration: 5 }];
      } else if (useLipsync) {
        const chunks = splitScriptIntoChunks(cinematicDialogue);
        for (const chunk of (chunks.length ? chunks : [cinematicDialogue])) {
          const speech = await generateSpeech(chunk, voice_id!);
          if (speech?.audioUrl) {
            const dur = Math.max(4, Math.min(15, Math.round(speech.durationSeconds ?? wordsToDur(chunk))));
            shots.push({ sceneText: "", duration: dur, audioUrl: speech.audioUrl });
          } else {
            // TTS failed for this chunk → embed the dialogue so the model speaks it
            shots.push({ sceneText: chunk, duration: wordsToDur(chunk) });
          }
        }
      } else if (cinematicDialogue) {
        // No voice → native (dialogue embedded in prompt)
        for (const t of splitScriptIntoChunks(cinematicDialogue)) {
          shots.push({ sceneText: t, duration: wordsToDur(t) });
        }
      }
      if (shots.length === 0) {
        shots = [{ sceneText: "", duration: Math.max(4, Math.min(15, safeDuration)) }];
      }

      // True when we'll do the concat → single final lipsync flow.
      const isFinalLipsync = useLipsync && Boolean(finalAudioUrl);

      // Enrich the cinematic shot direction (short brief → rich cinematic
      // description) so shots look like a pro production, not a plain talking
      // head. Non-blocking — falls back to the original on any LLM error.
      let sceneBrief = (scene_prompt || prompt).trim();
      if (isCinematic) {
        sceneBrief = await enhanceScenePrompt(sceneBrief);
        console.log(`[jobs] enriched cinematic prompt: "${sceneBrief.slice(0, 120)}"`);
      }

      // ── Insert job + scene rows ──────────────────────────────────────
      const storyboard = shots.map((s, i) => ({
        scene_index: i,
        prompt: (isCinematic ? sceneBrief : prompt.trim()).slice(0, 2000),
        engine: safePreferredEngine as import("@/lib/types").EngineKey,
        duration_sec: s.duration,
      }));

      const { data: job, error: insertError } = await supabase
        .from("jobs")
        .insert({
          prompt: prompt.trim(),
          plan,
          status: "pending",
          current_stage: "queued",
          target_duration_seconds: shots.reduce((a, s) => a + s.duration, 0),
          storyboard,
          multi_scene_chain: false,
          ...(safeImageUrl ? { image_url: safeImageUrl } : {}),
          ...(user?.id ? { user_id: user.id } : {}),
          audio_mode: "none",
          aspect_ratio: safeAvatarAspect,
          caption_mode: "none",
          ...(isFinalLipsync
            ? {
                avatar_final: {
                  audio_url: finalAudioUrl,
                  audio_dur: finalAudioDur,
                  stage: "shots",
                  lipsync_mode: lipsync_mode === "precision" ? "precision" : "speed",
                  avatar_id: avatar_id,
                  scene_prompt: sceneBrief.slice(0, 1500),
                  aspect_ratio: safeAvatarAspect,
                },
              }
            : {}),
        })
        .select()
        .single();

      if (insertError || !job) {
        console.error("Failed to create avatar job:", insertError);
        return NextResponse.json(
          { error: insertError?.message ?? "Failed to create job" },
          { status: 500 }
        );
      }

      await supabase.from("job_scenes").insert(
        shots.map((s, i) => ({
          job_id: job.id,
          scene_index: i,
          prompt: (isCinematic ? sceneBrief : prompt.trim()).slice(0, 2000),
          engine: safePreferredEngine,
          duration_sec: s.duration,
          status: "pending" as const,
          // Final-lipsync flow: shots are visual-only ("video_only") — they're
          // concatenated then lip-synced together at the end.
          metadata: isFinalLipsync ? { stage: "video_only" } : {},
        }))
      );

      // ── Fire all shots in parallel (reliable + faster) ───────────────
      // Reference-injection (sequential shot 0 → ref) caused loops/failures,
      // so we fire all shots upfront. Consistency is handled via the shared
      // enriched prompt; a more robust consistency method is a future task.
      let anyFired = false;
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        try {
          let taskId: string;
          if (isCinematic) {
            // Native lip-sync: when the shot carries a cloned-voice audio chunk,
            // pass it as an audio reference so HeyGen makes the avatar SPEAK the
            // exact words during generation (no post-hoc lipsync). Otherwise,
            // embed the dialogue text so the model speaks it.
            const task = await createAvatarShotsVideo({
              avatarId: avatar_id!,
              scenePrompt: sceneBrief,
              scriptText: s.audioUrl ? undefined : (s.sceneText || undefined),
              durationSeconds: s.duration,
              resolution: "1080p",
              aspectRatio: safeAvatarAspect === "9:16" ? "9:16" : "16:9",
              ...(s.audioUrl ? { audioReferenceUrl: s.audioUrl } : {}),
              // Story Video "Reference image" → HeyGen reference for outfit /
              // decor consistency across shots (identity comes from the avatar).
              ...(safeImageUrl ? { referenceImageUrl: safeImageUrl } : {}),
            });
            taskId = task.taskId;
          } else {
            const task = await createAvatarVideo({
              avatarId: avatar_id!,
              scriptText: prompt.trim(),
              voiceId: voice_id!,
              aspectRatio: safeAvatarAspect === "9:16" ? "9:16" : "16:9",
              resolution: "1080p",
            });
            taskId = task.taskId;
          }

          await supabase
            .from("job_scenes")
            .update({ status: "generating", external_task_id: taskId })
            .eq("job_id", job.id)
            .eq("scene_index", i);
          anyFired = true;
          console.log(
            `[jobs] HeyGen ${isCinematic ? "avatar-shots" : "avatar-iv"} ` +
            `job=${job.id} scene=${i} task=${taskId}`
          );
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[jobs] HeyGen shot ${i} failed:`, errMsg);
          await supabase
            .from("job_scenes")
            .update({ status: "failed", error_message: errMsg.slice(0, 400) })
            .eq("job_id", job.id)
            .eq("scene_index", i);
        }
      }

      if (anyFired) {
        await supabase
          .from("jobs")
          .update({
            status: "in_progress",
            current_stage: "generating_scene_1",
            engine_used: safePreferredEngine,
            multi_scene_chain: false,
          })
          .eq("id", job.id);
      } else {
        await supabase
          .from("jobs")
          .update({
            status: "failed",
            current_stage: "failed",
            error_message: "All avatar shots failed to start. Please retry.",
          })
          .eq("id", job.id);
      }

      console.log(
        `[jobs] HeyGen avatar job=${job.id} mode=${isCinematic ? "cinematic" : "presenter"} ` +
        `shots=${shots.length} fired=${anyFired}`
      );

      return NextResponse.json({ success: true, jobId: job.id, job });
    }

    // ── Enhance prompt via EvoLink LLM (transparent, non-blocking) ─────
    // Falls back silently to original if EvoLink is unavailable.
    const enhancedPrompt = await enhancePrompt(prompt.trim());

    // ── Storyboard: use client-provided scenes (editor) or generate ─────
    let storyboard;
    if (clientScenes && Array.isArray(clientScenes) && clientScenes.length > 0) {
      // Phase C: editor-provided scenes — skip server-side generation
      // Validate & sanitize: cap to plan scene limit, enforce min/max duration
      const { MAX_SCENES } = await import("@/lib/storyboard");
      const maxScenes = MAX_SCENES[plan] ?? 1;
      const capped = clientScenes.slice(0, maxScenes);
      storyboard = capped.map((s, i) => ({
        scene_index: i,
        prompt: (s.prompt || enhancedPrompt).slice(0, 2000),
        engine: (s.engine || safePreferredEngine || "wan_i2v") as import("@/lib/types").EngineKey,
        duration_sec: Math.max(3, Math.min(10, s.duration_sec ?? 5)),
      }));
    } else {
      // Default: server-generated storyboard.
      // Engine clip ceiling lets a short video stay a single long shot (e.g.
      // Seedance supports up to 15s) instead of being split into repeated cuts.
      const engineMaxClip =
        (safePreferredEngine && EVOLINK_ENGINES[safePreferredEngine]?.maxDuration) ||
        undefined;
      // Explicit scene count from the UI "Scenes" control (numeric => forced).
      const rawNumScenes = Number(num_scenes);
      const forcedScenes =
        Number.isFinite(rawNumScenes) && rawNumScenes >= 1
          ? Math.round(rawNumScenes)
          : undefined;
      const storyboardBase = generateStoryboard(enhancedPrompt, safeDuration, plan, {
        maxClipDuration: engineMaxClip,
        forcedScenes,
      });
      // For multi-scene jobs: enrich each scene with distinct LLM-crafted prompts
      storyboard = await enrichStoryboardWithLLM(storyboardBase, enhancedPrompt);
    }

    const targetDuration = storyboard.reduce((s, sc) => s + sc.duration_sec, 0);

    // ── "Use my voice" (Story Video) ───────────────────────────────────
    // When a cloned HeyGen voice + dialogue is provided, generate the TTS now
    // and stash a voice-post config in `avatar_final`. After the video is
    // generated + concatenated, the poller applies it:
    //   - "lipsync"  → HeyGen lipsync over the final video (mouth synced, burned in)
    //   - "voiceover" → Modal muxes the voice track into the final video
    let voiceFinal: Record<string, unknown> | undefined;
    const voiceScript = (script_text?.trim() || "");
    const wantsVoice = Boolean(voice_id) && voiceScript.length > 1;
    if (wantsVoice) {
      const mode = voice_mode === "voiceover" ? "voiceover" : "lipsync";
      const safeLipsyncMode = lipsync_mode === "precision" ? "precision" : "speed";
      try {
        const speech = await generateSpeech(voiceScript, voice_id!);
        if (speech?.audioUrl) {
          voiceFinal = {
            stage: "awaiting_video",
            voice_mode: mode,
            lipsync_mode: safeLipsyncMode,
            audio_url: speech.audioUrl,
            audio_dur: speech.durationSeconds ?? null,
            voice_id,
            script_text: voiceScript.slice(0, 2000),
          };
          console.log(`[jobs] Story voice: mode=${mode} dur=${speech.durationSeconds}s job(pending)`);
        } else {
          console.warn(`[jobs] Story voice: TTS returned no audio — skipping voice step`);
        }
      } catch (e) {
        console.warn(`[jobs] Story voice TTS failed (non-fatal):`, e instanceof Error ? e.message : e);
      }
    }

    // Insert job as "pending"
    // prompt = original (displayed to user), storyboard entries use enhancedPrompt
    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert({
        prompt: prompt.trim(),
        plan,
        status: "pending",
        current_stage: "queued",
        target_duration_seconds: Math.round(targetDuration),
        storyboard,
        multi_scene_chain: chainOptIn,
        chain_strategy: safeChainStrategy,
        // Persist the chosen engine up front so a job that fails at creation
        // still records the intent (retry needs it; engine_used is otherwise
        // only set after the first scene fires).
        ...(safePreferredEngine ? { engine_used: safePreferredEngine } : {}),
        ...(safeAssetIds.length ? { byteplus_asset_ids: safeAssetIds } : {}),
        ...(voiceFinal ? { avatar_final: voiceFinal } : {}),
        ...(researchMetadata ? { metadata: researchMetadata } : {}),
        ...(safeImageUrl ? { image_url: safeImageUrl } : {}),
        ...(safeReferences ? { references_payload: safeReferences } : {}),
        ...(user?.id ? { user_id: user.id } : {}),
        // Audio settings — voice jobs force "none" so the concat step doesn't
        // add background music that would compete with the cloned voice.
        ...(voiceFinal
          ? { audio_mode: "none" }
          : audio_mode && ["none", "auto", "custom"].includes(audio_mode)
          ? { audio_mode }
          : { audio_mode: "auto" }),
        ...(audio_prompt && typeof audio_prompt === "string"
          ? { audio_prompt: audio_prompt.slice(0, 500) }
          : {}),
        // Explicit caller voiceover_text wins; otherwise fall back to the
        // Research-derived narration (T-1112). Both capped to 2000 chars.
        ...(() => {
          const explicit =
            voiceover_text && typeof voiceover_text === "string"
              ? voiceover_text.trim()
              : "";
          const chosen = explicit || researchVoiceoverText || "";
          return chosen ? { voiceover_text: chosen.slice(0, 2000) } : {};
        })(),
        // Format & captions
        ...(aspect_ratio && ["16:9", "9:16", "1:1"].includes(aspect_ratio)
          ? { aspect_ratio }
          : { aspect_ratio: "16:9" }),
        ...(caption_mode && ["none", "auto", "custom"].includes(caption_mode)
          ? { caption_mode }
          : { caption_mode: "none" }),
        ...(caption_style && typeof caption_style === "string"
          ? { caption_style: caption_style.slice(0, 100) }
          : {}),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create job:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Insert scenes
    const sceneRows = storyboard.map((sc) => ({
      job_id: job.id,
      scene_index: sc.scene_index,
      prompt: sc.prompt,
      engine: sc.engine,
      duration_sec: sc.duration_sec,
      status: "pending" as const,
    }));
    await supabase.from("job_scenes").insert(sceneRows);

    // ── Route: Bailian vs EvoLink vs Modal (GPU) ──────────────────────────
    // (HeyGen avatar jobs are handled earlier and return before this point.)
    // Feature flag: transparently reroute a % of EvoLink traffic to Bailian
    const rawEngineKey = safePreferredEngine ?? "wan_i2v";
    const engineKey = maybeRerouteToBailian(rawEngineKey);

    if (isBailianEngine(engineKey)) {
      // ── Bailian path (Alibaba Cloud DashScope) ────────────────────────
      // Same pattern as EvoLink: fire scene 0, poller advances chain.
      const scene0Raw = storyboard[0]?.prompt || enhancedPrompt || prompt.trim();
      const scene0Duration = Math.round(storyboard[0]?.duration_sec ?? safeDuration);

      try {
        const taskId = await createBailianTask({
          engineKey,
          prompt: scene0Raw,
          duration: scene0Duration,
          imageUrl: safeImageUrl,
        });
        console.log(
          `[jobs] Bailian scene 0: job=${job.id} engine=${engineKey} ` +
          `task=${taskId} prompt="${scene0Raw.slice(0, 80)}..."`,
        );

        await supabase
          .from("job_scenes")
          .update({ status: "generating", external_task_id: taskId })
          .eq("job_id", job.id)
          .eq("scene_index", 0);

        await supabase
          .from("jobs")
          .update({
            status: "in_progress",
            current_stage: "generating_scene_1",
            engine_used: engineKey,
            external_task_id: taskId,
            multi_scene_chain: false, // V1: single-scene only for Bailian
          })
          .eq("id", job.id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[jobs] Bailian scene 0 create failed:`, errMsg);
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: `Bailian error: ${errMsg}` })
          .eq("id", job.id);
        await supabase
          .from("job_scenes")
          .update({ status: "failed", error_message: errMsg.slice(0, 400) })
          .eq("job_id", job.id)
          .eq("scene_index", 0);
      }

      return NextResponse.json({ success: true, jobId: job.id, job });
    }

    if (isEvoLinkEngine(engineKey) || isBytePlusEngine(engineKey) || isAtlasEngine(engineKey)) {
      // ── EvoLink / BytePlus / Atlas path (same multi-scene state machine) ─
      // EvoLink generates ONE video per task. For multi-scene jobs we fire
      // ONLY scene 0 here; the GET poller advances the chain (scene N done
      // → extract last frame → fire scene N+1 with first_frame=that frame).
      //
      // Chaining is enabled when ALL of:
      //   - storyboard has ≥2 scenes
      //   - user didn't opt out (chainOptIn)
      //   - selected EvoLink engine supports image-to-video (i.e. has
      //     imageModel — Sora 2 is the notable exception)
      //   - storyboard length ≤ MAX_CHAIN_LENGTH (defense in depth)
      //
      // When chaining is OFF (Sora 2 or user-disabled), the GET poller
      // still fires scenes sequentially but without first_frame_url, so
      // continuity is lost but each scene still renders.
      const sceneCount = storyboard.length;
      const chainable =
        sceneCount > 1 &&
        sceneCount <= MAX_CHAIN_LENGTH &&
        chainOptIn &&
        engineSupportsFirstFrame(engineKey);

      // Scene 0 prompt — clean for EvoLink content-policy filter
      const scene0Raw = storyboard[0]?.prompt || enhancedPrompt || prompt.trim();
      const scene0Prompt = cleanEvoLinkPrompt(scene0Raw);

      // Scene 0 first_frame: user-provided reference image (Character Face,
      // etc.) when present.  Subsequent scenes will receive the last frame
      // of the previous scene as first_frame (set by the GET poller).
      const scene0FirstFrame = safeImageUrl;
      const scene0Duration = Math.round(storyboard[0]?.duration_sec ?? safeDuration);

      try {
        // Resolve safe aspect ratio for EvoLink
        const safeAspectRatio =
          aspect_ratio && ["16:9", "9:16", "1:1"].includes(aspect_ratio)
            ? aspect_ratio
            : "16:9";

        const taskId = isBytePlusEngine(engineKey)
          ? await createBytePlusTask({
              engineKey,
              prompt: scene0Prompt,
              duration: scene0Duration,
              imageUrl: scene0FirstFrame,
              aspectRatio: safeAspectRatio,
              references: safeReferences as Parameters<typeof createBytePlusTask>[0]["references"],
              assetIds: safeAssetIds,
            })
          : isAtlasEngine(engineKey)
          ? await createAtlasTask({
              engineKey,
              prompt: scene0Prompt,
              duration: scene0Duration,
              imageUrl: scene0FirstFrame,
              aspectRatio: safeAspectRatio,
              references: safeReferences as Parameters<typeof createAtlasTask>[0]["references"],
            })
          : await createEvoLinkTask({
              engineKey,
              prompt: scene0Prompt,
              duration: scene0Duration,
              imageUrl: scene0FirstFrame,
              aspectRatio: safeAspectRatio,
              // V1 Multi-Reference: forward image refs to EvoLink. The same
              // payload is also persisted on `jobs.references_payload`, so the
              // GET poller (`fireNextScene`) can re-use it for scenes 1..N —
              // character continuity persists across the whole multi-scene render.
              references: safeReferences as Parameters<typeof createEvoLinkTask>[0]["references"],
            });
        console.log(
          `[jobs] EvoLink scene 0: job=${job.id} engine=${engineKey} ` +
          `chain=${chainable ? "ON" : "OFF"} scenes=${sceneCount} ` +
          `task=${taskId} prompt="${scene0Prompt.slice(0, 80)}..."`
        );

        // Per-scene tracking: scene 0 is now generating
        await supabase
          .from("job_scenes")
          .update({
            status: "generating",
            external_task_id: taskId,
          })
          .eq("job_id", job.id)
          .eq("scene_index", 0);

        // Job-level: keep external_task_id pointing at the *active* scene's
        // EvoLink task for legacy single-scene polling code paths and quick
        // log inspection. The GET poller updates this each time it advances
        // the chain.
        await supabase
          .from("jobs")
          .update({
            status: "in_progress",
            current_stage: "generating_scene_1",
            engine_used: engineKey,
            external_task_id: taskId,
            // Persist chain decision for the poller (already on jobs row,
            // but make sure it's set to the EFFECTIVE value, not just the
            // user request — Sora 2 forces OFF here regardless of toggle).
            multi_scene_chain: chainable,
          })
          .eq("id", job.id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[jobs] EvoLink scene 0 create failed:`, errMsg);
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: `EvoLink error: ${errMsg}` })
          .eq("id", job.id);
        await supabase
          .from("job_scenes")
          .update({ status: "failed", error_message: errMsg.slice(0, 400) })
          .eq("job_id", job.id)
          .eq("scene_index", 0);
      }

      return NextResponse.json({ success: true, jobId: job.id, job });
    }

    // ── Modal path: GPU models (wan_i2v, seedance legacy) ─────────────
    const modalUrl = process.env.MODAL_WEBHOOK_URL;
    if (!modalUrl) {
      await supabase
        .from("jobs")
        .update({ status: "failed", error_message: "Pipeline not configured" })
        .eq("id", job.id);
      return NextResponse.json({ success: true, jobId: job.id, job });
    }

    const baseUrl = modalUrl.replace(/\/+$/, "");
    const webhookEndpoint = baseUrl.endsWith("/webhook")
      ? baseUrl
      : `${baseUrl}/webhook`;

    try {
      const modalRes = await fetch(webhookEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
        },
        body: JSON.stringify({
          job_id: job.id,
          prompt: enhancedPrompt,   // enriched cinematically
          plan,
          user_id: user?.id ?? null,
          scene_count: storyboard.length,
          ...(safeImageUrl && { image_url: safeImageUrl }),
          ...(safeReferences && { references: safeReferences }),
          // Pass Modal-local engines (wan_i2v, ltx_2_3) as the preferred engine
          // so generate_video_complete routes to the right adapter.
          preferred_engine:
            engineKey === "wan_i2v" || engineKey === "ltx_2_3" ? engineKey : undefined,
        }),
      });

      if (!modalRes.ok) {
        const detail = await modalRes.text().catch(() => "no body");
        console.error(`Modal ${modalRes.status}:`, detail);
        await supabase
          .from("jobs")
          .update({
            status: "failed",
            error_message: `Modal error ${modalRes.status}: ${detail.slice(0, 200)}`,
          })
          .eq("id", job.id);
      } else {
        await supabase
          .from("jobs")
          .update({ status: "in_progress", current_stage: "spawning_pipeline" })
          .eq("id", job.id)
          .eq("status", "pending");
      }
    } catch (fetchError) {
      const errMsg =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`Modal unreachable:`, errMsg);
      await supabase
        .from("jobs")
        .update({ status: "failed", error_message: `Cannot reach pipeline: ${errMsg}` })
        .eq("id", job.id);
    }

    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (error: unknown) {
    console.error("POST /api/jobs error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
