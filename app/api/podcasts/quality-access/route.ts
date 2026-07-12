import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/podcast/auth";
import {
  BALANCED_BETA_MAX_CONCURRENT_CLIPS,
  BALANCED_BETA_SECONDS_PER_WAVE,
  isPodcastBalancedBetaEligible,
} from "@/lib/podcast/lipsync-beta";
import { isLatentSyncBalancedEnabled } from "@/lib/podcast/lipsync-routing";
import { resolveUserPlan } from "@/lib/jobs/guard";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const plan = await resolveUserPlan(service, user.id);
  const eligible = isLatentSyncBalancedEnabled()
    && isPodcastBalancedBetaEligible({ email: user.email, plan });

  return NextResponse.json({
    balanced: {
      eligible,
      status: eligible ? "beta" : "locked",
      maxConcurrentClips: BALANCED_BETA_MAX_CONCURRENT_CLIPS,
      secondsPerWave: BALANCED_BETA_SECONDS_PER_WAVE,
    },
  });
}
