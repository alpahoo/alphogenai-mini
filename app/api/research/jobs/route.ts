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
 * GET /api/research/jobs
 * List all research jobs for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10'), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const status = searchParams.get('status');

    // Build query
    let query = getSupabaseService()
      .from('research_jobs')
      .select('id, user_id, topic, mode, status, created_at, updated_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('DB error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      jobs: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('GET /api/research/jobs:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/research/jobs
 * Create a new research job (draft status)
 */
export async function POST(request: NextRequest) {
  try {
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

    // Validate required fields
    const { topic, input_url, mode, language, target_duration_seconds } = body;

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'topic is required and must be a string' }, { status: 400 });
    }

    const topicStr: string = topic;
    if (topicStr.length < 3 || topicStr.length > 500) {
      return NextResponse.json(
        { error: 'topic must be between 3 and 500 characters' },
        { status: 400 },
      );
    }

    if (!mode || !['news', 'tutorial', 'product', 'competitor'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be one of: news, tutorial, product, competitor' },
        { status: 400 },
      );
    }

    // Validate optional URL
    if (input_url !== undefined && input_url !== null) {
      if (typeof input_url !== 'string' || !input_url.match(/^https?:\/\//)) {
        return NextResponse.json(
          { error: 'input_url must be a valid http/https URL' },
          { status: 400 },
        );
      }
    }

    // Validate optional language
    const finalLanguage = language || 'en-US';
    if (!finalLanguage.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
      return NextResponse.json(
        { error: 'language must match format: [a-z]{2}(-[A-Z]{2})?' },
        { status: 400 },
      );
    }

    // Validate optional duration
    if (target_duration_seconds !== undefined && target_duration_seconds !== null) {
      const duration = parseInt(target_duration_seconds);
      if (isNaN(duration) || duration < 3 || duration > 600) {
        return NextResponse.json(
          { error: 'target_duration_seconds must be between 3 and 600' },
          { status: 400 },
        );
      }
    }

    // Create job
    const { data, error } = await getSupabaseService()
      .from('research_jobs')
      .insert({
        user_id: userId,
        topic: topicStr.trim(),
        input_url: input_url || null,
        mode,
        language: finalLanguage,
        target_duration_seconds: target_duration_seconds || null,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('DB insert error:', error);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/research/jobs:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
