import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { PLAN_DAILY_QUOTA, PLAN_LABELS, type JobPlan } from "@/lib/types";

/**
 * GET /api/quota — Returns the authenticated user's usage quota.
 *
 * Response:
 * {
 *   plan: "free" | "pro" | "premium",
 *   planLabel: "Free" | "Pro" | "Premium",
 *   used: number,          // jobs created in last 24h
 *   limit: number,         // daily quota (-1 = unlimited)
 *   activeJobs: number,    // currently running jobs
 *   maxActive: 1,          // max concurrent jobs
 * }
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve plan from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  const plan: JobPlan = (profile?.plan as JobPlan) || "free";
  const limit = PLAN_DAILY_QUOTA[plan];

  // Count jobs created in the last 24 hours
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count: used } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", twentyFourHoursAgo);

  // Count currently active jobs
  const { count: activeJobs } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["pending", "in_progress"]);

  return NextResponse.json({
    plan,
    planLabel: PLAN_LABELS[plan],
    used: used ?? 0,
    limit,
    activeJobs: activeJobs ?? 0,
    maxActive: 1,
  });
}
