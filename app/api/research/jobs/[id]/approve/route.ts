import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
 * POST /api/research/jobs/[id]/approve
 * Approve the latest generated script/storyboard for a user-owned research job.
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

    const userId = user.id;
    const supabase = getSupabaseService();

    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('id, user_id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      console.error('DB error:', jobError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const allowedStatuses = ['scripting', 'approved', 'failed'];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot approve job in status: ${job.status}` },
        { status: 400 },
      );
    }

    const { data: scripts, error: scriptFetchError } = await supabase
      .from('research_scripts')
      .select('id, approved')
      .eq('research_job_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (scriptFetchError) {
      console.error('DB error:', scriptFetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const script = scripts?.[0];
    if (!script) {
      return NextResponse.json(
        { error: 'Generate a script before approving this research plan.' },
        { status: 400 },
      );
    }

    const { data: storyboards, error: storyboardFetchError } = await supabase
      .from('research_storyboards')
      .select('id')
      .eq('research_job_id', id)
      .eq('script_id', script.id)
      .limit(1);

    if (storyboardFetchError) {
      console.error('DB error:', storyboardFetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!storyboards?.[0]) {
      return NextResponse.json(
        { error: 'Generate a storyboard before approving this research plan.' },
        { status: 400 },
      );
    }

    const { error: scriptUpdateError } = await supabase
      .from('research_scripts')
      .update({ approved: true })
      .eq('id', script.id)
      .eq('research_job_id', id);

    if (scriptUpdateError) {
      console.error('DB error:', scriptUpdateError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const { error: jobUpdateError } = await supabase
      .from('research_jobs')
      .update({ status: 'approved', error_step: null, error_message: null })
      .eq('id', id)
      .eq('user_id', userId);

    if (jobUpdateError) {
      console.error('DB error:', jobUpdateError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      id,
      status: 'approved',
      script_id: script.id,
      approved: true,
    });
  } catch (error) {
    console.error('Approve route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
