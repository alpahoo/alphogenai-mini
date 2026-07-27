import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createProductFromUrl,
  createVideoFromProduct,
  listCustomAvatars,
  listCustomVoices,
  listPhotoAvatars,
  listPublicAvatars,
  listVoices,
  type JoggAvatar,
} from "@/lib/jogg-client";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import {
  NATIVE_PRODUCT_AD_ENGINE,
  NATIVE_PRODUCT_AD_SECONDS,
  readProductPageBrief,
  writeNativeProductAdScript,
  type NativeProductAdFormat,
  type NativeProductAdLanguage,
  type NativeProductAdStyle,
} from "@/lib/native-product-ad";
import {
  DEFAULT_NATIVE_PRODUCT_AD_VOICE,
  NATIVE_PRODUCT_AD_VOICES,
  isNativeProductAdVoice,
} from "@/lib/native-product-ad-voices";
import {
  NATIVE_PRESENTER_ANIMATION_BUCKET,
  NATIVE_PRESENTER_ANIMATION_VERSION,
} from "@/lib/video-presenter-native-animation";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";
import { startNativePresenterAnimation } from "@/lib/video-presenter-native-animation-provider";
import { triggerRenderNativeProductAd } from "@/lib/modal-client";

// Product Ad customization — allowed values (validated server-side).
const FORMATS: Record<string, string> = { portrait: "9:16", square: "1:1", landscape: "16:9" };
const LENGTHS = new Set(["15", "30", "60"]);
// Script tones proven to work with the pipeline (auto-copy styles).
const STYLES = new Set(["Discovery", "Storytime"]);
const LANGUAGES = new Set(["french", "english"]);

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
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function submitNativeProductAd(
  service: ReturnType<typeof createServiceClient>,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const nativeBaseId =
    typeof body.nativeBaseId === "string" && UUID_RE.test(body.nativeBaseId)
      ? body.nativeBaseId
      : "";
  const format: NativeProductAdFormat =
    typeof body.format === "string" && FORMATS[body.format]
      ? body.format as NativeProductAdFormat
      : "portrait";
  const style: NativeProductAdStyle =
    typeof body.style === "string" && STYLES.has(body.style)
      ? body.style as NativeProductAdStyle
      : "Discovery";
  const language: NativeProductAdLanguage =
    typeof body.language === "string" && LANGUAGES.has(body.language)
      ? body.language as NativeProductAdLanguage
      : "french";
  if (body.voiceId !== undefined && !isNativeProductAdVoice(body.voiceId)) {
    return NextResponse.json({ error: "Choose an available native voice." }, { status: 400 });
  }
  const voiceId = isNativeProductAdVoice(body.voiceId)
    ? body.voiceId
    : DEFAULT_NATIVE_PRODUCT_AD_VOICE;
  const voiceProfile =
    NATIVE_PRODUCT_AD_VOICES.find((voice) => voice.id === voiceId)?.label
    ?? "Native presenter";

  if (!/^https?:\/\/.+\..+/.test(url) || url.length > 2000) {
    return NextResponse.json({ error: "A valid product URL is required." }, { status: 400 });
  }
  if (!nativeBaseId) {
    return NextResponse.json(
      { error: "Choose a ready reusable performance clip." },
      { status: 400 },
    );
  }
  if (!isTTSAvailable()) {
    return NextResponse.json(
      { error: "Native Product Ad voice generation is not configured." },
      { status: 503 },
    );
  }

  const { data: nativeBase, error: baseError } = await service
    .from("user_presenter_native_bases")
    .select("id,user_id,status,normalized_video_path")
    .eq("id", nativeBaseId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (baseError) {
    return NextResponse.json({ error: "Could not load the presenter." }, { status: 500 });
  }
  if (!nativeBase || nativeBase.status !== "ready" || !nativeBase.normalized_video_path) {
    return NextResponse.json(
      { error: "The reusable performance clip is still being prepared." },
      { status: 409 },
    );
  }

  // Reserve the product job before any paid/network generation so every
  // attempt remains observable and recoverable.
  const initialState = {
    engine: NATIVE_PRODUCT_AD_ENGINE,
    capability: "native_product_ad",
    url,
    style,
    format,
    language,
    native_base_id: nativeBaseId,
    voice_profile: voiceProfile,
    duration_seconds: NATIVE_PRODUCT_AD_SECONDS,
    submitted_by: user.email ?? null,
  };
  const { data: job, error: jobError } = await service
    .from("jobs")
    .insert({
      user_id: user.id,
      prompt: url,
      status: "in_progress",
      engine_used: NATIVE_PRODUCT_AD_ENGINE,
      current_stage: "native_scripting",
      aspect_ratio: FORMATS[format],
      target_duration_seconds: NATIVE_PRODUCT_AD_SECONDS,
      app_state: initialState,
    })
    .select("id,status,created_at")
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Could not reserve the Product Ad." }, { status: 500 });
  }

  const fail = async (stage: string, error: unknown) => {
    console.error(`[native-product-ad] ${stage} failed (job=${job.id}):`, error);
    await service
      .from("jobs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_message: "Native Product Ad creation could not be completed. You can retry.",
      })
      .eq("id", job.id);
  };

  try {
    const brief = await readProductPageBrief(url);
    const script = await writeNativeProductAdScript({ brief, language, style });
    await service
      .from("jobs")
      .update({
        current_stage: "native_speech",
        voiceover_text: script,
        app_state: {
          ...initialState,
          script,
          product: brief,
        },
      })
      .eq("id", job.id);

    const tts = await generateVoiceover({
      text: script,
      voice: voiceId,
      format: "mp3",
    });
    const audioBytes = Buffer.from(tts.audio);
    const audioSha256 = createHash("sha256").update(audioBytes).digest("hex");

    const { data: existing, error: existingError } = await service
      .from("user_presenter_native_animations")
      .select(
        "id,status,audio_path,output_video_path,provider_task_id,output_duration_seconds",
      )
      .eq("user_id", user.id)
      .eq("native_base_id", nativeBaseId)
      .eq("audio_sha256", audioSha256)
      .eq("animation_version", NATIVE_PRESENTER_ANIMATION_VERSION)
      .neq("status", "removed")
      .maybeSingle();
    if (existingError) throw new Error("animation_cache_read_failed");

    let animation = existing;
    if (!animation) {
      const animationId = randomUUID();
      const audioPath = `${user.id}/${animationId}/speech.mp3`;
      const outputPath = `${user.id}/${animationId}/animated.mp4`;
      const { data: inserted, error: insertError } = await service
        .from("user_presenter_native_animations")
        .insert({
          id: animationId,
          user_id: user.id,
          native_base_id: nativeBaseId,
          audio_path: audioPath,
          audio_mime: "audio/mpeg",
          audio_size_bytes: audioBytes.byteLength,
          audio_sha256: audioSha256,
          output_video_path: outputPath,
          status: "uploaded",
          animation_version: NATIVE_PRESENTER_ANIMATION_VERSION,
        })
        .select(
          "id,status,audio_path,output_video_path,provider_task_id,output_duration_seconds",
        )
        .single();
      if (insertError || !inserted) throw new Error("animation_insert_failed");
      animation = inserted;
    }

    const stateWithAnimation = {
      ...initialState,
      script,
      product: brief,
      animation_id: animation.id,
    };
    if (animation.status === "ready") {
      await service
        .from("jobs")
        .update({
          current_stage: "native_rendering",
          app_state: stateWithAnimation,
        })
        .eq("id", job.id);
      await triggerRenderNativeProductAd(job.id);
      return NextResponse.json({
        jobId: job.id,
        status: "in_progress",
        stage: "native_rendering",
        reusedAnimation: true,
      });
    }

    if (animation.status !== "processing" || !animation.provider_task_id) {
      // Repair interrupted retries as well as fresh rows. An earlier attempt
      // may have reserved the cache row before its private audio upload
      // completed, so always make the current deterministic audio available
      // before signing it for the animation provider.
      const { error: audioRepairError } = await service.storage
        .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
        .upload(animation.audio_path, audioBytes, {
          contentType: "audio/mpeg",
          upsert: true,
        });
      if (audioRepairError) throw new Error("animation_audio_upload_failed");

      const [videoSigned, audioSigned] = await Promise.all([
        service.storage
          .from(NATIVE_PRESENTER_BASE_BUCKET)
          .createSignedUrl(nativeBase.normalized_video_path, 15 * 60),
        service.storage
          .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
          .createSignedUrl(animation.audio_path, 15 * 60),
      ]);
      if (
        videoSigned.error
        || audioSigned.error
        || !videoSigned.data?.signedUrl
        || !audioSigned.data?.signedUrl
      ) {
        throw new Error("private_media_sign_failed");
      }
      const { error: claimError } = await service
        .from("user_presenter_native_animations")
        .update({
          status: "processing",
          provider_task_id: null,
          error_code: null,
          started_at: new Date().toISOString(),
        })
        .eq("id", animation.id)
        .eq("user_id", user.id);
      if (claimError) throw new Error("animation_claim_failed");
      const taskId = await startNativePresenterAnimation({
        videoUrl: videoSigned.data.signedUrl,
        audioUrl: audioSigned.data.signedUrl,
        outputPath: animation.output_video_path!,
      });
      const { error: taskSaveError } = await service
        .from("user_presenter_native_animations")
        .update({ status: "processing", provider_task_id: taskId, error_code: null })
        .eq("id", animation.id)
        .eq("user_id", user.id);
      if (taskSaveError) throw new Error("animation_task_save_failed");
    }

    await service
      .from("jobs")
      .update({
        current_stage: "native_animating",
        app_state: stateWithAnimation,
      })
      .eq("id", job.id);
    return NextResponse.json({
      jobId: job.id,
      status: "in_progress",
      stage: "native_animating",
      reusedAnimation: Boolean(existing),
    });
  } catch (error) {
    await fail("submit", error);
    return NextResponse.json(
      {
        jobId: job.id,
        error: "Native Product Ad creation could not be started. The job was saved for retry.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const service = createServiceClient();

  if (action === "submit_native") {
    return submitNativeProductAd(
      service,
      { id: auth.user.id, email: auth.user.email },
      body as Record<string, unknown>,
    );
  }

  if (action === "submit") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const style = STYLES.has(body.style) ? body.style : "Discovery";
    const format = typeof body.format === "string" && FORMATS[body.format] ? body.format : "portrait";
    const length = LENGTHS.has(String(body.length)) ? String(body.length) : "30";
    const language = LANGUAGES.has(body.language) ? body.language : "french";
    let avatarId =
      Number.isFinite(Number(body.avatarId)) && Number(body.avatarId) > 0
        ? Number(body.avatarId)
        : undefined;
    let avatarType: 0 | 1 = body.avatarType === 1 ? 1 : 0;
    const rawPresenterId =
      typeof body.presenterId === "string" && body.presenterId.length <= 100
        ? body.presenterId.trim()
        : "";
    const presenterId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawPresenterId,
    )
      ? rawPresenterId
      : "";
    if (rawPresenterId && !presenterId) {
      return NextResponse.json({ error: "Invalid presenter." }, { status: 400 });
    }
    const voiceId =
      typeof body.voiceId === "string" && body.voiceId.trim().length <= 200
        ? body.voiceId.trim() || undefined
        : undefined;
    if (!/^https?:\/\/.+\..+/.test(url) || url.length > 2000) {
      return NextResponse.json({ error: "url produit valide requise (http/https)" }, { status: 400 });
    }

    // An account presenter is resolved server-side so a caller cannot submit
    // another user's avatar id or an unfinished presenter.
    if (presenterId) {
      const { data: presenter, error: presenterError } = await service
        .from("user_presenters")
        .select("external_avatar_id, status")
        .eq("id", presenterId)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (presenterError) {
        return NextResponse.json({ error: "Could not validate the presenter." }, { status: 500 });
      }
      const resolvedId = Number(presenter?.external_avatar_id);
      if (
        !presenter ||
        presenter.status !== "ready" ||
        !Number.isFinite(resolvedId) ||
        resolvedId <= 0
      ) {
        return NextResponse.json({ error: "Presenter is not ready." }, { status: 400 });
      }
      avatarId = resolvedId;
      avatarType = 1;
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
      productVideoId = await createVideoFromProduct({
        productId,
        style,
        aspectRatio: format,
        length,
        language,
        ...(avatarId ? { avatarId, avatarType } : {}),
        ...(voiceId ? { voiceId } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[url-to-video] submit failed:", msg);
      if (/aspect_ratio is inconsistent/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              "The selected presenter does not support this video format. Choose Automatic or a matching presenter.",
            errorCode: "presenter_format_mismatch",
          },
          { status: 400 },
        );
      }
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
        aspect_ratio: FORMATS[format],
        app_state: {
          engine: ENGINE,
          capability: CAPABILITY,
          url,
          style,
          format,
          length,
          language,
          ...(avatarId ? { avatar_id: avatarId, avatar_type: avatarType } : {}),
          ...(presenterId ? { presenter_id: presenterId } : {}),
          ...(voiceId ? { voice_id: voiceId } : {}),
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
  return NextResponse.json(
    { error: "action inconnue (submit|submit_native|status)" },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const service = createServiceClient();
  const params = new URL(request.url).searchParams;

  // Curated resources for the Product Ad customization step. This endpoint is
  // admin-only while the workflow is in private beta, so account-owned custom
  // avatars are never exposed to public users.
  if (["avatars", "resources"].includes(params.get("action") ?? "")) {
    try {
      const [publicResult, customResult, photoResult, customVoiceResult, voiceResult] = await Promise.allSettled([
        listPublicAvatars(),
        listCustomAvatars(),
        listPhotoAvatars(),
        listCustomVoices(),
        listVoices(),
      ]);
      const publicAvatars = publicResult.status === "fulfilled" ? publicResult.value.slice(0, 12) : [];
      const ownedAvatars = [
        ...(customResult.status === "fulfilled" ? customResult.value : []),
        ...(photoResult.status === "fulfilled" ? photoResult.value : []),
      ];
      const seen = new Set<string>();
      const avatars = [...ownedAvatars, ...publicAvatars]
        .filter((avatar: JoggAvatar) => {
          const key = `${avatar.type}:${avatar.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 36);
      const customVoices = customVoiceResult.status === "fulfilled" ? customVoiceResult.value : [];
      const publicVoices = voiceResult.status === "fulfilled" ? voiceResult.value : [];
      const seenVoiceIds = new Set<string>();
      const seenCustomNames = new Set<string>();
      const voices = [...customVoices, ...publicVoices].filter((voice) => {
        if (seenVoiceIds.has(voice.id)) return false;
        seenVoiceIds.add(voice.id);
        if (voice.kind !== "custom") return true;
        const name = voice.name.trim().toLocaleLowerCase();
        if (seenCustomNames.has(name)) return false;
        seenCustomNames.add(name);
        return true;
      });
      return NextResponse.json({ avatars, voices });
    } catch (e) {
      console.error("[url-to-video] resource catalog failed:", e);
      return NextResponse.json(
        { error: "Could not load customization options.", avatars: [], voices: [] },
        { status: 502 },
      );
    }
  }

  const id = params.get("id");
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
