import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildScriptPrompt,
  parseScriptResponse,
  validateAndTruncateScript,
  normalizeSections,
  normalizeScenes,
  normalizeSubscores,
  computeQualityScore,
} from '@/lib/research/script';
import { callLLMForScript } from '@/lib/research/script-llm';
import { planCinematicScenes } from '@/lib/research/cinematic-planner';

const RESEARCH_LLM_TIMEOUT_MS = 90000;

function getSupabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getSupabaseAuth() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function failJob(id: string, userId: string, message: string) {
  await getSupabaseService()
    .from('research_jobs')
    .update({ status: 'failed', error_step: 'scripting', error_message: message })
    .eq('id', id)
    .eq('user_id', userId);
}

/**
 * POST /api/research/jobs/[id]/script
 * Generate one research_script + one research_storyboard from the selected angle.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await getSupabaseAuth().auth.getUser(
      authHeader.substring(7),
    );
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // Optional explicit angle_id
    let bodyAngleId: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.angle_id === 'string') {
        bodyAngleId = body.angle_id;
      }
    } catch {
      // empty / non-JSON body is allowed
    }

    // Fetch job with ownership check
    const { data: job, error: fetchError } = await getSupabaseService()
      .from('research_jobs')
      .select()
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      console.error('DB error:', fetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Status gate
    const allowedStatuses = ['ready_for_angles', 'scripting', 'failed'];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot generate a script for job in status: ${job.status}` },
        { status: 400 },
      );
    }

    // Resolve target angle
    let angle: { id: string; title: string; hook: string; positioning: string | null } | null = null;

    if (bodyAngleId) {
      const { data: explicit, error: angleError } = await getSupabaseService()
        .from('research_angles')
        .select('id, title, hook, positioning')
        .eq('id', bodyAngleId)
        .eq('research_job_id', id)
        .single();

      if (angleError || !explicit) {
        return NextResponse.json(
          { error: 'Angle not found for this job' },
          { status: 404 },
        );
      }
      angle = explicit;
    } else {
      const { data: selected, error: selectedError } = await getSupabaseService()
        .from('research_angles')
        .select('id, title, hook, positioning')
        .eq('research_job_id', id)
        .eq('selected', true);

      if (selectedError) {
        console.error('DB error:', selectedError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      const rows = Array.isArray(selected) ? selected : [];
      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'No selected angle. Select an angle or pass angle_id.' },
          { status: 422 },
        );
      }
      if (rows.length > 1) {
        return NextResponse.json(
          { error: 'Multiple selected angles. Pass an explicit angle_id.' },
          { status: 409 },
        );
      }
      angle = rows[0];
    }

    // Fetch extracted sources for prompt context (lenient: empty is allowed).
    // url + source_type feed the cinematic planner's conservative asset policy.
    const { data: sources } = await getSupabaseService()
      .from('research_sources')
      .select('title, url, source_type, extracted_markdown')
      .eq('research_job_id', id)
      .eq('extraction_status', 'success')
      .not('extracted_markdown', 'is', null)
      .limit(5);

    const sourceSummaries = (sources || []).map(
      (s) => `${s.title}\n${s.extracted_markdown}`,
    );

    // Move job to scripting (clear any prior failure markers)
    await getSupabaseService()
      .from('research_jobs')
      .update({ status: 'scripting', error_step: null, error_message: null })
      .eq('id', id)
      .eq('user_id', userId);

    // Generate via LLM
    const prompt = buildScriptPrompt(job.topic, job.mode, angle, sourceSummaries);
    const llm = await callLLMForScript(prompt, RESEARCH_LLM_TIMEOUT_MS);

    if (llm.error) {
      await failJob(id, userId, llm.error);
      return NextResponse.json(
        { id, status: 'failed', error_message: llm.error },
        { status: 500 },
      );
    }

    const parsed = parseScriptResponse(llm.content);
    if (!parsed) {
      await failJob(id, userId, 'Invalid script format from LLM');
      return NextResponse.json(
        { id, status: 'failed', error_message: 'Invalid script format from LLM' },
        { status: 500 },
      );
    }

    const scriptText = validateAndTruncateScript(parsed.script);
    if (!scriptText) {
      await failJob(id, userId, 'Generated script too short');
      return NextResponse.json(
        { id, status: 'failed', error_message: 'Generated script too short' },
        { status: 500 },
      );
    }

    const scenes = normalizeScenes(parsed.scenes);
    if (scenes.length === 0) {
      await failJob(id, userId, 'No valid storyboard scenes generated');
      return NextResponse.json(
        { id, status: 'failed', error_message: 'No valid storyboard scenes generated' },
        { status: 500 },
      );
    }

    // T-1109c: enrich the validated scenes into a Director-grade cinematic plan.
    // Filter raw scenes with the same validity predicate as normalizeScenes so the
    // planner keeps parity with the gate while still seeing the LLM cinematic hints.
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const validRawScenes = rawScenes.filter((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
      const s = raw as Record<string, unknown>;
      const t = (typeof s.title === 'string' ? s.title : typeof s.role === 'string' ? s.role : '').trim();
      const p = typeof s.prompt === 'string' ? s.prompt.trim() : '';
      return Boolean(t && p);
    });
    const plannerSources = (sources || []).map((s) => {
      const row = s as { title?: unknown; url?: unknown; source_type?: unknown; extracted_markdown?: unknown };
      return {
        title: row.title,
        url: row.url,
        source_type: row.source_type,
        extracted_markdown: row.extracted_markdown,
      };
    });
    const cinematicScenes = planCinematicScenes({
      topic: job.topic,
      mode: job.mode,
      language: job.language,
      targetDurationSeconds: job.target_duration_seconds ?? null,
      angle: { title: angle.title, hook: angle.hook, positioning: angle.positioning },
      script: scriptText,
      scenes: validRawScenes,
      sources: plannerSources,
    });
    // Director-compatible (title/prompt/duration_sec preserved). Fall back to the
    // plain normalized scenes if enrichment somehow yields nothing.
    const storyboardScenes = cinematicScenes.length > 0 ? cinematicScenes : scenes;

    const sections = normalizeSections(parsed.sections);
    const subscores = normalizeSubscores(parsed.subscores);
    const qualityScore = computeQualityScore(parsed.subscores);

    // Insert script
    const { data: insertedScript, error: scriptInsertError } = await getSupabaseService()
      .from('research_scripts')
      .insert({
        research_job_id: id,
        angle_id: angle.id,
        script: scriptText,
        sections_json: sections,
        quality_score: qualityScore,
        hook_strength: subscores.hook_strength,
        source_coverage: subscores.source_coverage,
        clarity: subscores.clarity,
        originality: subscores.originality,
        risk_disclosure: subscores.risk_disclosure,
        rhythm_fit: subscores.rhythm_fit,
        duration_fit: subscores.duration_fit,
        approved: false,
        model_used: llm.modelUsed,
        tokens_used: llm.tokensUsed,
      })
      .select('id')
      .single();

    if (scriptInsertError || !insertedScript) {
      console.error('DB insert script error:', scriptInsertError);
      await failJob(id, userId, 'Failed to store script');
      return NextResponse.json({ error: 'Failed to store script' }, { status: 500 });
    }

    const scriptId = insertedScript.id;

    // Insert storyboard
    const { data: insertedStoryboard, error: storyboardInsertError } = await getSupabaseService()
      .from('research_storyboards')
      .insert({
        research_job_id: id,
        script_id: scriptId,
        scenes_json: storyboardScenes,
      })
      .select('id')
      .single();

    if (storyboardInsertError || !insertedStoryboard) {
      console.error('DB insert storyboard error:', storyboardInsertError);
      await failJob(id, userId, 'Failed to store storyboard');
      return NextResponse.json({ error: 'Failed to store storyboard' }, { status: 500 });
    }

    // Success: job stays 'scripting' (script generated, approved=false, awaits approval)
    return NextResponse.json({
      id,
      status: 'scripting',
      script_id: scriptId,
      storyboard_id: insertedStoryboard.id,
      scenes_count: scenes.length,
      quality_score: qualityScore,
      error_message: null,
    });
  } catch (err) {
    console.error('POST /api/research/jobs/[id]/script:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
