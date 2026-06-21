import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

/** Authenticate + check ownership of the research job. Returns the service client
 *  and user id, or a NextResponse error to return directly. */
async function authAndOwn(
  request: NextRequest,
  id: string,
): Promise<{ supabase: SupabaseClient; userId: string } | { error: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: { user }, error: authError } = await getSupabaseAuth().auth.getUser(
    authHeader.substring(7),
  );
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const supabase = getSupabaseService();
  const { data: job, error: jobError } = await supabase
    .from('research_jobs')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (jobError || !job) {
    return { error: NextResponse.json({ error: 'Research job not found' }, { status: 404 }) };
  }
  return { supabase, userId: user.id };
}

/**
 * PUT /api/research/jobs/[id]/working-storyboard
 * Persist the Explainer Studio working copy (edited draft) so it survives reloads.
 * Stored on research_jobs.working_storyboard as { scenes, savedAt, storyboardId } —
 * the approved plan in research_storyboards is NEVER modified (§13.2). The draft is
 * tagged with the storyboardId it was derived from so a regenerated plan invalidates
 * a stale draft on the client. The body is never trusted: scenes are sanitized.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authAndOwn(request, id);
    if ('error' in auth) return auth.error;
    const { supabase, userId } = auth;

    const body = (await request.json().catch(() => null)) as
      | { scenes?: unknown; storyboardId?: unknown }
      | null;
    const scenes = sanitizeEditedScenes(body?.scenes);
    const storyboardId = typeof body?.storyboardId === 'string' ? body.storyboardId : null;
    const savedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({ working_storyboard: { scenes, savedAt, storyboardId } })
      .eq('id', id)
      .eq('user_id', userId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ savedAt, scenes: scenes.length });
  } catch (err) {
    console.error('PUT /api/research/jobs/[id]/working-storyboard:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/research/jobs/[id]/working-storyboard
 * Discard the working copy (Reset to plan): set working_storyboard back to NULL.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authAndOwn(request, id);
    if ('error' in auth) return auth.error;
    const { supabase, userId } = auth;

    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({ working_storyboard: null })
      .eq('id', id)
      .eq('user_id', userId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ cleared: true });
  } catch (err) {
    console.error('DELETE /api/research/jobs/[id]/working-storyboard:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
