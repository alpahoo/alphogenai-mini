import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * GET /api/referral — Get the authenticated user's referral code + stats.
 *
 * If the user has no referral code, one is generated on-the-fly.
 * Returns: { code, referralUrl, totalReferred, bonusCredits }
 */
export async function GET() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get or create referral code
  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", user.id)
    .single();

  let code = profile?.referral_code as string | null;

  if (!code) {
    // Generate a unique 8-char referral code
    code = randomBytes(4).toString("hex");
    await supabase
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", user.id);
  }

  // Count how many users signed up with this referral code
  const { count: totalReferred } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", code);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return NextResponse.json({
    code,
    referralUrl: `${siteUrl}/login?ref=${code}`,
    totalReferred: totalReferred ?? 0,
    // Future: bonus credits per referral (5 extra free generations per referral)
    bonusCredits: (totalReferred ?? 0) * 5,
  });
}
