import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * VEED WEB MVP — file de jobs minimale (bêta fermée, admin only). Pas d'UI publique.
 *
 * Réutilise la table `jobs` EXISTANTE (aucune nouvelle table) :
 *   - prompt      = le script parlé
 *   - status      = pending -> in_progress -> done | failed
 *   - app_state   = { engine:'veed_web', capability:'veed_ai_studio_talking_head',
 *                     format, + métriques écrites par le worker local }
 *   - final_url / video_url = URL R2 du MP4
 *
 * Le worker LOCAL (workers/veed_web/veed_web_worker.py) poll les jobs pending
 * `engine=veed_web`, pilote le navigateur authentifié, télécharge le MP4 et
 * écrit le résultat ici. Cette route NE pilote PAS le navigateur (Vercel ≠ machine
 * avec la session VEED). Concurrence/plafond réels = imposés par le worker.
 *
 * Actions :
 *   POST { action:'submit', script, format? }   -> crée un job (plafond 3/jour)
 *   POST { action:'status', jobId }             -> statut + métriques + R2
 *   GET  ?id=<jobId>                            -> idem status
 *   GET                                         -> liste des derniers jobs veed_web
 */
export const maxDuration = 30;

const ENGINE = "veed_web";
const CAPABILITY = "veed_ai_studio_talking_head";
const DAILY_CAP = 3;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const service = createServiceClient();

  if (action === "submit") {
    const script = typeof body.script === "string" ? body.script.trim() : "";
    const format = typeof body.format === "string" ? body.format : "portrait";
    if (script.length < 5 || script.length > 2000) {
      return NextResponse.json({ error: "script requis (5..2000 caractères)" }, { status: 400 });
    }
    if (format !== "portrait") {
      return NextResponse.json(
        { error: "format non validé pour la bêta fermée (portrait uniquement)" },
        { status: 400 },
      );
    }
    // Plafond 3/jour (jobs veed_web créés aujourd'hui, hors cancelled).
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { data: today, error: capError } = await service
      .from("jobs").select("id, app_state, created_at, status")
      .gte("created_at", since.toISOString());
    if (capError) return NextResponse.json({ error: capError.message }, { status: 500 });
    const veedToday = (today || []).filter(
      (j) => (j.app_state as { engine?: string } | null)?.engine === ENGINE && j.status !== "cancelled",
    );
    if (veedToday.length >= DAILY_CAP) {
      return NextResponse.json(
        { error: `plafond quotidien atteint (${veedToday.length}/${DAILY_CAP})`, dailyCap: DAILY_CAP },
        { status: 429 },
      );
    }
    const { data, error } = await service
      .from("jobs")
      .insert({
        user_id: auth.user.id,
        prompt: script,
        status: "pending",
        current_stage: "veed_queued",
        app_state: { engine: ENGINE, capability: CAPABILITY, format, submitted_by: auth.user.email },
      })
      .select("id, status, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobId: data.id, status: data.status, dailyUsed: veedToday.length + 1, dailyCap: DAILY_CAP });
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
    .eq("app_state->>engine", ENGINE)
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
    .select("id, status, current_stage, final_url, video_url, error_message, app_state, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "job introuvable" }, { status: 404 });
  const st = (data.app_state as Record<string, unknown> | null) || {};
  if (st.engine !== ENGINE) return NextResponse.json({ error: "job introuvable" }, { status: 404 });
  return NextResponse.json({
    jobId: data.id,
    status: data.status,
    stage: data.current_stage,
    r2Url: data.final_url,
    error: data.error_message,
    capability: st.capability ?? CAPABILITY,
    metrics: {
      format: st.requested_format ?? st.format,
      avatar: st.avatar,
      mode: st.mode_or_model,
      creditsBefore: st.credits_before,
      creditsAfter: st.credits_after,
      renderSeconds: st.render_seconds,
      totalSeconds: st.total_seconds,
      ffprobe: st.ffprobe,
      captchaOrQuota: st.captcha_or_quota,
      statusDetail: st.status_detail,
    },
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
