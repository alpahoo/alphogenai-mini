import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateStoryboard } from "@/lib/storyboard";
import type { JobPlan } from "@/lib/types";

const FREE_QUOTA_24H = 1; // max free jobs per 24h per user (pre-Stripe)
const MAX_ACTIVE_JOBS = 1; // max concurrent jobs per user

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const supabase = createServiceClient();
    const body = await req.json();
    const { prompt, target_duration_seconds } = body as {
      prompt: string;
      target_duration_seconds?: unknown;
    };

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
      // 1. Check active jobs
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

      // 2. Check 24h free quota (pro users: unlimited)
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

    const rawDuration = Number(target_duration_seconds);
    const safeDuration =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : plan === "pro" ? 15 : 5;

    // Generate storyboard server-side (scene_count is NEVER taken from client)
    const storyboard = generateStoryboard(
      prompt.trim(),
      safeDuration,
      plan
    );

    const targetDuration = storyboard.reduce((s, sc) => s + sc.duration_sec, 0);

    // Insert as "pending" — webhook will set "in_progress" before spawning.
    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert({
        prompt: prompt.trim(),
        plan,
        status: "pending",
        current_stage: "queued",
        target_duration_seconds: Math.round(targetDuration),
        storyboard,
        ...(user?.id ? { user_id: user.id } : {}),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create job:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // --- insert scenes into job_scenes --------------------------------
    const sceneRows = storyboard.map((sc) => ({
      job_id: job.id,
      scene_index: sc.scene_index,
      prompt: sc.prompt,
      engine: sc.engine,
      duration_sec: sc.duration_sec,
      status: "pending" as const,
    }));

    const { error: scenesError } = await supabase
      .from("job_scenes")
      .insert(sceneRows);

    if (scenesError) {
      console.error("Failed to insert scenes:", scenesError);
      // Non-fatal: job still exists, pipeline can re-derive scenes from storyboard
    }

    // --- trigger Modal ------------------------------------------------
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
          prompt: prompt.trim(),
          plan,
          user_id: user?.id ?? null,
          scene_count: storyboard.length,
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
        // Webhook accepted — mark generating immediately so frontend
        // never polls "pending" after this point.
        await supabase
          .from("jobs")
          .update({ status: "in_progress", current_stage: "spawning_pipeline" })
          .eq("id", job.id)
          .eq("status", "pending"); // only if still pending (avoid overwriting failure)
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
