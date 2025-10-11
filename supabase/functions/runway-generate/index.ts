// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: runway-generate
// Creates Runway Gen-4 Turbo jobs for all pending scenes of a scheduled post's project

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'jsr:@supabase/functions@1.4.5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY')
const RUNWAY_API_BASE = Deno.env.get('RUNWAY_API_BASE') || 'https://api.runwayml.com/v1'
const RUNWAY_MODEL = Deno.env.get('RUNWAY_MODEL') || 'gen-4-turbo'
const RUNWAY_MAX_CREDITS_MONTHLY = Number(Deno.env.get('RUNWAY_MAX_CREDITS_MONTHLY') || 20000)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env for Edge Function: SUPABASE_URL or SERVICE_ROLE_KEY')
}
if (!RUNWAY_API_KEY) {
  console.error('Missing RUNWAY_API_KEY for Runway integration')
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function creditsMonthlyEstimate(): Promise<number> {
  // approximate consumption: sum of scene durations created this month
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
  const { data: scenes } = await supabase
    .from('project_scenes')
    .select('duration_s, created_at')
    .gte('created_at', monthStart)
  const total = (scenes || []).reduce((a: number, s: any) => a + (s.duration_s || 0), 0)
  return total
}

async function createRunwayJobForScene(scene: any): Promise<{ id: string, status: string, payload: any }> {
  const body = {
    model: RUNWAY_MODEL,
    input: {
      prompt: scene.prompt,
      duration: scene.duration_s,
      // additional optional params can be added here
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
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const { scheduled_post_id } = await req.json().catch(() => ({}))
    if (!scheduled_post_id) return new Response(JSON.stringify({ error: 'Missing scheduled_post_id' }), { status: 400 })

    // Load scheduled post and associated project
    const { data: sched, error: schedErr } = await supabase
      .from('scheduled_posts')
      .select('id, project_id, status')
      .eq('id', scheduled_post_id)
      .single()
    if (schedErr) throw schedErr

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', sched.project_id)
      .single()
    if (projErr) throw projErr

    // credit cap check: add this project's total_duration_s to used
    const used = await creditsMonthlyEstimate()
    const projected = used + (project?.total_duration_s || 0)
    if (projected > RUNWAY_MAX_CREDITS_MONTHLY) {
      return new Response(JSON.stringify({ error: 'Monthly credit cap reached', used, projected }), { status: 429 })
    }

    // fetch pending scenes (accept both 'queued' and 'pending')
    const { data: scenes, error: scErr } = await supabase
      .from('project_scenes')
      .select('*')
      .eq('project_id', sched.project_id)
      .in('status', ['queued', 'pending'])
      .order('idx', { ascending: true })
    if (scErr) throw scErr

    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No pending scenes' }), { status: 200 })
    }

    const results: any[] = []

    for (const scene of scenes) {
      try {
        // Idempotence: skip if job already exists or video already produced
        if (scene.runway_job_id || scene.video_path) {
          results.push({ scene_id: scene.id, skipped: true })
          continue
        }
        const job = await createRunwayJobForScene(scene)
        // store job id and mark queued/running per response
        await supabase
          .from('project_scenes')
          .update({ runway_job_id: job.id, status: job.status === 'running' ? 'running' : 'queued', updated_at: new Date().toISOString() })
          .eq('id', scene.id)

        await supabase
          .from('video_jobs_log')
          .insert({ scene_id: scene.id, job_id: job.id, status: 'submitted', message: 'Runway job created', payload: job.payload })

        results.push({ scene_id: scene.id, job_id: job.id, status: job.status })
      } catch (err: any) {
        await supabase
          .from('video_jobs_log')
          .insert({ scene_id: scene.id, job_id: null, status: 'failed', message: `Create job error: ${err?.message || String(err)}`, payload: null })
        await supabase
          .from('project_scenes')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', scene.id)
        results.push({ scene_id: scene.id, error: err?.message || String(err) })
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 })
  }
})
