import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/flags";
import { getEvoLinkCredits, EVOLINK_ENGINES } from "@/lib/evolink-client";

/**
 * GET /api/admin/credits — Check remaining credits on all providers.
 * Admin-only endpoint. Returns balances for EvoLink (and Bailian in future).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const providers: Record<string, unknown> = {};

  // EvoLink — use userRemaining (actual account balance), NOT tokenRemaining
  // (which is the API key-level cap and can be misleadingly high like 100K)
  try {
    const credits = await getEvoLinkCredits();
    const balance = credits.userRemaining;
    providers.evolink = {
      remaining: balance,
      used: credits.userUsed,
      unlimited: credits.tokenUnlimited,
      tokenRemaining: credits.tokenRemaining,
      tokenUsed: credits.tokenUsed,
      status: balance < 100 ? "critical" : balance < 500 ? "low" : "ok",
    };
  } catch (e) {
    providers.evolink = {
      error: e instanceof Error ? e.message : "Failed to fetch",
      status: "error",
    };
  }

  // Bailian — no balance API yet, placeholder
  if (process.env.BAILIAN_API_KEY) {
    providers.bailian = {
      status: "available",
      note: "No balance API — check Alibaba console manually",
    };
  }

  // Build per-engine credits cost map for client-side estimation
  const engineCosts: Record<string, number> = {};
  for (const [key, cfg] of Object.entries(EVOLINK_ENGINES)) {
    engineCosts[key] = cfg.creditsPerScene ?? 100;
  }

  return NextResponse.json({ providers, engineCosts });
}
