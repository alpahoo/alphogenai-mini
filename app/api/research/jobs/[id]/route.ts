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
 * GET /api/research/jobs/[id]
 * Fetch a single job by ID (owned by user)
 */
export async function GET(
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
    const { data, error } = await getSupabaseService()
      .from('research_jobs')
      .select()
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      console.error('DB error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/research/jobs/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/research/jobs/[id]
 * Edit a job (only if status is 'draft')
 */
export async function PATCH(
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
    const body = await request.json();

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

    // Check draft status
    if (job.status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only edit jobs in draft status' },
        { status: 400 },
      );
    }

    // Validate and build update payload
    const updates: Record<string, unknown> = {};

    if ('topic' in body) {
      if (typeof body.topic !== 'string') {
        return NextResponse.json({ error: 'topic must be a string' }, { status: 400 });
      }
      if (body.topic.length < 3 || body.topic.length > 500) {
        return NextResponse.json(
          { error: 'topic must be between 3 and 500 characters' },
          { status: 400 },
        );
      }
      updates.topic = body.topic.trim();
    }

    if ('input_url' in body) {
      if (body.input_url !== null && typeof body.input_url !== 'string') {
        return NextResponse.json({ error: 'input_url must be a string or null' }, { status: 400 });
      }
      if (body.input_url && !body.input_url.match(/^https?:\/\//)) {
        return NextResponse.json(
          { error: 'input_url must be a valid http/https URL' },
          { status: 400 },
        );
      }
      updates.input_url = body.input_url || null;
    }

    if ('mode' in body) {
      if (!['news', 'tutorial', 'product', 'competitor'].includes(body.mode)) {
        return NextResponse.json(
          { error: 'mode must be one of: news, tutorial, product, competitor' },
          { status: 400 },
        );
      }
      updates.mode = body.mode;
    }

    if ('language' in body) {
      if (typeof body.language !== 'string' || !body.language.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
        return NextResponse.json(
          { error: 'language must match format: [a-z]{2}(-[A-Z]{2})?' },
          { status: 400 },
        );
      }
      updates.language = body.language;
    }

    if ('target_duration_seconds' in body) {
      if (body.target_duration_seconds !== null && typeof body.target_duration_seconds !== 'number') {
        return NextResponse.json(
          { error: 'target_duration_seconds must be a number or null' },
          { status: 400 },
        );
      }
      if (body.target_duration_seconds) {
        const duration = body.target_duration_seconds;
        if (duration < 3 || duration > 600) {
          return NextResponse.json(
            { error: 'target_duration_seconds must be between 3 and 600' },
            { status: 400 },
          );
        }
      }
      updates.target_duration_seconds = body.target_duration_seconds || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Perform update
    const { data: updated, error: updateError } = await getSupabaseService()
      .from('research_jobs')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('DB update error:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/research/jobs/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
