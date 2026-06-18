import { NextResponse } from "next/server";
import { EVOLINK_ENGINES } from "@/lib/evolink-client";
import { BAILIAN_ENGINES } from "@/lib/bailian-client";
import { BYTEPLUS_ENGINES } from "@/lib/byteplus-client";
import { ATLAS_ENGINES } from "@/lib/atlascloud-client";
import { HEYGEN_ENGINE, HEYGEN_SHOTS_ENGINE } from "@/lib/heygen-client";
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

  // LTX-2.3 (Modal H100, FP8, scale-to-zero) — Pro/Premium. I2V if an image is
  // provided, else T2V. Native audio embedded. Toggle independent from "modal".
  if (isProviderEnabled("ltx")) {
    engines.push({
      key: "ltx_2_3",
      label: "LTX-2.3",
      desc: "GPU H100 · I2V/T2V · audio natif · 5s",
      gate: "pro",
      supportsRefs: false,
      supportsI2v: true,
      maxDuration: 5,
      minDuration: null,
      quality: "768p",
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

  // BytePlus Seedance 2.0 (direct from ByteDance) — requires BYTEPLUS_ARK_API_KEY.
  // Same model EvoLink resells, billed directly (no markup), with multimodal
  // references + native audio (multi-character speaking scenes).
  if (process.env.BYTEPLUS_ARK_API_KEY) {
    for (const [key, cfg] of Object.entries(BYTEPLUS_ENGINES)) {
      engines.push({
        key,
        label: cfg.label,
        desc: "Direct ByteDance · multimodal refs · native audio",
        gate: "premium",
        supportsRefs: true,
        supportsI2v: true,
        maxDuration: cfg.maxDuration,
        minDuration: null,
        quality: cfg.resolution,
      });
    }
  }

  // Atlas Cloud Seedance 2.0 — requires ATLASCLOUD_API_KEY. Same model EvoLink
  // resells, ~5x cheaper, multimodal refs + native audio.
  if (process.env.ATLASCLOUD_API_KEY) {
    for (const [key, cfg] of Object.entries(ATLAS_ENGINES)) {
      engines.push({
        key,
        label: cfg.label,
        desc: "ByteDance Seedance · ~$0.096/s · multimodal refs · native audio",
        gate: "premium",
        supportsRefs: true,
        supportsI2v: true,
        maxDuration: cfg.maxDuration,
        minDuration: null,
        quality: cfg.resolution,
      });
    }
  }

  // HeyGen Avatar engines (requires HEYGEN_API_KEY + admin toggle enabled)
  if (process.env.HEYGEN_API_KEY && isProviderEnabled("heygen")) {
    for (const cfg of [HEYGEN_ENGINE, HEYGEN_SHOTS_ENGINE]) {
      engines.push({
        key: cfg.key,
        label: cfg.label,
        desc: cfg.desc,
        gate: cfg.gate,
        supportsRefs: cfg.supportsRefs,
        supportsI2v: cfg.supportsI2v,
        maxDuration: cfg.maxDuration,
        minDuration: cfg.minDuration,
        quality: cfg.quality,
      });
    }
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
