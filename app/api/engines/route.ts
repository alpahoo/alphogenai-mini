import { NextResponse } from "next/server";
import { EVOLINK_ENGINES } from "@/lib/evolink-client";
import { BAILIAN_ENGINES } from "@/lib/bailian-client";
import { HEYGEN_ENGINE } from "@/lib/heygen-client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/engines
 * Returns the available video generation engines for the frontend engine selector.
 *
 * Public endpoint (no auth required) — engine visibility is not sensitive.
 * Plan gating is enforced server-side in POST /api/jobs, not here.
 *
 * Response is derived from the hardcoded EVOLINK_ENGINES registry + the
 * legacy Modal engine (wan_i2v). When Phase 2 migrates to DB-driven routing,
 * this endpoint will read from the `engines` table instead.
 *
 * Cache: 5 min CDN + 1h stale-while-revalidate (engine list rarely changes).
 */

/** Engines that support multi-reference character images (UI badge only). */
const REF_SUPPORT = new Set([
  "evolink", "evolink_fast", "kling_o3",
  "wan_26_bailian", // Bailian wan2.6-r2v-flash
]);

interface EngineOption {
  key: string;
  label: string;
  desc: string;
  gate: "pro" | "premium" | null;
  supportsRefs: boolean;
  supportsI2v: boolean;
  maxDuration: number;
  minDuration: number | null;
  quality: string;
}

export async function GET() {
  const engines: EngineOption[] = [];

  // Read admin provider toggle from DB (best-effort, default enabled)
  let providerFlags: Record<string, { enabled: boolean }> = {};
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("app_settings")
      .select("value")
      .eq("key", "providers")
      .single();
    if (data?.value) {
      providerFlags = data.value as Record<string, { enabled: boolean }>;
    }
  } catch {
    // DB read failed — default to all enabled
  }

  const isProviderEnabled = (name: string) =>
    providerFlags[name]?.enabled !== false; // default true if not set

  // Legacy Modal engine (free tier default)
  if (isProviderEnabled("modal")) {
    engines.push({
      key: "wan_i2v",
      label: "Wan 2.2 I2V",
      desc: "GPU - up to 60s",
      gate: null,
      supportsRefs: false,
      supportsI2v: true,
      maxDuration: 60,
      minDuration: null,
      quality: "720p",
    });
  }

  // EvoLink engines from registry
  if (isProviderEnabled("evolink")) {
    for (const [key, cfg] of Object.entries(EVOLINK_ENGINES)) {
      const lowestPlan = cfg.plans.includes("pro")
        ? "pro"
        : cfg.plans.includes("premium")
          ? "premium"
          : null;

      engines.push({
        key,
        label: cfg.label,
        desc: cfg.desc,
        gate: lowestPlan,
        supportsRefs: REF_SUPPORT.has(key),
        supportsI2v: Boolean(cfg.imageModel),
        maxDuration: cfg.maxDuration,
        minDuration: cfg.minDuration ?? null,
        quality: cfg.quality ?? "720p",
      });
    }
  }

  // Bailian engines (requires DASHSCOPE_API_KEY + admin toggle enabled)
  if (process.env.DASHSCOPE_API_KEY && isProviderEnabled("bailian")) {
    for (const [key, cfg] of Object.entries(BAILIAN_ENGINES)) {
      const lowestPlan = cfg.plans.includes("pro")
        ? "pro"
        : cfg.plans.includes("premium")
          ? "premium"
          : null;

      engines.push({
        key,
        label: cfg.label,
        desc: cfg.desc,
        gate: lowestPlan,
        supportsRefs: REF_SUPPORT.has(key),
        supportsI2v: Boolean(cfg.imageModel),
        maxDuration: cfg.maxDuration,
        minDuration: cfg.minDuration ?? null,
        quality: cfg.quality ?? "720p",
      });
    }
  }

  // HeyGen Avatar IV (requires HEYGEN_API_KEY + admin toggle enabled)
  if (process.env.HEYGEN_API_KEY && isProviderEnabled("heygen")) {
    engines.push({
      key: HEYGEN_ENGINE.key,
      label: HEYGEN_ENGINE.label,
      desc: HEYGEN_ENGINE.desc,
      gate: HEYGEN_ENGINE.gate,
      supportsRefs: HEYGEN_ENGINE.supportsRefs,
      supportsI2v: HEYGEN_ENGINE.supportsI2v,
      maxDuration: HEYGEN_ENGINE.maxDuration,
      minDuration: HEYGEN_ENGINE.minDuration,
      quality: HEYGEN_ENGINE.quality,
    });
  }

  return NextResponse.json(
    { engines },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
