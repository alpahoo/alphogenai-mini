import { createClient } from '@supabase/supabase-js';
import { fromBuffer as detectFromBuffer } from 'file-type';
import { NextRequest, NextResponse } from 'next/server';

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]'
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const octets = ipv4.slice(1).map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function parsePublicMediaUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only public HTTP(S) image URLs can be used as references.');
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error('Private or local URLs cannot be used as references.');
  }
  return url;
}

async function downloadReferenceImage(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': 'AlphoGenResearch/1.0',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.7',
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch reference image (${response.status}).`);
  }

  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (declaredLength > MAX_REFERENCE_BYTES) {
    throw new Error('Reference image is too large.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_REFERENCE_BYTES) {
    throw new Error('Reference image is too large.');
  }

  const detected = await detectFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new Error('Reference must be a JPG, PNG, or WEBP image.');
  }

  return { buffer, mime: detected.mime, ext: MIME_TO_EXT[detected.mime] };
}

/**
 * POST /api/research/jobs/[id]/media/[mediaId]/select
 *
 * User-confirmed selection of a collected source media candidate.
 * Copies the external image into the private `references` bucket, then marks
 * the candidate selected. No media is copied before this explicit action.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  try {
    const { id, mediaId } = await params;

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

    const body = await request.json().catch(() => ({}));
    if (body?.rights_confirmed !== true) {
      return NextResponse.json(
        { error: 'Confirm you have the right to use this image before selecting it.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseService();
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { data: media, error: mediaError } = await supabase
      .from('research_source_media')
      .select('id, research_job_id, kind, source_url, storage_path, selected, rights_status')
      .eq('id', mediaId)
      .eq('research_job_id', id)
      .single();

    if (mediaError || !media) {
      return NextResponse.json({ error: 'Reference candidate not found' }, { status: 404 });
    }

    if (media.selected && media.storage_path) {
      return NextResponse.json({ media });
    }

    const parsed = parsePublicMediaUrl(media.source_url);
    const image = await downloadReferenceImage(parsed.toString());
    const storagePath = `${user.id}/research/${id}/${media.id}.${image.ext}`;

    const { error: uploadError } = await supabase.storage
      .from('references')
      .upload(storagePath, image.buffer, {
        contentType: image.mime,
        upsert: true,
      });

    if (uploadError) {
      console.error('research media reference upload failed:', uploadError);
      return NextResponse.json({ error: 'Could not save this reference.' }, { status: 500 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('research_source_media')
      .update({
        selected: true,
        rights_status: 'user_confirmed',
        storage_path: storagePath,
        mime: image.mime,
      })
      .eq('id', media.id)
      .eq('research_job_id', id)
      .select('id, kind, source_url, storage_path, selected, rights_status, mime')
      .single();

    if (updateError) {
      console.error('research media reference update failed:', updateError);
      return NextResponse.json({ error: 'Could not update this reference.' }, { status: 500 });
    }

    return NextResponse.json({ media: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save this reference.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
