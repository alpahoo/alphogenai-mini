import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { createProductFromUrl, createVideoFromProduct } from "@/lib/jogg-client";

/**
 * URL → VIDEO V1 — file de jobs minimale (bêta fermée, admin only). Pas d'UI publique.
 *
 * Provider interne : Jogg (jamais exposé côté UI publique — label produit « URL to Video »).
 * Réutilise la table `jobs` EXISTANTE (aucune nouvelle table) :
 *   - engine_used       = 'jogg'
 *   - external_task_id  = product_video_id Jogg (idempotence : 1 job = 1 vidéo)
 *   - status            = pending -> done | failed  (avancé par le cron jogg-poll)
 *   - prompt            = l'URL produit soumise
 *   - app_state         = { engine:'jogg', capability:'url_to_video', url, style, format, submitted_by }
 *   - final_url/video_url = URL R2 du MP4 (écrite par le cron)
 *
 * Cette route lance l'analyse URL + la génération, puis rend la main. Le rendu
 * (async) est récupéré par GET /api/cron/jogg-poll (pas de webhook joignable côté Jogg).
 *
 * Budget-guard MAISON (remaining_quota Jogg non fiable) : plafond quotidien de submits.
 *
 * Actions :
 *   POST { action:'submit', url, style?, format? }  -> crée un job (plafond DAILY_CAP/jour)
 *   POST { action:'status', jobId }                 -> statut + R2
 *   GET  ?id=<jobId>                                -> idem status
 *   GET                                             -> liste des derniers jobs jogg
 */
export const maxDuration = 60; // l'analyse URL Jogg peut prendre ~10-30s

const ENGINE = "jogg";
const CAPABILITY = "url_to_video";
const DAILY_CAP = 20;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const service = createServiceClient();

  if (action === "submit") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const style = typeof body.style === "string" && body.style.trim() ? body.style.trim() : "Discovery";
    const format = typeof body.format === "string" ? body.format : "portrait";
    if (!/^https?:\/\/.+\..+/.test(url) || url.length > 2000) {
      return NextResponse.json({ error: "url produit valide requise (http/https)" }, { status: 400 });
    }
    if (format !== "portrait") {
      return NextResponse.json(
        { error: "format non validé pour la bêta fermée (portrait uniquement)" },
        { status: 400 },
      );
    }

    // Budget-guard maison : plafond DAILY_CAP/jour (jobs jogg créés aujourd'hui, hors failed).
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { data: today, error: capError } = await service
      .from("jobs")
      .select("id, engine_used, status, created_at")
      .eq("engine_used", ENGINE)
      .gte("created_at", since.toISOString());
    if (capError) return NextResponse.json({ error: capError.message }, { status: 500 });
    const usedToday = (today || []).filter((j) => j.status !== "failed").length;
    if (usedToday >= DAILY_CAP) {
      return NextResponse.json(
        { error: `plafond quotidien atteint (${usedToday}/${DAILY_CAP})`, dailyCap: DAILY_CAP },
        { status: 429 },
      );
    }

    // 1) URL -> product (gratuit) ; 2) product -> video (async, ~1 crédit).
    let productVideoId: string;
    try {
      const productId = await createProductFromUrl(url);
      productVideoId = await createVideoFromProduct({ productId, style, aspectRatio: format });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[url-to-video] submit failed:", msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const { data, error } = await service
      .from("jobs")
      .insert({
        user_id: auth.user.id,
        prompt: url,
        status: "pending",
        engine_used: ENGINE,
        external_task_id: productVideoId,
        current_stage: "jogg_generating",
        aspect_ratio: "9:16",
        app_state: {
          engine: ENGINE,
          capability: CAPABILITY,
          url,
          style,
          format,
          submitted_by: auth.user.email,
        },
      })
      .select("id, status, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      jobId: data.id,
      status: data.status,
      productVideoId,
      dailyUsed: usedToday + 1,
      dailyCap: DAILY_CAP,
    });
  }

  if (action === "status") {
    return statusResponse(service, body.jobId);
  }
  return NextResponse.json({ error: "action inconnue (submit|status)" }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const service = createServiceClient();
  const id = new URL(request.url).searchParams.get("id");
  if (id) return statusResponse(service, id);
  const { data, error } = await service
    .from("jobs")
    .select("id, status, current_stage, final_url, error_message, app_state, created_at, updated_at")
    .eq("engine_used", ENGINE)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ capability: CAPABILITY, dailyCap: DAILY_CAP, jobs: data || [] });
}

async function statusResponse(service: ReturnType<typeof createServiceClient>, jobId: unknown) {
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId requis" }, { status: 400 });
  }
  const { data, error } = await service
    .from("jobs")
    .select("id, status, current_stage, final_url, video_url, error_message, engine_used, app_state, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.engine_used !== ENGINE) {
    return NextResponse.json({ error: "job introuvable" }, { status: 404 });
  }
  const st = (data.app_state as Record<string, unknown> | null) || {};
  return NextResponse.json({
    jobId: data.id,
    status: data.status,
    stage: data.current_stage,
    r2Url: data.final_url,
    error: data.error_message,
    capability: st.capability ?? CAPABILITY,
    metrics: {
      url: st.url,
      style: st.style,
      format: st.format,
      genSeconds: st.gen_seconds,
      sizeBytes: st.size_bytes,
    },
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
