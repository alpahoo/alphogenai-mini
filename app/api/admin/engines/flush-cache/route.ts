import { NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";

/**
 * POST /api/admin/engines/flush-cache
 *
 * Invalidates the Modal side in-memory cache for engine registry and costs.
 *
 * Works by calling a Modal HTTP endpoint that calls invalidate_cache() on both
 * `modal_app.engines.registry` and `modal_app.utils.costs`.
 *
 * If no Modal endpoint is configured, returns a success response noting that
 * changes will take effect within 5 minutes (cache TTL).
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const modalCacheEndpoint = process.env.MODAL_FLUSH_CACHE_URL;

  if (!modalCacheEndpoint) {
    return NextResponse.json({
      success: true,
      message:
        "Cache will refresh within 5 minutes (TTL). Set MODAL_FLUSH_CACHE_URL env var for immediate invalidation.",
    });
  }

  try {
    const res = await fetch(modalCacheEndpoint, {
      method: "POST",
      headers: {
        "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        message: `Modal returned ${res.status}. Cache will refresh within 5 minutes.`,
      });
    }

    console.log(`[admin] Engine cache flushed by ${auth.user.email}`);
    return NextResponse.json({
      success: true,
      message: "Cache flushed — new config active immediately",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      message: `Flush failed (${msg}). Cache will refresh within 5 minutes.`,
    });
  }
}
