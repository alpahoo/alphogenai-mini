import type { SupabaseClient } from "@supabase/supabase-js";
import { screenPrompt, type PolicyFinding } from "@/lib/content-policy";
import { validateReferences } from "@/lib/validate-references";
import { isEvoLinkEngine, EVOLINK_ENGINES } from "@/lib/evolink-client";
import { isBailianEngine, BAILIAN_ENGINES } from "@/lib/bailian-client";
import { isHeyGenEngine, isHeyGenShotsEngine } from "@/lib/heygen-client";
import type { JobPlan, ReferencePayload } from "@/lib/types";
import { PLAN_DAILY_QUOTA } from "@/lib/types";

/** Max concurrent (pending/in_progress) jobs per user. */
export const MAX_ACTIVE_JOBS = 1;

/**
 * Everything the create-job gate needs to decide. This is the *intent* of a
 * generation — NOT the full provider payload. The caller (session route or a
 * future `/api/mcp/*` route) resolves `userId` from its own auth, never trusts
 * client-supplied plan/quota.
 */
export interface JobGuardInput {
  /** Authenticated user id, or undefined/null for an anonymous request. */
  userId?: string | null;
  prompt: string;
  /** Optional dialogue/script appended to the prompt for content screening. */
  scriptText?: unknown;
  /** Reference images/assets payload (validated for ownership + roles). */
  references?: ReferencePayload | null;
  /** Requested engine key (already validated against VALID_ENGINES). */
  preferredEngine?: string;
  /** HeyGen avatar id (avatar engines). */
  avatarId?: string | null;
  /** HeyGen saved-look id (avatar engines). */
  lookId?: string | null;
  /** HeyGen voice id (avatar engines). */
  voiceId?: string | null;
}

/** Deny outcome — caller turns `{ status, body }` into an HTTP response. */
export interface JobGuardDeny {
  ok: false;
  status: number;
  body: {
    error: string;
    code?: string;
    upgrade?: boolean;
    policy?: PolicyFinding[];
  };
}

/** Allow outcome — carries the server-resolved plan for downstream logic. */
export interface JobGuardAllow {
  ok: true;
  plan: JobPlan;
}

export type JobGuardResult = JobGuardDeny | JobGuardAllow;

/**
 * Single source of truth for "may this user create this job right now?".
 *
 * Runs, in order: prompt validation → AlphoGen content policy → references
 * ownership → plan resolution (from `profiles`, never client) → active-generation
 * limit → daily quota → engine plan gate (EvoLink/Bailian Pro+, HeyGen Premium +
 * avatar/voice requirements).
 *
 * Returns `{ ok: true, plan }` when allowed (the resolved plan is reused by the
 * caller for duration/scene defaults), or `{ ok: false, status, body }` to be
 * returned verbatim. Behaviour is identical to the original inline gate in
 * `POST /api/jobs` — `app/api/jobs/route.test.ts` is the regression net.
 *
 * `supabase` MUST be a service-role client (it reads `profiles`/`jobs` across
 * RLS); the gate itself does ownership scoping by `userId`.
 */
export async function assertCanCreateJob(
  supabase: SupabaseClient,
  input: JobGuardInput,
): Promise<JobGuardResult> {
  const {
    userId,
    prompt,
    scriptText,
    references,
    preferredEngine,
    avatarId,
    lookId,
    voiceId,
  } = input;

  // --- prompt validation --------------------------------------------------
  if (!prompt || prompt.trim().length < 3) {
    return {
      ok: false,
      status: 400,
      body: { error: "Prompt is required (min 3 characters)" },
    };
  }
  if (prompt.trim().length > 2000) {
    return {
      ok: false,
      status: 400,
      body: { error: "Prompt too long (max 2000 characters)" },
    };
  }

  // --- AlphoGen content policy (our own layer, before any provider) -------
  const policy = screenPrompt(
    `${prompt}\n${typeof scriptText === "string" ? scriptText : ""}`,
  );
  const block = policy.findings.find((f) => f.level === "block");
  if (block) {
    return {
      ok: false,
      status: 400,
      body: { error: block.message, code: block.code, policy: policy.findings },
    };
  }

  // --- references (count, roles, ownership) -------------------------------
  if (references) {
    const refError = validateReferences(references, userId ?? undefined);
    if (refError) {
      return {
        ok: false,
        status: refError.status,
        body: { error: refError.error, code: refError.code },
      };
    }
  }

  // --- resolve plan from profiles (never trust client input) --------------
  let plan: JobPlan = "free";
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .single();
    if (profile?.plan === "pro" || profile?.plan === "premium") {
      plan = profile.plan as JobPlan;
    }
  }

  // --- quota check (authenticated users only) -----------------------------
  if (userId) {
    const { count: activeCount } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"]);

    if (activeCount && activeCount >= MAX_ACTIVE_JOBS) {
      return {
        ok: false,
        status: 429,
        body: {
          error:
            "You already have an active generation. Please wait for it to finish.",
        },
      };
    }

    // Daily quota enforcement (applies to all plans except unlimited).
    const dailyLimit = PLAN_DAILY_QUOTA[plan];
    if (dailyLimit !== -1) {
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();

      const { count: recentCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", twentyFourHoursAgo);

      if (recentCount && recentCount >= dailyLimit) {
        const msg =
          plan === "free"
            ? "You've reached your free limit. Upgrade to Pro for more generations."
            : `You've reached your daily limit of ${dailyLimit} generations. Upgrade to Premium for unlimited access.`;
        return { ok: false, status: 429, body: { error: msg, upgrade: true } };
      }
    }
  }

  // --- engine plan gate (server-side) -------------------------------------
  // Free users can only use Modal engines (wan_i2v). EvoLink/Bailian engines
  // require Pro+; some require Premium. HeyGen avatar engines are Premium-only.
  if (preferredEngine && isEvoLinkEngine(preferredEngine)) {
    const engineConfig = EVOLINK_ENGINES[preferredEngine];
    if (engineConfig && !engineConfig.plans.includes(plan)) {
      return {
        ok: false,
        status: 403,
        body: {
          error:
            "This model requires a higher plan. Upgrade to Pro or Premium.",
          upgrade: true,
        },
      };
    }
  }
  if (preferredEngine && isBailianEngine(preferredEngine)) {
    const engineConfig = BAILIAN_ENGINES[preferredEngine];
    if (engineConfig && !engineConfig.plans.includes(plan)) {
      return {
        ok: false,
        status: 403,
        body: {
          error:
            "This model requires a higher plan. Upgrade to Pro or Premium.",
          upgrade: true,
        },
      };
    }
  }
  // HeyGen Avatar engines — Premium only.
  if (preferredEngine && isHeyGenEngine(preferredEngine)) {
    if (plan !== "premium") {
      return {
        ok: false,
        status: 403,
        body: {
          error: "Avatar generation requires a Premium plan. Upgrade to access.",
          upgrade: true,
        },
      };
    }
    // An avatar is required — unless reusing a saved Look (the Look IS the
    // visual; we only lip-sync onto it).
    if (!avatarId && !lookId) {
      return { ok: false, status: 400, body: { error: "An avatar is required." } };
    }
    // Avatar IV (presenter) requires a voice; Avatar Shots (cinematic) only
    // requires a voice when a script is provided for lip-sync.
    if (!isHeyGenShotsEngine(preferredEngine) && !voiceId) {
      return {
        ok: false,
        status: 400,
        body: { error: "A voice is required for Avatar IV." },
      };
    }
  }

  return { ok: true, plan };
}
