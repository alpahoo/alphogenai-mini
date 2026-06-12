import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { extractSource } from '@/lib/research/extraction';

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
 * POST /api/research/jobs/[id]/extract
 * Extract Markdown content from research sources via Crawl4AI
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

    // Check status gate. Re-running Extract is also allowed after angles/script
    // are generated so T-1110 media collection can backfill older research
    // plans without forcing the user to start over.
    const allowedStatuses = ['ready_for_angles', 'scripting', 'approved', 'sent_to_director', 'failed'];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot extract sources for job in status: ${job.status}` },
        { status: 400 },
      );
    }

    // If already extracting, return 409 Conflict
    if (job.status === 'extracting') {
      return NextResponse.json(
        { error: 'Job is already being extracted' },
        { status: 409 },
      );
    }

    // Update job to extracting
    await getSupabaseService()
      .from('research_jobs')
      .update({ status: 'extracting' })
      .eq('id', id)
      .eq('user_id', userId);

    // Fetch all sources for this job
    const { data: sources, error: sourcesError } = await getSupabaseService()
      .from('research_sources')
      .select()
      .eq('research_job_id', id)
      .limit(100); // Max 100 sources per job

    if (sourcesError) {
      console.error('DB fetch sources error:', sourcesError);
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'extraction',
          error_message: 'Failed to fetch sources',
        })
        .eq('id', id)
        .eq('user_id', userId);
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
    }

    if (!sources || sources.length === 0) {
      await getSupabaseService()
        .from('research_jobs')
        .update({
          status: 'failed',
          error_step: 'extraction',
          error_message: 'No sources to extract',
        })
        .eq('id', id)
        .eq('user_id', userId);
      return NextResponse.json(
        {
          id,
          status: 'failed',
          sources_extracted: 0,
          sources_failed: 0,
          error_message: 'No sources to extract',
        },
        { status: 500 },
      );
    }

    // Extract sequentially (V1)
    let sourcesExtracted = 0;
    let sourcesFailed = 0;
    let mediaCandidatesSeen = 0;
    let mediaInsertErrors = 0;

    for (const source of sources) {
      try {
        const extraction = await extractSource(source.url, 15000);

        // Update source with extraction result
        await getSupabaseService()
          .from('research_sources')
          .update({
            extracted_markdown: extraction.extracted_markdown,
            extraction_status: extraction.extraction_status,
            extraction_error: extraction.extraction_error,
            extraction_time_ms: extraction.extraction_time_ms,
          })
          .eq('id', source.id)
          .eq('research_job_id', id);

        // T-1110c: persist collected media candidates (metadata only, no download).
        // selected=false / rights_status=unverified; deduped per (job, url).
        if (extraction.media_candidates.length > 0) {
          const mediaRows = extraction.media_candidates.map((m) => ({
            research_job_id: id,
            research_source_id: source.id,
            kind: m.kind,
            source_url: m.source_url,
            width: m.width,
            height: m.height,
            mime: m.mime,
            selected: false,
            rights_status: 'unverified',
            risk_note: m.risk_note,
          }));
          mediaCandidatesSeen += mediaRows.length;
          const { error: mediaError } = await getSupabaseService()
            .from('research_source_media')
            .upsert(mediaRows, { onConflict: 'research_job_id,source_url', ignoreDuplicates: true });
          if (mediaError) {
            mediaInsertErrors += 1;
            console.error('research_source_media upsert error:', mediaError);
          }
        }

        if (extraction.extraction_status === 'success') {
          sourcesExtracted += 1;
        } else {
          sourcesFailed += 1;
        }
      } catch (err) {
        console.error(`Extraction error for source ${source.id}:`, err);
        sourcesFailed += 1;

        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await getSupabaseService()
          .from('research_sources')
          .update({
            extracted_markdown: null,
            extraction_status: 'failed',
            extraction_error: errorMsg,
            extraction_time_ms: 0,
          })
          .eq('id', source.id)
          .eq('research_job_id', id);
      }
    }

    // Determine final job status
    let finalStatus: string;
    let errorMessage: string | null = null;

    if (sourcesExtracted >= 1) {
      finalStatus = ['scripting', 'approved', 'sent_to_director'].includes(job.status)
        ? job.status
        : 'ready_for_angles';
    } else {
      finalStatus = 'failed';
      errorMessage = 'No sources could be extracted';
    }

    // Update job with final status
    const { data: updatedJob, error: updateError } = await getSupabaseService()
      .from('research_jobs')
      .update({
        status: finalStatus,
        error_step: finalStatus === 'failed' ? 'extraction' : null,
        error_message: errorMessage,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('DB update error:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    const { count: mediaCandidatesTotal } = await getSupabaseService()
      .from('research_source_media')
      .select('id', { count: 'exact', head: true })
      .eq('research_job_id', id);

    return NextResponse.json({
      id: updatedJob.id,
      status: updatedJob.status,
      sources_extracted: sourcesExtracted,
      sources_failed: sourcesFailed,
      media_candidates_seen: mediaCandidatesSeen,
      media_candidates_total: mediaCandidatesTotal ?? 0,
      media_insert_errors: mediaInsertErrors,
      error_message: errorMessage,
    });
  } catch (err) {
    console.error('POST /api/research/jobs/[id]/extract:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
