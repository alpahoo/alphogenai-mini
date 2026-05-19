import { NextResponse, NextRequest } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Site-level design configuration.
 * Stored in the `site_config` table (single row, id=1).
 *
 * GET  /api/admin/site-config  — read current config (public, cached)
 * PUT  /api/admin/site-config  — update config (admin only)
 */

export interface SiteConfig {
  /* Brand */
  site_name: string;
  logo_url: string;

  /* Colors — stored as HSL triplets "H S% L%" */
  color_primary: string;
  color_background: string;
  color_card: string;
  color_border: string;
  color_accent: string;
  color_destructive: string;
  color_muted: string;
  color_muted_foreground: string;

  /* Dark mode overrides (optional — falls back to auto-calculated) */
  dark_background: string;
  dark_card: string;
  dark_border: string;

  /* Typography */
  font_heading: string;
  font_body: string;
  base_font_size: string;

  /* Layout */
  border_radius: string;
  sidebar_width: string;

  /* CTA / Buttons */
  cta_style: "solid" | "gradient";
  button_radius: string;

  /* Features */
  referral_enabled: boolean;
}

const DEFAULT_CONFIG: SiteConfig = {
  site_name: "AlphoGen",
  logo_url: "",
  color_primary: "239 84% 67%",
  color_background: "220 20% 97%",
  color_card: "0 0% 100%",
  color_border: "220 13% 89%",
  color_accent: "239 84% 67%",
  color_destructive: "0 84% 60%",
  color_muted: "220 14% 93%",
  color_muted_foreground: "220 9% 46%",
  dark_background: "224 18% 10%",
  dark_card: "224 16% 13%",
  dark_border: "224 14% 20%",
  font_heading: "Inter",
  font_body: "Inter",
  base_font_size: "16px",
  border_radius: "0.75rem",
  sidebar_width: "16rem",
  cta_style: "solid",
  button_radius: "0.75rem",
  referral_enabled: false,
};

// ── GET (public — no admin check needed) ─────────────────────
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("site_config")
      .select("config")
      .eq("id", 1)
      .single();

    if (error || !data) {
      // Return defaults if table doesn't exist or row missing
      return NextResponse.json(DEFAULT_CONFIG, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      });
    }

    // Merge with defaults so new keys always exist
    const merged = { ...DEFAULT_CONFIG, ...data.config };
    return NextResponse.json(merged, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

// ── PUT (admin only) ─────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const config: SiteConfig = { ...DEFAULT_CONFIG, ...body };

    const supabase = createServiceClient();

    // Upsert: insert id=1 or update if exists
    const { error } = await supabase
      .from("site_config")
      .upsert(
        {
          id: 1,
          config,
          updated_at: new Date().toISOString(),
          updated_by: auth.user.email,
        },
        { onConflict: "id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
