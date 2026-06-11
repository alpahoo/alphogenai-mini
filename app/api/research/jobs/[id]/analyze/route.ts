import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { generateAngles } from '@/lib/research/angles';

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
 * POST /api/research/jobs/[id]/analyze
 * Generate editorial angles from research sources via LLM
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Extract user from auth header
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

    // Check status gate (ready_for_angles or failed for recovery)
    const allowedStatuses = ['ready_for_angles', 'failed'];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot analyze job in status: ${job.status}` },
        { status: 400 },
      );
    }

    // If already analyzing, return 400
    if (job.status === 'analyzing') {
      return NextResponse.json(
        { error: 'Job is already being analyzed' },
        { status: 400 },
      );
    }

    // Fetch all sources with extraction_status = success and extracted_markdown
    const { data: sources, error: sourcesError } = await getSupabaseService()
      .from('research_sources')
      .select('url, title, extracted_markdown')
      .eq('research_job_id', id)
      .eq('extraction_status', 'success')
      .not('extracted_markdown', 'is', null)
      .limit(100);

    if (sourcesError) {
      console.error('DB fetch sources error:', sourcesError);
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
    }

    // Validate ≥1 source with extracted_markdown
    if (!sources || sources.length === 0) {
      return NextResponse.json(
        {
          id,
          status: job.status,
          angles_generated: 0,
          error_message: 'No valid sources to analyze',
        },
        { status: 422 },
      );
    }

    // Update job to scripting (during analysis)
    await getSupabaseService()
      .from('research_jobs')
      .update({ status: 'scripting' })
      .eq('id', id)
      .eq('user_id', userId);

    // Build source summaries for LLM prompt
    const sourceSummaries = sources.map(
      (src) => `${src.title}\n${src.extracted_markdown}`,
    );

    // Generate angles via LLM
    const { angles, error: llmError } = await generateAngles(
      job.topic,
      job.mode,
      sourceSummaries,
      30000,
    );

    // Handle LLM errors
    if (llmError || angles.length === 0) {
      const errorMsg = llmError || 'No valid angles generated';
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'analysis',
          error_message: errorMsg,
        })
        .eq('id', id)
        .eq('user_id', userId);

      return NextResponse.json(
        {
          id,
          status: 'failed',
          angles_generated: 0,
          error_message: errorMsg,
        },
        { status: 500 },
      );
    }

    // Validate we have at least 3 valid angles
    if (angles.length < 3) {
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'analysis',
          error_message: `Only ${angles.length} angles generated, need at least 3`,
        })
        .eq('id', id)
        .eq('user_id', userId);

      return NextResponse.json(
        {
          id,
          status: 'failed',
          angles_generated: angles.length,
          error_message: 'Insufficient valid angles generated',
        },
        { status: 500 },
      );
    }

    // Insert angles into research_angles
    // Note: research_angles keys off research_job_id only (no user_id column);
    // ownership is enforced via the research_jobs join + RLS.
    const anglesToInsert = angles.map((angle) => ({
      research_job_id: id,
      title: angle.title,
      hook: angle.hook,
      positioning: angle.positioning,
      score: angle.score,
      selected: false,
    }));

    const { error: insertError } = await getSupabaseService()
      .from('research_angles')
      .insert(anglesToInsert);

    if (insertError) {
      console.error('DB insert angles error:', insertError);
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'analysis',
          error_message: 'Failed to store angles',
        })
        .eq('id', id)
        .eq('user_id', userId);

      return NextResponse.json({ error: 'Failed to store angles' }, { status: 500 });
    }

    // Update job to ready_for_angles (after successful angle generation)
    const { data: updatedJob, error: updateError } = await getSupabaseService()
      .from('research_jobs')
      .update({
        status: 'ready_for_angles',
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('DB update job error:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    return NextResponse.json({
      id: updatedJob.id,
      status: updatedJob.status,
      angles_generated: angles.length,
      error_message: null,
    });
  } catch (err) {
    console.error('POST /api/research/jobs/[id]/analyze:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
