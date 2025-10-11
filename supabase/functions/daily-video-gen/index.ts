// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: daily-video-gen
// Schedules and seeds projects from daily_themes, generates scripts via Qwen, creates scenes

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'jsr:@supabase/functions@1.4.5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const QWEN_API_KEY = Deno.env.get('QWEN_API_KEY')
const RUNWAY_MAX_CREDITS_MONTHLY = Number(Deno.env.get('RUNWAY_MAX_CREDITS_MONTHLY') || 20000)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env in Edge Function')
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
})

async function getAnyAdminUserId(): Promise<string | null> {
  try {
    // Service role key required; returns paginated list
    const { data } = await (supabase as any).auth.admin.listUsers({ perPage: 200 })
    const users = (data?.users || []) as Array<any>
    const admin = users.find((u) => (u?.app_metadata?.role) === 'admin')
    return admin?.id ?? null
  } catch (_) {
    return null
  }
}

async function callQwenToScenes(tone: string, topic: string) {
  if (!QWEN_API_KEY) throw new Error('Missing QWEN_API_KEY')
  const prompt = `Crée un script vidéo en français avec 8 à 12 scènes courtes (6-10 secondes chacune) sur le thème: "${topic}". Réponds strictement en JSON au format {"scenes":[{"title":"...","prompt":"...","duration_s":8}]}. Le ton doit être ${tone}. N'inclus pas de texte hors JSON.`
  const resp = await fetch('https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${QWEN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      input: { prompt },
      parameters: { result_format: 'json', temperature: 0.7 }
    })
  })
  const data = await resp.json().catch(() => ({}))
  const text: string = (data?.output?.text) || ''
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    // try to extract JSON block
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Qwen response not JSON')
    parsed = JSON.parse(m[0])
  }
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : []
  return scenes
}

function sha256(input: string) {
  const msgUint8 = new TextEncoder().encode(input)
  return crypto.subtle.digest('SHA-256', msgUint8).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  })
}

async function creditsMonthlyEstimate(): Promise<number> {
  // naive estimation: sum of project_scenes.duration_s for current month
  const { data, error } = await supabase
    .rpc('date_trunc', { precision: 'month', source: new Date().toISOString() as any }) as any
  // fallback query when rpc missing
  const { data: scenes } = await supabase
    .from('project_scenes')
    .select('duration_s, created_at')
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
  const total = (scenes || []).reduce((a: number, s: any) => a + (s.duration_s || 0), 0)
  return total
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const method = req.method

    if (method !== 'POST' && method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const query = url.searchParams
    const dryRun = query.get('dry') === '1'

    // Check credits cap
    const used = await creditsMonthlyEstimate()
    if (used >= RUNWAY_MAX_CREDITS_MONTHLY) {
      return new Response(JSON.stringify({ error: 'Monthly credit cap reached', used }), { status: 429 })
    }

    // Fetch pending themes up to CURRENT_DATE in PostgreSQL (no JS date math)
    async function fetchPendingThemesDB() {
      // Preferred RPC: get_pending_daily_themes()
      let rpc = await supabase.rpc('get_pending_daily_themes')
      if (rpc.error) {
        // Fallback RPC name if different
        rpc = await supabase.rpc('daily_themes_pending_up_to_today')
      }
      if (rpc.error) throw rpc.error
      return rpc.data as any[]
    }

    const themesToProcess = await fetchPendingThemesDB()
    console.log('Processing themes:', Array.isArray(themesToProcess) ? themesToProcess.length : 0)

    const results: any[] = []
    for (const theme of themesToProcess || []) {
      try {
        // Admin-only managed, created_by may be null; skip if missing topic/prompt
        const tone = theme.tone || 'fun'
        const topic = theme.title || 'Sujet du jour'
        const scenes = await callQwenToScenes(tone, topic)
        // Pick a reasonable count 8-10
        const boundedScenes = scenes
          .map((s: any, i: number) => ({
            idx: i,
            title: s.title || `Scene ${i+1}`,
            prompt: s.prompt || topic,
            duration_s: Math.min(10, Math.max(6, Number(s.duration_s) || 8))
          }))
        const totalDuration = boundedScenes.reduce((a: number, s: any) => a + s.duration_s, 0)
        const planTier = 'pro'
        const durationLimit = planTier === 'pro' ? 120 : 600
        if (totalDuration > durationLimit) {
          // Trim scenes to fit
          let sum = 0
          const trimmed: any[] = []
          for (const s of boundedScenes) {
            if (sum + s.duration_s > durationLimit) break
            trimmed.push(s)
            sum += s.duration_s
          }
          while (trimmed.length && sum > durationLimit) {
            const last = trimmed.pop()!
            sum -= last.duration_s
          }
          (boundedScenes as any) = trimmed
        }

        // Determine music track by tone
        const { data: track } = await supabase
          .from('music_tracks')
          .select('*')
          .eq('tone', tone)
          .limit(1)
          .single()

        // Assign project owner: prefer theme.created_by, else any admin user
        let ownerId = (theme.created_by as string | null) || await getAnyAdminUserId()
        if (!ownerId) throw new Error('No admin user available to own project')

        // Create project (owner is required by RLS; service role bypasses)
        const { data: project, error: projErr } = await supabase
          .from('projects')
          .insert({
            user_id: ownerId,
            title: `${topic} (${theme.scheduled_date || 'aujourd\'hui'})`,
            tone,
            plan_tier: 'pro',
            duration_limit_s: 120,
            total_duration_s: boundedScenes.reduce((a: number, s: any) => a + s.duration_s, 0),
            music_file_path: track?.file_path || null,
            status: 'draft'
          })
          .select()
          .single()
        if (projErr) throw projErr

        // Insert scenes with checksums, skip duplicates by checksum
        for (const s of boundedScenes) {
          const checksum = await sha256(JSON.stringify({ tone, topic, s }))
          const { data: existing } = await supabase
            .from('project_scenes')
            .select('id')
            .eq('project_id', project.id)
            .eq('scene_checksum', checksum)
            .maybeSingle()
          if (existing) continue
          await supabase
            .from('project_scenes')
            .insert({
              project_id: project.id,
              idx: s.idx,
              title: s.title,
              prompt: s.prompt,
              duration_s: s.duration_s,
              scene_checksum: checksum,
              status: 'queued'
            })
        }

        // Create scheduled post awaiting approval
        await supabase
          .from('scheduled_posts')
          .insert({
            project_id: project.id,
            user_id: ownerId,
            targets: ['youtube','instagram','tiktok'],
            status: 'awaiting_approval'
          })

        await supabase
          .from('daily_themes')
          .update({ status: 'generated' })
          .eq('id', theme.id)

        results.push({ theme_id: theme.id, project_id: project.id, scenes: boundedScenes.length })
      } catch (err: any) {
        console.error('Theme processing error', err)
        await supabase.from('daily_themes').update({ status: 'failed' }).eq('id', theme.id)
        results.push({ theme_id: theme.id, error: String(err?.message || err) })
      }
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 })
  }
})
