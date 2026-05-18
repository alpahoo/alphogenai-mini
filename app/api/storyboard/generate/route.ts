import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateStoryboard, enrichStoryboardWithLLM } from "@/lib/storyboard";
import { enhancePrompt } from "@/lib/prompt-enhancer";
import type { JobPlan } from "@/lib/types";

export const maxDuration = 30;

/**
 * POST /api/storyboard/generate
 * Generate a preview storyboard (enriched scene prompts) WITHOUT creating a job.
 * Used by the pre-generation editor to let users review and edit scenes before launching.
 *
 * Body: { prompt, target_duration_seconds?, preferred_engine? }
 * Returns: { scenes: StoryboardEntry[], enhancedPrompt: string }
 */
export async function POST(req: Request) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { prompt, target_duration_seconds, preferred_engine } = body as {
    prompt?: string;
    target_duration_seconds?: number;
    preferred_engine?: string;
  };

  if (!prompt || prompt.trim().length < 3) {
    return NextResponse.json({ error: "Prompt must be at least 3 characters" }, { status: 400 });
  }

  // Get user plan
  const { createServiceClient } = await import("@/lib/supabase/service");
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  const plan = (profile?.plan ?? "free") as JobPlan;
  const duration = Math.max(3, Math.min(target_duration_seconds ?? 5, 60));

  // Step 1: Enhance the prompt
  let enhancedPrompt: string;
  try {
    enhancedPrompt = await enhancePrompt(prompt.trim());
  } catch {
    enhancedPrompt = prompt.trim();
  }

  // Step 2: Generate deterministic storyboard
  const storyboard = generateStoryboard(enhancedPrompt, duration, plan);

  // Step 3: Enrich with LLM (distinct cinematic prompts per scene)
  const enriched = await enrichStoryboardWithLLM(storyboard, prompt.trim());

  // Override engine if specified
  if (preferred_engine) {
    for (const scene of enriched) {
      scene.engine = preferred_engine as typeof scene.engine;
    }
  }

  return NextResponse.json({
    scenes: enriched,
    enhancedPrompt,
    plan,
    totalDuration: enriched.reduce((s, sc) => s + sc.duration_sec, 0),
  });
}
