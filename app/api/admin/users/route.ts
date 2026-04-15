import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/users — List all users with profiles
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const supabase = createServiceClient();

  // Get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, plan, stripe_customer_id, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  // Get user emails from auth.users
  const {
    data: { users: authUsers },
    error: authError,
  } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Build email lookup
  const emailMap = new Map<string, string>();
  for (const u of authUsers ?? []) {
    emailMap.set(u.id, u.email ?? "unknown");
  }

  // Get job counts per user
  const { data: jobCounts } = await supabase
    .from("jobs")
    .select("user_id");

  const jobCountMap = new Map<string, number>();
  for (const j of jobCounts ?? []) {
    if (j.user_id) {
      jobCountMap.set(j.user_id, (jobCountMap.get(j.user_id) ?? 0) + 1);
    }
  }

  // Merge data
  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailMap.get(p.id) ?? "unknown",
    plan: p.plan,
    stripe_customer_id: p.stripe_customer_id,
    job_count: jobCountMap.get(p.id) ?? 0,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  return NextResponse.json({ users });
}

/**
 * PATCH /api/admin/users — Update a user's plan
 * Body: { userId: string, plan: "free" | "pro" | "premium" }
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await req.json();
  const { userId, plan } = body;

  if (!userId || !["free", "pro", "premium"].includes(plan)) {
    return NextResponse.json(
      { error: "Invalid userId or plan. Plan must be free, pro, or premium." },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({ plan, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    `[admin] Plan updated: user=${userId} plan=${plan} by=${auth.user.email}`
  );

  return NextResponse.json({ success: true, userId, plan });
}
