"use client";

import { useState } from "react";
import { Film, Loader2, Play, CheckCircle2 } from "lucide-react";

const PACK_ID = "8155d96d-5bd7-4dcd-b094-20c9222ddc9f";
const R2 = "https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev";
const DEFAULTS = {
  podcastId: "307e628c-96a0-4ad6-b948-60a2f57c2f9a",
  hostPersonaId: "fa54f41b-8cb8-4f70-b022-a13131228092",
  guestPersonaId: "c93178eb-2e8f-4fbe-93cf-5540ee1429ff",
};
const SHOTS = [1, 2, 3, 4].map((index) => ({ index, url: `${R2}/podcast/studio-packs/${PACK_ID}/shot-${index}.jpg` }));
type Clip = { id: string; status: string; video_url?: string | null };

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `${response.status} ${response.statusText}`);
  return json;
}

export default function PodcastStudioRunnerPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const log = (message: string) => setLogs((current) => [...current, message]);

  const buildClip = async (role: "host" | "guest", personaId: string, source: string) => {
    log(`${role}: starting Seedance motion base`);
    const ensured = await postJson("/api/admin/podcast-base-clips", {
      action: "ensure", provider: "byteplus", persona_id: personaId, source_image_url: source,
      aspect_ratio: "16:9", resolution: "720p", duration_seconds: 5,
      prompt_version: `studio-pack-${PACK_ID}-${role}-byteplus-v1`,
    });
    let clip = ensured.clip as Clip;
    if (clip.status === "ready") { log(`${role}: reused ready clip`); return clip; }
    for (let attempt = 1; attempt <= 48; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      const polled = await postJson("/api/admin/podcast-base-clips", { action: "poll", clip_id: clip.id });
      clip = polled.clip as Clip;
      log(`${role}: ${polled.status} (${attempt}/48)`);
      if (clip.status === "ready" && clip.video_url) return clip;
      if (clip.status === "failed") throw new Error(`${role}: generation failed`);
    }
    throw new Error(`${role}: generation timed out`);
  };

  const run = async () => {
    setRunning(true); setDone(false); setLogs([]);
    try {
      const host = await buildClip("host", form.hostPersonaId, SHOTS[1].url);
      const guest = await buildClip("guest", form.guestPersonaId, SHOTS[2].url);
      await postJson("/api/admin/experiments/podcast-lipsync-spike", {
        step: "bind_studio_pack", podcastId: form.podcastId, packId: PACK_ID, shots: SHOTS,
        hostBaseClipId: host.id, guestBaseClipId: guest.id,
      });
      log("Studio pack bound. Ready for segment lip-sync and render."); setDone(true);
    } catch (error) { log(`ERROR: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setRunning(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Film className="h-6 w-6" /> Podcast Studio Runner</h1>
        <p className="mt-1 text-sm text-muted-foreground">Build neutral studio motion bases, persist them on R2, then bind the pack.</p></div>
      <section className="grid gap-4 rounded-lg border border-border bg-card p-5">
        {([ ["podcastId", "Podcast ID"], ["hostPersonaId", "Host persona ID"], ["guestPersonaId", "Guest persona ID"] ] as const).map(([key, label]) => (
          <label key={key} className="grid gap-1 text-sm"><span className="font-medium">{label}</span>
            <input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs" /></label>
        ))}
        <div className="grid grid-cols-4 gap-3">{SHOTS.map((shot) => (
          <img key={shot.index} src={shot.url} alt={`Studio shot ${shot.index}`} className="aspect-video w-full rounded-md object-cover" />
        ))}</div>
        <button onClick={run} disabled={running || !form.podcastId || !form.hostPersonaId || !form.guestPersonaId} className="flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Build Maya + Leo and bind pack
        </button>
      </section>
      {(logs.length > 0 || done) && <section className="rounded-lg border border-border bg-zinc-950 p-4 font-mono text-xs text-zinc-200">
        {done && <div className="mb-3 flex items-center gap-2 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Ready</div>}
        {logs.map((entry, index) => <div key={`${index}-${entry}`}>{entry}</div>)}
      </section>}
    </div>
  );
}
