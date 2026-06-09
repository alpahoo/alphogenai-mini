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
import { assertCanCreateJob } from "@/lib/jobs/guard";
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
};

/** Static, provider-neutral catalog (safe to expose; no user data). */
export function toolCatalog(): McpToolInfo[] {
  return Object.values(MCP_TOOLS).map((t) => t.info);
}
