import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateStoryboard, enrichStoryboardWithLLM } from "@/lib/storyboard";
import {
  isEvoLinkEngine,
  createEvoLinkTask,
  engineSupportsFirstFrame,
  EVOLINK_ENGINES,
} from "@/lib/evolink-client";
import {
  isBailianEngine,
  createBailianTask,
  maybeRerouteToBailian,
  BAILIAN_ENGINES,
} from "@/lib/bailian-client";
import {
  isHeyGenEngine,
  createAvatarVideo,
} from "@/lib/heygen-client";
import { enhancePrompt } from "@/lib/prompt-enhancer";
import type { JobPlan, ReferencePayload } from "@/lib/types";
import { PLAN_DAILY_QUOTA } from "@/lib/types";
import { validateReferences } from "@/lib/validate-references";

// LLM calls (enhancePrompt + enrichStoryboardWithLLM) can add 4-8 s on top of
// the normal Supabase + EvoLink/Modal round-trips. 60 s is safe on Vercel Pro.
export const maxDuration = 60;

const MAX_ACTIVE_JOBS = 1; // max concurrent jobs per user

// All valid engine keys (Modal + EvoLink + Bailian + HeyGen)
const VALID_ENGINES = [
  "wan_i2v",
  "seedance",
  "heygen_avatar_iv",
  ...Object.keys(EVOLINK_ENGINES),
  ...Object.keys(BAILIAN_ENGINES),
];

// Hard cap on multi-scene chaining length (defense in depth — storyboard
// is already capped per-plan). Even premium can't ask EvoLink for >6 chained
// scenes — beyond that, generation cost & wait time become unreasonable.
const MAX_CHAIN_LENGTH = 25;

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
      references,
      multi_scene_chain,
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
      motion_prompt,
    } = body as {
      prompt: string;
      target_duration_seconds?: unknown;
      preferred_engine?: string;
      image_url?: string;
      references?: Record<string, unknown>;
      multi_scene_chain?: boolean;
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
      /** HeyGen Avatar IV motion prompt for gestures/posture */
      motion_prompt?: string;
    };

    // Default ON. Only set OFF if explicitly false (the user toggled it off
    // in Advanced settings, or the chosen engine doesn't support I2V).
    const chainOptIn = multi_scene_chain !== false;

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

    // --- validation ---------------------------------------------------
    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt is required (min 3 characters)" },
        { status: 400 }
      );
    }

    if (prompt.trim().length > 2000) {
      return NextResponse.json(
        { error: "Prompt too long (max 2000 characters)" },
        { status: 400 }
      );
    }

    // --- V1 Étape C: validate references (count, roles, ownership) ------
    if (safeReferences) {
      const refError = validateReferences(
        safeReferences as ReferencePayload,
        user?.id,
      );
      if (refError) {
        return NextResponse.json(
          { error: refError.error, code: refError.code },
          { status: refError.status },
        );
      }
    }

    // --- resolve plan from profiles (never trust client input) ----------
    let plan: JobPlan = "free";
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();
      if (profile?.plan === "pro" || profile?.plan === "premium") {
        plan = profile.plan as JobPlan;
      }
    }

    // --- quota check (authenticated users only) -----------------------
    if (user?.id) {
      const { count: activeCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["pending", "in_progress"]);

      if (activeCount && activeCount >= MAX_ACTIVE_JOBS) {
        return NextResponse.json(
          { error: "You already have an active generation. Please wait for it to finish." },
          { status: 429 }
        );
      }

      // Daily quota enforcement (applies to all plans except unlimited)
      const dailyLimit = PLAN_DAILY_QUOTA[plan];
      if (dailyLimit !== -1) {
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        const { count: recentCount } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", twentyFourHoursAgo);

        if (recentCount && recentCount >= dailyLimit) {
          const msg =
            plan === "free"
              ? "You've reached your free limit. Upgrade to Pro for more generations."
              : `You've reached your daily limit of ${dailyLimit} generations. Upgrade to Premium for unlimited access.`;
          return NextResponse.json(
            { error: msg, upgrade: true },
            { status: 429 }
          );
        }
      }
    }

    // --- engine plan gate (server-side) ------------------------------------
    // Verify the requested engine is allowed for the user's plan.
    // Free users can only use Modal engines (wan_i2v). EvoLink/Bailian
    // engines require Pro+; sora_2 requires Premium.
    if (safePreferredEngine && isEvoLinkEngine(safePreferredEngine)) {
      const engineConfig = EVOLINK_ENGINES[safePreferredEngine];
      if (engineConfig && !engineConfig.plans.includes(plan)) {
        return NextResponse.json(
          { error: "This model requires a higher plan. Upgrade to Pro or Premium.", upgrade: true },
          { status: 403 }
        );
      }
    }
    if (safePreferredEngine && isBailianEngine(safePreferredEngine)) {
      const engineConfig = BAILIAN_ENGINES[safePreferredEngine];
      if (engineConfig && !engineConfig.plans.includes(plan)) {
        return NextResponse.json(
          { error: "This model requires a higher plan. Upgrade to Pro or Premium.", upgrade: true },
          { status: 403 }
        );
      }
    }
    // HeyGen Avatar IV — Premium only
    if (safePreferredEngine && isHeyGenEngine(safePreferredEngine)) {
      if (plan !== "premium") {
        return NextResponse.json(
          { error: "Avatar IV requires a Premium plan. Upgrade to access.", upgrade: true },
          { status: 403 }
        );
      }
      // avatar_id and voice_id are required for HeyGen
      if (!avatar_id || !voice_id) {
        return NextResponse.json(
          { error: "Avatar ID and Voice ID are required for Avatar IV." },
          { status: 400 }
        );
      }
    }

    const rawDuration = Number(target_duration_seconds);
    const safeDuration =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : plan === "pro" ? 15 : 5;

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
      // Default: server-generated storyboard
      const storyboardBase = generateStoryboard(enhancedPrompt, safeDuration, plan);
      // For multi-scene jobs: enrich each scene with distinct LLM-crafted prompts
      storyboard = await enrichStoryboardWithLLM(storyboardBase, enhancedPrompt);
    }

    const targetDuration = storyboard.reduce((s, sc) => s + sc.duration_sec, 0);

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
        ...(safeImageUrl ? { image_url: safeImageUrl } : {}),
        ...(safeReferences ? { references_payload: safeReferences } : {}),
        ...(user?.id ? { user_id: user.id } : {}),
        // Audio settings
        ...(audio_mode && ["none", "auto", "custom"].includes(audio_mode)
          ? { audio_mode }
          : { audio_mode: "auto" }),
        ...(audio_prompt && typeof audio_prompt === "string"
          ? { audio_prompt: audio_prompt.slice(0, 500) }
          : {}),
        ...(voiceover_text && typeof voiceover_text === "string"
          ? { voiceover_text: voiceover_text.slice(0, 2000) }
          : {}),
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

    // ── Route: HeyGen vs Bailian vs EvoLink vs Modal (GPU) ────────────────
    // Feature flag: transparently reroute a % of EvoLink traffic to Bailian
    const rawEngineKey = safePreferredEngine ?? "wan_i2v";
    const engineKey = maybeRerouteToBailian(rawEngineKey);

    // ── HeyGen Avatar IV path ──────────────────────────────────────────
    if (isHeyGenEngine(engineKey) && avatar_id && voice_id) {
      try {
        const task = await createAvatarVideo({
          avatarId: avatar_id,
          scriptText: prompt.trim(),
          voiceId: voice_id,
          dimensions: aspect_ratio === "9:16" ? "1080x1920" : "1920x1080",
          motionPrompt: motion_prompt,
        });

        console.log(
          `[jobs] HeyGen avatar video: job=${job.id} task=${task.taskId} ` +
          `avatar=${avatar_id} voice=${voice_id}`
        );

        // Single scene for avatar — mark as generating
        await supabase
          .from("job_scenes")
          .update({ status: "generating", external_task_id: task.taskId })
          .eq("job_id", job.id)
          .eq("scene_index", 0);

        await supabase
          .from("jobs")
          .update({
            status: "in_progress",
            current_stage: "generating_scene_1",
            engine_used: engineKey,
            external_task_id: task.taskId,
            multi_scene_chain: false, // Avatar = always single scene
          })
          .eq("id", job.id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[jobs] HeyGen avatar create failed:`, errMsg);
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: `HeyGen error: ${errMsg}` })
          .eq("id", job.id);
        await supabase
          .from("job_scenes")
          .update({ status: "failed", error_message: errMsg.slice(0, 400) })
          .eq("job_id", job.id)
          .eq("scene_index", 0);
      }

      return NextResponse.json({ success: true, jobId: job.id, job });
    }

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

    if (isEvoLinkEngine(engineKey)) {
      // ── EvoLink path ───────────────────────────────────────────────────
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

        const taskId = await createEvoLinkTask({
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
          // Only pass wan/seedance engines to Modal
          preferred_engine: engineKey === "wan_i2v" ? "wan_i2v" : undefined,
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
