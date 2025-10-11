// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: retry-failed-scenes
// Retries Runway job creation for scenes with status 'failed' or 'timeout'

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'jsr:@supabase/functions@1.4.5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY')
const RUNWAY_API_BASE = Deno.env.get('RUNWAY_API_BASE') || 'https://api.runwayml.com/v1'
const RUNWAY_MODEL = Deno.env.get('RUNWAY_MODEL') || 'gen-4-turbo'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env for Edge Function: SUPABASE_URL or SERVICE_ROLE_KEY')
}
if (!RUNWAY_API_KEY) {
  console.error('Missing RUNWAY_API_KEY for Runway integration')
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function createRunwayJobForScene(scene: any): Promise<{ id: string, status: string, payload: any }> {
  const body = {
    model: RUNWAY_MODEL,
    input: {
      prompt: scene.prompt,
      duration: scene.duration_s,
    },
    type: 'video'
  }
  const res = await fetch(`${RUNWAY_API_BASE}/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Runway create failed: ${res.status} ${JSON.stringify(json)}`)
  }
  const jobId = json?.id || json?.data?.id || json?.job_id
  const status = json?.status || json?.data?.status || 'queued'
  if (!jobId) throw new Error('Runway response missing job id')
  return { id: jobId, status, payload: json }
}

serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const { data: scenes, error } = await supabase
      .from('project_scenes')
      .select('*')
      .in('status', ['failed', 'timeout'])
      .order('updated_at', { ascending: true })
    if (error) throw error

    const results: any[] = []

    for (const scene of scenes || []) {
      try {
        const job = await createRunwayJobForScene(scene)
        await supabase
          .from('project_scenes')
          .update({ runway_job_id: job.id, status: 'queued', updated_at: new Date().toISOString() })
          .eq('id', scene.id)
        await supabase
          .from('video_jobs_log')
          .insert({ scene_id: scene.id, job_id: job.id, status: 'submitted', message: 'Retry job created', payload: job.payload })
        results.push({ scene_id: scene.id, job_id: job.id, status: 'queued' })
      } catch (err: any) {
        await supabase
          .from('video_jobs_log')
          .insert({ scene_id: scene.id, status: 'failed', message: `Retry error: ${err?.message || String(err)}` })
        results.push({ scene_id: scene.id, error: err?.message || String(err) })
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 })
  }
})
