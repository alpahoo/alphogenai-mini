/**
 * AlphoGen MCP — V1 read-only / no-cost tools (T-901c skeleton).
 *
 *   get_job             — one owned job, provider-neutral.
 *   list_recent_jobs    — recent owned jobs, capped.
 *   validate_job_payload— "would this be accepted?" — reuses assertCanCreateJob,
 *                         NEVER inserts. No new gate logic.
 *
 * Every tool acts strictly as `actor.userId` (ownership scoping) and returns only
 * provider-neutral data. None spends money or mutates state. `create_video` and
 * other cost-incurring tools are intentionally NOT here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCanCreateJob, resolveUserPlan } from "@/lib/jobs/guard";
import { generateStoryboard } from "@/lib/storyboard";
import {
  buildUGCDirectorPlan,
  type UGCAngle,
  type UGCCreator,
  type UGCPlatform,
  type UGCReferenceInput,
} from "@/lib/ugc-director";
import { PUBLIC_JOB_COLUMNS, toPublicJob, type JobRow } from "@/lib/mcp/serialize";
import type { McpActor, McpResult, McpToolInfo, PublicJob } from "@/lib/mcp/types";

/** Server-side dependencies injected by the route (keeps tools unit-testable). */
export interface ToolDeps {
  /** Service-role client — used ONLY server-side, always scoped by actor.userId. */
  supabase: SupabaseClient;
}

export interface McpTool {
  info: McpToolInfo;
  run(
    actor: McpActor,
    input: Record<string, unknown>,
    deps: ToolDeps,
  ): Promise<McpResult<unknown>>;
}

const MAX_LIST_LIMIT = 20;
const DEFAULT_LIST_LIMIT = 10;

// --- get_job ----------------------------------------------------------------
async function getJob(
  actor: McpActor,
  input: Record<string, unknown>,
  { supabase }: ToolDeps,
): Promise<McpResult<PublicJob>> {
  const jobId = typeof input.job_id === "string" ? input.job_id.trim() : "";
  if (!jobId) {
    return { ok: false, status: 400, error: "job_id is required", code: "INVALID_INPUT" };
  }
  const { data, error } = await supabase
    .from("jobs")
    .select(PUBLIC_JOB_COLUMNS)
    .eq("id", jobId)
    .eq("user_id", actor.userId) // ownership scoping
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: "Failed to read job" };
  }
  if (!data) {
    // 404 whether it doesn't exist or isn't owned — no cross-user disclosure.
    return { ok: false, status: 404, error: "Job not found", code: "NOT_FOUND" };
  }
  return { ok: true, data: toPublicJob(data as JobRow) };
}

// --- list_recent_jobs -------------------------------------------------------
async function listRecentJobs(
  actor: McpActor,
  input: Record<string, unknown>,
  { supabase }: ToolDeps,
): Promise<McpResult<{ jobs: PublicJob[] }>> {
  const raw = Number(input.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;

  const { data, error } = await supabase
    .from("jobs")
    .select(PUBLIC_JOB_COLUMNS)
    .eq("user_id", actor.userId) // ownership scoping
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, status: 500, error: "Failed to list jobs" };
  }
  const jobs = (data ?? []).map((row) => toPublicJob(row as JobRow));
  return { ok: true, data: { jobs } };
}

// --- validate_job_payload (preview, reuses assertCanCreateJob) --------------
async function validateJobPayload(
  actor: McpActor,
  input: Record<string, unknown>,
  { supabase }: ToolDeps,
): Promise<McpResult<{ accepted: boolean; plan?: string; reason?: string; code?: string; status?: number }>> {
  const gate = await assertCanCreateJob(supabase, {
    userId: actor.userId,
    prompt: typeof input.prompt === "string" ? input.prompt : "",
    scriptText: input.script_text,
    references: (input.references as never) ?? undefined,
    preferredEngine: typeof input.preferred_engine === "string" ? input.preferred_engine : undefined,
    avatarId: typeof input.avatar_id === "string" ? input.avatar_id : undefined,
    lookId: typeof input.look_id === "string" ? input.look_id : undefined,
    voiceId: typeof input.voice_id === "string" ? input.voice_id : undefined,
  });

  if (gate.ok) {
    // Preview only — no insert, no spend.
    return { ok: true, data: { accepted: true, plan: gate.plan } };
  }
  return {
    ok: true,
    data: {
      accepted: false,
      reason: gate.body.error,
      code: gate.body.code,
      status: gate.status,
    },
  };
}

// --- create_director_plan (pure planner: scenes from prompt + duration) -----
interface DirectorPlanResult {
  plan: string;
  scene_count: number;
  total_duration_seconds: number;
  scenes: { scene_index: number; prompt: string; duration_sec: number }[];
}

async function createDirectorPlan(
  actor: McpActor,
  input: Record<string, unknown>,
  { supabase }: ToolDeps,
): Promise<McpResult<DirectorPlanResult>> {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (prompt.length < 3) {
    return { ok: false, status: 400, error: "prompt is required (min 3 characters)", code: "INVALID_INPUT" };
  }
  const dur = Number(input.target_duration_seconds);
  const safeDuration = Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 5;
  const forced = Number(input.scenes);
  const opts = Number.isFinite(forced) && forced >= 1 ? { forcedScenes: Math.round(forced) } : {};

  // Resolve the actor's real plan so the scene cap matches what they could
  // actually generate (read-only; same source of truth as the create gate).
  const plan = await resolveUserPlan(supabase, actor.userId);
  const storyboard = generateStoryboard(prompt, safeDuration, plan, opts);
  const scenes = storyboard.map((s) => ({
    scene_index: s.scene_index,
    prompt: s.prompt,
    duration_sec: s.duration_sec,
  }));
  const total = scenes.reduce((sum, s) => sum + s.duration_sec, 0);
  return {
    ok: true,
    data: { plan, scene_count: scenes.length, total_duration_seconds: Math.round(total * 10) / 10, scenes },
  };
}

// --- create_ugc_plan (pure planner: buildUGCDirectorPlan) --------------------
const UGC_ANGLES: readonly UGCAngle[] = ["testimonial", "unboxing", "try_on", "product_demo", "before_after", "founder_pitch"];
const UGC_PLATFORMS: readonly UGCPlatform[] = ["tiktok_reels", "square_feed", "landscape_ad"];
const UGC_CREATORS: readonly UGCCreator[] = ["verified_face", "saved_look", "avatar", "none"];

/** Accept a reference as `{label?,placeholder?}` or a bare string. */
function refInput(v: unknown): UGCReferenceInput | undefined {
  if (typeof v === "string") return { placeholder: v };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return {
      label: typeof o.label === "string" ? o.label : undefined,
      placeholder: typeof o.placeholder === "string" ? o.placeholder : undefined,
    };
  }
  return undefined;
}

async function createUgcPlan(
  _actor: McpActor,
  input: Record<string, unknown>,
): Promise<McpResult<unknown>> {
  const angle = String(input.angle ?? "");
  const platform = String(input.platform ?? "");
  const creator = String(input.creator ?? "");
  if (!(UGC_ANGLES as readonly string[]).includes(angle)) {
    return { ok: false, status: 400, error: `angle must be one of: ${UGC_ANGLES.join(", ")}`, code: "INVALID_INPUT" };
  }
  if (!(UGC_PLATFORMS as readonly string[]).includes(platform)) {
    return { ok: false, status: 400, error: `platform must be one of: ${UGC_PLATFORMS.join(", ")}`, code: "INVALID_INPUT" };
  }
  if (!(UGC_CREATORS as readonly string[]).includes(creator)) {
    return { ok: false, status: 400, error: `creator must be one of: ${UGC_CREATORS.join(", ")}`, code: "INVALID_INPUT" };
  }

  const plan = buildUGCDirectorPlan({
    product: refInput(input.product) ?? {},
    outfit: refInput(input.outfit) ?? null,
    angle: angle as UGCAngle,
    platform: platform as UGCPlatform,
    creator: creator as UGCCreator,
    creatorLabel: typeof input.creator_label === "string" ? input.creator_label : undefined,
    productName: typeof input.product_name === "string" ? input.product_name : undefined,
    keyBenefit: typeof input.key_benefit === "string" ? input.key_benefit : undefined,
    tone: typeof input.tone === "string" ? input.tone : undefined,
  });

  return {
    ok: true,
    data: {
      prompt: plan.prompt,
      aspect_ratio: plan.aspectRatio,
      recommended_scene_count: plan.recommendedSceneCount,
      scenes: plan.scenes.map((s) => ({
        title: s.title,
        role: s.role,
        prompt: s.prompt,
        duration_sec: s.durationSec,
        asset_chips: s.assetChips,
      })),
      social: plan.social,
    },
  };
}

// --- registry ---------------------------------------------------------------
export const MCP_TOOLS: Record<string, McpTool> = {
  get_job: {
    info: {
      name: "get_job",
      scope: "read",
      cost: "none",
      description: "Fetch one of your jobs (status, model, scenes, output) — provider-neutral.",
    },
    run: getJob,
  },
  list_recent_jobs: {
    info: {
      name: "list_recent_jobs",
      scope: "read",
      cost: "none",
      description: "List your most recent jobs (capped at 20).",
    },
    run: listRecentJobs,
  },
  validate_job_payload: {
    info: {
      name: "validate_job_payload",
      scope: "plan",
      cost: "none",
      description:
        "Check whether a generation payload would be accepted (plan/quota/policy/references) WITHOUT creating it.",
    },
    run: validateJobPayload,
  },
  create_director_plan: {
    info: {
      name: "create_director_plan",
      scope: "plan",
      cost: "none",
      description:
        "Build an editable scene breakdown from a prompt + duration (respects your plan's scene cap). Pure — no generation.",
    },
    run: createDirectorPlan,
  },
  create_ugc_plan: {
    info: {
      name: "create_ugc_plan",
      scope: "plan",
      cost: "none",
      description:
        "Build a UGC plan (global prompt, scene beats, aspect ratio, social pack) from product/angle/platform/creator. Pure — no generation.",
    },
    run: createUgcPlan,
  },
};

/** Static, provider-neutral catalog (safe to expose; no user data). */
export function toolCatalog(): McpToolInfo[] {
  return Object.values(MCP_TOOLS).map((t) => t.info);
}
