import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeEditedScenes } from '@/lib/explainer/storyboard';

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
 * PUT /api/research/jobs/[id]/working-storyboard
 * Persist the Explainer Studio working copy (edited draft) so it survives reloads.
 * Stored on research_jobs.working_storyboard as { scenes, savedAt } — the approved
 * plan in research_storyboards is NEVER modified (§13.2). The body is never trusted:
 * scenes are sanitized server-side before storage.
 */
export async function PUT(
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

    // Ownership check
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (jobError || !job) {
      return NextResponse.json({ error: 'Research job not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as { scenes?: unknown } | null;
    const scenes = sanitizeEditedScenes(body?.scenes);
    const savedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({ working_storyboard: { scenes, savedAt } })
      .eq('id', id)
      .eq('user_id', user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ savedAt, scenes: scenes.length });
  } catch (err) {
    console.error('PUT /api/research/jobs/[id]/working-storyboard:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
