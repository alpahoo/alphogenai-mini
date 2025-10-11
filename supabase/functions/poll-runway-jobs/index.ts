// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: poll-runway-jobs
// Polls Runway jobs and updates scene status/output. Handles backoff, timeout, and uploads to Supabase Storage.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'jsr:@supabase/functions@1.4.5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY')
const RUNWAY_API_BASE = Deno.env.get('RUNWAY_API_BASE') || 'https://api.runwayml.com/v1'
const RUNWAY_JOB_TIMEOUT_S = Number(Deno.env.get('RUNWAY_JOB_TIMEOUT_S') || 240)
const STORAGE_BUCKET = Deno.env.get('STORAGE_BUCKET') || 'videos'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env for Edge Function')
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function fetchRunwayJob(jobId: string) {
  const res = await fetch(`${RUNWAY_API_BASE}/generations/${jobId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`
    }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Runway get failed: ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function downloadToBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return await res.arrayBuffer()
}

async function uploadToStorage(sceneId: string, buffer: ArrayBuffer, contentType = 'video/mp4') {
  const path = `scenes/${sceneId}.mp4`
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true
  })
  if (error) throw error
  const { data } = await supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}

function msAgo(ts: string | null | undefined): number {
  if (!ts) return Number.MAX_SAFE_INTEGER
  return Date.now() - new Date(ts).getTime()
}

serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    // Find scenes with jobs in queued/running and not timed out
    const { data: scenes, error } = await supabase
      .from('project_scenes')
      .select('*')
      .not('runway_job_id', 'is', null)
      .in('status', ['queued', 'running'])
      .order('updated_at', { ascending: true })
    if (error) throw error

    const results: any[] = []

    for (const scene of scenes || []) {
      try {
        // timeout check
        const elapsedS = Math.floor(msAgo(scene.updated_at) / 1000)
        if (elapsedS > RUNWAY_JOB_TIMEOUT_S) {
          await supabase
            .from('project_scenes')
            .update({ status: 'timeout', updated_at: new Date().toISOString() })
            .eq('id', scene.id)
          await supabase
            .from('video_jobs_log')
            .insert({ scene_id: scene.id, job_id: scene.runway_job_id, status: 'timeout', message: `Job timed out after ${elapsedS}s` })
          results.push({ scene_id: scene.id, status: 'timeout' })
          continue
        }

        const job = await fetchRunwayJob(scene.runway_job_id)
        const status = job?.status || job?.data?.status || 'queued'

        if (status === 'queued' || status === 'running') {
          // exponential backoff hint: we do nothing here, runner can schedule again
          await supabase
            .from('project_scenes')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', scene.id)
          await supabase
            .from('video_jobs_log')
            .insert({ scene_id: scene.id, job_id: scene.runway_job_id, status, message: 'Polling status update', payload: job })
          results.push({ scene_id: scene.id, status })
          continue
        }

        if (status === 'failed') {
          await supabase
            .from('project_scenes')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', scene.id)
          await supabase
            .from('video_jobs_log')
            .insert({ scene_id: scene.id, job_id: scene.runway_job_id, status: 'failed', message: 'Runway job failed', payload: job })
          results.push({ scene_id: scene.id, status: 'failed' })
          continue
        }

        // completed case
        const outputUrl = job?.output?.[0]?.url || job?.data?.output?.[0]?.url || job?.output_url
        if (!outputUrl) {
          // unexpected shape, log and continue
          await supabase
            .from('video_jobs_log')
            .insert({ scene_id: scene.id, job_id: scene.runway_job_id, status: 'completed', message: 'No output URL found in response', payload: job })
          results.push({ scene_id: scene.id, status: 'completed_no_output' })
          continue
        }

        const buffer = await downloadToBuffer(outputUrl)
        const { path, publicUrl } = await uploadToStorage(scene.id, buffer)

        await supabase
          .from('project_scenes')
          .update({ status: 'completed', video_path: path, updated_at: new Date().toISOString() })
          .eq('id', scene.id)
        await supabase
          .from('video_jobs_log')
          .insert({ scene_id: scene.id, job_id: scene.runway_job_id, status: 'completed', message: 'Output stored', payload: { path, publicUrl } })

        results.push({ scene_id: scene.id, status: 'completed', path, publicUrl })
      } catch (err: any) {
        await supabase
          .from('video_jobs_log')
          .insert({ scene_id: scene.id, job_id: scene.runway_job_id, status: 'failed', message: `Poll error: ${err?.message || String(err)}` })
        results.push({ scene_id: scene.id, error: err?.message || String(err) })
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 })
  }
})
