import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateStoryboard, enrichStoryboardWithLLM } from "@/lib/storyboard";
import { isEvoLinkEngine, createEvoLinkTask, EVOLINK_ENGINES } from "@/lib/evolink-client";
import { enhancePrompt } from "@/lib/prompt-enhancer";
import type { JobPlan } from "@/lib/types";

const FREE_QUOTA_24H = 1; // max free jobs per 24h per user (pre-Stripe)
const MAX_ACTIVE_JOBS = 1; // max concurrent jobs per user

// All valid engine keys (Modal + EvoLink)
const VALID_ENGINES = ["wan_i2v", "seedance", ...Object.keys(EVOLINK_ENGINES)];

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const supabase = createServiceClient();
    const body = await req.json();
    const { prompt, target_duration_seconds, preferred_engine, image_url, references } = body as {
      prompt: string;
      target_duration_seconds?: unknown;
      preferred_engine?: string;
      image_url?: string;
      references?: Record<string, unknown>;
    };

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

    if (prompt.trim().length > 500) {
      return NextResponse.json(
        { error: "Prompt too long (max 500 characters)" },
        { status: 400 }
      );
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

      if (plan === "free") {
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        const { count: recentCount } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", twentyFourHoursAgo);

        if (recentCount && recentCount >= FREE_QUOTA_24H) {
          return NextResponse.json(
            {
              error: "You've reached your free limit. Upgrade to Pro to generate longer videos and unlimited scenes.",
              upgrade: true,
            },
            { status: 429 }
          );
        }
      }
    }

    // --- engine plan gate (server-side) ------------------------------------
    // Verify the requested engine is allowed for the user's plan.
    // Free users can only use Modal engines (wan_i2v). EvoLink engines
    // require Pro+; sora_2 requires Premium.
    if (safePreferredEngine && isEvoLinkEngine(safePreferredEngine)) {
      const engineConfig = EVOLINK_ENGINES[safePreferredEngine];
      if (engineConfig && !engineConfig.plans.includes(plan)) {
        return NextResponse.json(
          { error: "This model requires a higher plan. Upgrade to Pro or Premium.", upgrade: true },
          { status: 403 }
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

    // Generate storyboard structure (duration math, scene count, engine)
    const storyboardBase = generateStoryboard(enhancedPrompt, safeDuration, plan);

    // For multi-scene jobs: enrich each scene with distinct LLM-crafted prompts
    // Single-scene jobs already have the enhanced prompt — no LLM needed
    const storyboard = await enrichStoryboardWithLLM(storyboardBase, enhancedPrompt);

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
        ...(safeImageUrl ? { image_url: safeImageUrl } : {}),
        ...(safeReferences ? { references_payload: safeReferences } : {}),
        ...(user?.id ? { user_id: user.id } : {}),
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

    // ── Route: EvoLink (direct REST) vs Modal (GPU) ──────────────────────
    const engineKey = safePreferredEngine ?? "wan_i2v";

    if (isEvoLinkEngine(engineKey)) {
      // ── EvoLink path: call API directly, no Modal ──────────────────────
      try {
        const taskId = await createEvoLinkTask({
          engineKey,
          prompt: enhancedPrompt,   // enriched cinematically
          duration: safeDuration,
          imageUrl: safeImageUrl,
        });

        await supabase
          .from("jobs")
          .update({
            status: "in_progress",
            current_stage: "generating_scene_1",
            engine_used: engineKey,
            external_task_id: taskId,
          })
          .eq("id", job.id);

        console.log(`[jobs] EvoLink task created: job=${job.id} engine=${engineKey} task=${taskId}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[jobs] EvoLink create failed:`, errMsg);
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: `EvoLink error: ${errMsg}` })
          .eq("id", job.id);
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
