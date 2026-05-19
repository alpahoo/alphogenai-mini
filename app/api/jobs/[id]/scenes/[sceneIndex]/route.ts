import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  isEvoLinkEngine,
  createEvoLinkTask,
} from "@/lib/evolink-client";
import {
  isBailianEngine,
  createBailianTask,
} from "@/lib/bailian-client";

type RouteParams = { params: Promise<{ id: string; sceneIndex: string }> };

/**
 * PATCH /api/jobs/[id]/scenes/[sceneIndex]
 * Update a scene's prompt (without re-generating).
 * Only works when the job is done or failed.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id, sceneIndex } = await params;
  const idx = parseInt(sceneIndex, 10);
  if (isNaN(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid scene index" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { prompt } = body as { prompt?: string };
  if (!prompt || prompt.trim().length < 3) {
    return NextResponse.json({ error: "Prompt must be at least 3 characters" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify ownership
  const { data: job } = await supabase
    .from("jobs")
    .select("id, user_id, status")
    .eq("id", id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only allow editing on terminal states
  if (job.status !== "done" && job.status !== "failed") {
    return NextResponse.json(
      { error: "Can only edit scenes on completed or failed jobs" },
      { status: 400 },
    );
  }

  // Find the scene
  const { data: scene } = await supabase
    .from("job_scenes")
    .select("id")
    .eq("job_id", id)
    .eq("scene_index", idx)
    .single();

  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  // Update prompt
  const { error: updateErr } = await supabase
    .from("job_scenes")
    .update({ prompt: prompt.trim(), updated_at: new Date().toISOString() })
    .eq("id", scene.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Also update the storyboard JSONB on the job row for consistency
  const { data: jobFull } = await supabase
    .from("jobs")
    .select("storyboard")
    .eq("id", id)
    .single();

  if (jobFull?.storyboard && Array.isArray(jobFull.storyboard)) {
    const sb = [...jobFull.storyboard];
    if (sb[idx]) {
      sb[idx] = { ...sb[idx], prompt: prompt.trim() };
      await supabase.from("jobs").update({ storyboard: sb }).eq("id", id);
    }
  }

  return NextResponse.json({ success: true, sceneIndex: idx });
}

/**
 * POST /api/jobs/[id]/scenes/[sceneIndex]
 * Regenerate a single scene — fires a new EvoLink/Bailian task.
 *
 * Flow:
 *   1. Reset scene to "generating" with new external_task_id
 *   2. Clear old clip_url, error_message
 *   3. Set job back to "in_progress", clear final video URLs
 *   4. The existing poll loop (GET /api/jobs/[id]) handles the rest
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { id, sceneIndex } = await params;
  const idx = parseInt(sceneIndex, 10);
  if (isNaN(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid scene index" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Verify ownership + get job details
  const { data: job } = await supabase
    .from("jobs")
    .select("id, user_id, status, engine_used, references_payload, multi_scene_chain")
    .eq("id", id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only allow regeneration on terminal states
  if (job.status !== "done" && job.status !== "failed") {
    return NextResponse.json(
      { error: "Can only regenerate scenes on completed or failed jobs" },
      { status: 400 },
    );
  }

  // Find the scene
  const { data: scene } = await supabase
    .from("job_scenes")
    .select("id, scene_index, prompt, duration_sec")
    .eq("job_id", id)
    .eq("scene_index", idx)
    .single();

  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const engineKey = (job.engine_used as string) ?? "wan_i2v";
  const prompt = scene.prompt
    .replace(/\[SCENE\s*\d+[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  const duration = Math.round(Number(scene.duration_sec) || 5);

  // Get first_frame_url from previous scene (for chaining continuity)
  let firstFrameUrl: string | undefined;
  if (idx > 0 && job.multi_scene_chain) {
    const { data: prevScene } = await supabase
      .from("job_scenes")
      .select("last_frame_url")
      .eq("job_id", id)
      .eq("scene_index", idx - 1)
      .single();

    if (prevScene?.last_frame_url) {
      firstFrameUrl = prevScene.last_frame_url;
    }
  }

  // Fire new task
  let taskId: string;
  try {
    if (isBailianEngine(engineKey)) {
      taskId = await createBailianTask({
        engineKey,
        prompt,
        duration,
        imageUrl: firstFrameUrl,
      });
    } else if (isEvoLinkEngine(engineKey)) {
      taskId = await createEvoLinkTask({
        engineKey,
        prompt,
        duration,
        imageUrl: firstFrameUrl,
        references: job.references_payload as Parameters<typeof createEvoLinkTask>[0]["references"],
      });
    } else {
      // Modal engine — not supported for individual scene regen yet
      return NextResponse.json(
        { error: "Individual scene regeneration not supported for this engine" },
        { status: 400 },
      );
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to create task: ${errMsg}` }, { status: 500 });
  }

  // Reset scene to generating
  await supabase
    .from("job_scenes")
    .update({
      status: "generating",
      external_task_id: taskId,
      clip_url: null,
      last_frame_url: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scene.id);

  // Set job back to in_progress, clear stale final video
  const stageNum = Math.min(idx + 1, 5);
  await supabase
    .from("jobs")
    .update({
      status: "in_progress",
      current_stage: `generating_scene_${stageNum}`,
      external_task_id: taskId,
      video_url: null,
      output_url_final: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  console.log(
    `[scenes/regen] scene=${idx} job=${id} engine=${engineKey} taskId=${taskId}`,
  );

  return NextResponse.json({
    success: true,
    sceneIndex: idx,
    taskId,
    message: `Scene ${idx + 1} is regenerating. The video will be reassembled automatically.`,
  });
}
