import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { buildExplainerStoryboard } from '@/lib/explainer/storyboard';
import { triggerRenderExplainer } from '@/lib/modal-client';

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

/**
 * POST /api/research/jobs/[id]/explainer
 * Render a code-based explainer video (slides + Kokoro voice, ~cents) from this
 * research job's approved storyboard — the explainer render path, parallel to
 * "Send to Director" (generative). Creates a `jobs` row and fires the Modal
 * render; the result lands in Library when done.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    const supabase = getSupabaseService();

    // Research job (ownership-checked)
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('id, user_id, input_url, topic')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (jobError || !job) {
      return NextResponse.json({ error: 'Research job not found' }, { status: 404 });
    }

    // Latest storyboard for the job
    const { data: sb } = await supabase
      .from('research_storyboards')
      .select('scenes_json')
      .eq('research_job_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ scenes_json: unknown }>();

    const rawScenes = Array.isArray(sb?.scenes_json) ? sb!.scenes_json : [];
    if (rawScenes.length === 0) {
      return NextResponse.json(
        { error: 'Generate and approve a storyboard before rendering an explainer.' },
        { status: 400 },
      );
    }

    const storyboard = buildExplainerStoryboard(
      { input_url: job.input_url, topic: job.topic },
      rawScenes,
    );
    const totalDuration = Math.round(
      storyboard.scenes.reduce((acc, s) => acc + (s.duration_sec || 0), 0),
    );

    // Create the job row directly (NOT via the generative POST /api/jobs, so the
    // generative Modal/EvoLink dispatch is never triggered).
    const { data: created, error: insertError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        prompt: (job.topic || 'Explainer').slice(0, 2000),
        status: 'in_progress',
        current_stage: 'rendering_explainer',
        engine_used: 'explainer',
        target_duration_seconds: totalDuration || 30,
        metadata: { research_job_id: id, render_mode: 'explainer' },
      })
      .select('id')
      .single();
    if (insertError || !created) {
      console.error('explainer job insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create explainer job' }, { status: 500 });
    }

    // Fire-and-forget Modal render. On trigger failure, mark the job failed.
    try {
      await triggerRenderExplainer(created.id, {
        storyboard,
        brand: storyboard.meta.brand as unknown as Record<string, unknown>,
        product_url: storyboard.meta.brand.product_url || null,
      });
    } catch (err) {
      await supabase
        .from('jobs')
        .update({ status: 'failed', current_stage: 'failed', error_message: String(err).slice(0, 400) })
        .eq('id', created.id);
      return NextResponse.json(
        { error: 'Could not start the explainer render', detail: String(err).slice(0, 200) },
        { status: 502 },
      );
    }

    return NextResponse.json({ job_id: created.id, status: 'in_progress', scenes: storyboard.scenes.length });
  } catch (err) {
    console.error('POST /api/research/jobs/[id]/explainer:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
