import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { discoverSources, type NormalizedSource } from '@/lib/research/discovery';

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
 * POST /api/research/jobs/[id]/discover
 * Discover sources for a research job via SearXNG
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

    // Check status gate (draft or failed only)
    if (job.status !== 'draft' && job.status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot discover sources for job in status: ${job.status}` },
        { status: 400 },
      );
    }

    // Update job to discovering
    await getSupabaseService()
      .from('research_jobs')
      .update({ status: 'discovering' })
      .eq('id', id)
      .eq('user_id', userId);

    // Query SearXNG for sources
    let sources: NormalizedSource[] = [];
    let errorMessage: string | null = null;

    try {
      sources = await discoverSources(job.topic, job.input_url, 30000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Discovery error:', errMsg);
      errorMessage = errMsg;
    }

    // Handle discovery failure
    if (errorMessage || sources.length === 0) {
      const updateError = errorMessage || 'No sources found for topic';
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'discovery',
          error_message: updateError,
        })
        .eq('id', id)
        .eq('user_id', userId);

      return NextResponse.json(
        {
          id,
          status: 'failed',
          sources_found: 0,
          error_message: updateError,
        },
        { status: 500 },
      );
    }

    // Insert sources into research_sources
    const sourcesToInsert = sources.map((source) => ({
      job_id: id,
      user_id: userId,
      url: source.url,
      title: source.title,
      source_type: source.source_type,
      credibility_score: source.credibility_score,
    }));

    const { data: insertedSources, error: insertError } = await getSupabaseService()
      .from('research_sources')
      .insert(sourcesToInsert)
      .select();

    if (insertError) {
      console.error('DB insert error:', insertError);
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'discovery',
          error_message: 'Failed to store sources',
        })
        .eq('id', id)
        .eq('user_id', userId);

      return NextResponse.json({ error: 'Failed to store sources' }, { status: 500 });
    }

    const sourcesCount = Array.isArray(insertedSources) ? insertedSources.length : 0;

    // Update job to ready_for_angles with source count
    const { data: updatedJob, error: updateError } = await getSupabaseService()
      .from('research_jobs')
      .update({
        status: 'ready_for_angles',
        sources_count: sourcesCount,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('DB update error:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    return NextResponse.json({
      id: updatedJob.id,
      status: updatedJob.status,
      sources_found: sourcesCount,
      error_message: null,
    });
  } catch (err) {
    console.error('POST /api/research/jobs/[id]/discover:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
