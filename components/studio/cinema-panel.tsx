"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectedRunsForMontage, type CinemaScene, type CinemaShot, type CinemaTake } from "@/lib/cinema/m1";
import type { StudioState } from "./use-studio";

const API = "/api/admin/studio/cinema";
const inputClass = "min-w-0 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Project { id: string; title: string; aspect: string; updated_at?: string }
interface Scene extends CinemaScene { title: string }
interface Shot extends CinemaShot { action: string; duration: number; first_frame_path: string | null; version: number; sound: string }
interface Take extends CinemaTake { user_id?: string }
interface Run { id: string; status: string; template_version: string; params_effective?: Record<string, unknown> }
interface Asset { id: string; run_id: string; role: string; mime: string }
interface LibraryItem { path: string; name: string }
interface Storyboard { project: Project; scenes: Scene[]; shots: Shot[]; takes: Take[]; runs: Run[]; assets: Asset[] }
interface Edit { action: string; duration: number; first_frame_path: string }
async function expectJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Cinema request failed");
  return data;
}
async function post<T>(body: Record<string, unknown>): Promise<T> {
  return expectJson<T>(await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

/** A signed media URL is obtained only through the existing owner-scoped Studio route. */
function Clip({ id, s, label, muted = false }: { id: string; s: StudioState; label: string; muted?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true; setError(false); setUrl(null);
    s.signMedia(id, { force: true }).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
    // A signed URL is refreshed if the asset changes; it is never stored in project data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (error) return <p role="alert">Private video unavailable.</p>;
  return url ? <video src={url} controls playsInline muted={muted} aria-label={label} className="max-h-[320px] w-full rounded-xl bg-black object-contain"
    onError={() => s.signMedia(id, { force: true }).then(setUrl).catch(() => setError(true))} /> : <p className="p-4 text-xs">Loading private video…</p>;
}

export function CinemaPanel({ s, onClose }: { s: StudioState; onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [story, setStory] = useState<Storyboard | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [attach, setAttach] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, {prompt: string; notes: string[]; warnings: string[]}>>({});
  const [compare, setCompare] = useState<string | null>(null);
  const [sound, setSound] = useState<"a" | "b" | "off">("a");
  const [result, setResult] = useState<{ id: string; url: string | null; duration_s: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>());
  const loadProjects = useCallback(async () => {
    const data = await expectJson<{ projects: Project[] }>(await fetch(API, { cache: "no-store" }));
    setProjects(data.projects);
  }, []);
  const loadLibrary = useCallback(async () => {
    const data = await expectJson<{ items: LibraryItem[] }>(await fetch("/api/admin/studio/references", { cache: "no-store" }));
    setLibrary(data.items);
  }, []);
  const loadProject = useCallback(async (id: string) => {
    const data = await expectJson<Storyboard>(await fetch(API + "?project=" + encodeURIComponent(id), { cache: "no-store" }));
    setStory(data); setProjectId(id);
    setEdits(Object.fromEntries(data.shots.map(x => [x.id, { action: x.action, duration: x.duration, first_frame_path: x.first_frame_path ?? "" }])));
  }, []);
  useEffect(() => {
    void loadProjects().catch(e => setError(e instanceof Error ? e.message : "Projects unavailable"));
    void loadLibrary().catch(() => undefined);
  }, [loadProjects, loadLibrary]);
  const doWork = async (name: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(name); setError(""); setNotice("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Cinema unavailable"); }
    finally { setBusy(""); }
  };
  const createProject = () => void doWork("create", async () => {
    const name = newTitle.trim(); if (!name) throw new Error("Give the project a name.");
    const data = await post<{ project: Project }>({ action: "project.create", title: name });
    setNewTitle(""); await loadProjects(); await loadProject(data.project.id);
  });
  const addScene = () => void doWork("scene", async () => {
    if (!story) return;
    await post({ action: "scene.create", project_id: story.project.id, title: "Scene " + (story.scenes.length + 1) });
    await loadProject(story.project.id);
  });
  const addShot = (scene: Scene) => void doWork("shot", async () => {
    if (!story) return;
    await post({ action: "shot.create", project_id: story.project.id, scene_id: scene.id, description: "Describe this shot" });
    await loadProject(story.project.id);
  });
  const saveShot = async (shot: Shot): Promise<boolean> => {
    const edit = edits[shot.id]; if (!edit || !story) return false;
    await post({ action: "shot.update", shot_id: shot.id, version: shot.version,
      description: edit.action, duration: edit.duration, first_frame_path: edit.first_frame_path || null });
    await loadProject(story.project.id);
    return true;
  };
  const save = (shot: Shot) => void doWork("save:" + shot.id, async () => { await saveShot(shot); setNotice("Plan saved."); });
  const attachTake = (shot: Shot) => void doWork("attach:" + shot.id, async () => {
    const id = (attach[shot.id] ?? "").trim();
    if (!UUID.test(id)) throw new Error("Use the complete generation UUID from history.");
    await post({ action: "take.attach", shot_id: shot.id, run_id: id });
    if (story) await loadProject(story.project.id);
    setNotice("Existing generation attached to this plan.");
  });
  const selectTake = (shot: Shot, take: Take) => void doWork("select:" + shot.id, async () => {
    await post({ action: "take.select", shot_id: shot.id, take_id: take.id, version: shot.version });
    if (story) await loadProject(story.project.id);
    setNotice("Selected take saved. Other plans were not changed.");
  });
  const prepare = (shot: Shot, generate: boolean) => void doWork("preview:" + shot.id, async () => {
    if (!story) return;
    await saveShot(shot);
    const d = await post<{ preview: { prompt: string; params: Record<string, string | number>; notes: string[]; warnings: string[] } }>(
      { action: "shot.preview", shot_id: shot.id });
    setPreview(p => ({ ...p, [shot.id]: d.preview }));
    if (!generate) return;
    const price = s.readiness.cost?.reservation_usd;
    const cost = typeof price === "number" ? "Estimated reservation: $" + price.toFixed(2) + ". " : "";
    if (!window.confirm(cost + "Start ONE paid H3 generation for this plan? Other plans and their selected takes stay unchanged.")) return;
    // Reuse the same key on a technical retry. The H3 admission RPC is idempotent.
    const key = "alphogen-cinema:" + shot.id + ":" + shot.version;
    let requestKey = keys.current.get(key);
    if (!requestKey) {
      try { requestKey = sessionStorage.getItem(key) || undefined; } catch { /* memory fallback */ }
    }
    if (!requestKey) requestKey = crypto.randomUUID();
    keys.current.set(key, requestKey);
    try { sessionStorage.setItem(key, requestKey); } catch { /* optional */ }
    const run = await expectJson<{ run_id: string }>(await fetch("/api/admin/comfy/runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "minimax-h3", idempotency_key: requestKey, params: d.preview.params }),
    }));
    await post({ action: "take.attach", shot_id: shot.id, run_id: run.run_id });
    keys.current.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* optional */ }
    await loadProject(story.project.id);
    setNotice("Only this plan was submitted as a take. Refresh to follow progress.");
  });
  const exportSelected = () => void doWork("export", async () => {
    if (!story) return;
    const completed = new Set(story.runs.filter(r => r.status === "done" &&
      story.assets.some(a => a.run_id === r.id && a.role === "final" && a.mime === "video/mp4")).map(r => r.id));
    const ordered = selectedRunsForMontage(story.scenes, story.shots, story.takes, completed);
    const d = await expectJson<{ item: { id: string; url: string | null }; duration_s: number }>(
      await fetch("/api/admin/studio/montages", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_ids: ordered, audio: "corrected", name: story.project.title + " final" }) }));
    setResult({ ...d.item, duration_s: d.duration_s });
    setNotice("Montage created with Corrected audio. Source clips are kept.");
  });
  const download = () => void doWork("download", async () => {
    if (!result) return;
    const d = await expectJson<{ url: string }>(await fetch("/api/admin/studio/montages?id=" + encodeURIComponent(result.id) + "&download=1", { cache: "no-store" }));
    const a = document.createElement("a"); a.href = d.url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  });
  const runsById = new Map((story?.runs ?? []).map(r => [r.id, r]));
  const assetsByRun = new Map((story?.assets ?? []).filter(a => a.role === "final").map(a => [a.run_id, a]));
  const takesFor = (shot: Shot) => (story?.takes ?? []).filter(t => t.shot_id === shot.id);
  const edit = (shot: Shot, k: keyof Edit, v: string | number) =>
    setEdits(prev => ({ ...prev, [shot.id]: { ...prev[shot.id], [k]: v } }));
  return (
    <main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" data-testid="cinema-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-semibold">Cinema · Projects and takes</h2><p className="text-xs text-muted-foreground">Private admin storyboard. Your choices are saved per plan.</p></div>
        <button type="button" onClick={onClose} className={buttonClass}>Back to Create</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-border p-3 text-sm">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <label className="min-w-[10rem] flex-1 text-sm">Open project
          <select className={inputClass} value={projectId} onChange={e => void doWork("open", async () => {
            if (e.target.value) await loadProject(e.target.value); else { setProjectId(""); setStory(null); }
          })}>
            <option value="">Choose a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label className="min-w-[10rem] flex-1 text-sm">New project
          <input className={inputClass} maxLength={120} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Luz" />
        </label>
        <button type="button" disabled={!!busy || !newTitle.trim()} className={buttonClass} onClick={createProject}>Create project</button>
      </div>
      {story && <>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{story.project.title} · {story.project.aspect}</h3>
          <button className={buttonClass} type="button" disabled={!!busy} onClick={addScene}>Add scene</button>
        </div>
        {[...story.scenes].sort((a,b) => a.position - b.position).map(scene => (
          <section key={scene.id} className="space-y-4 rounded-2xl border border-border p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">{scene.title}</h4>
              <button type="button" className={buttonClass} disabled={!!busy} onClick={() => addShot(scene)}>Add plan</button></div>
            {[...story.shots].filter(x => x.scene_id === scene.id).sort((a,b) => a.position - b.position).map((shot,i) => {
              const takeList = takesFor(shot);
              const chosen = takeList.find(t => t.id === shot.selected_take_id);
              const asset = chosen && assetsByRun.get(chosen.run_id);
              const other = compare === shot.id ? takeList.find(t => t.id !== chosen?.id && assetsByRun.has(t.run_id)) : undefined;
              const chosenAsset = chosen && asset;
              return <article key={shot.id} className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3" data-testid="cinema-shot">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Plan {scene.position + 1}.{i + 1}</p><span className="text-xs text-muted-foreground">{takeList.length} take(s)</span></div>
                <label className="block text-xs">Action / scene direction
                  <textarea rows={2} className={inputClass} maxLength={2000} value={edits[shot.id]?.action ?? shot.action}
                    onChange={e => edit(shot,"action",e.target.value)} /></label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs">Duration
                    <select className={inputClass} value={edits[shot.id]?.duration ?? shot.duration}
                      onChange={e => edit(shot,"duration",Number(e.target.value))}><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></label>
                  <label className="text-xs">First frame (H3 Turbo)
                    <select className={inputClass} value={edits[shot.id]?.first_frame_path ?? shot.first_frame_path ?? ""}
                      onChange={e => edit(shot,"first_frame_path",e.target.value)}>
                      <option value="">Text-to-video (no first frame)</option>
                      {library.map(item => <option key={item.path} value={item.path}>{item.name}</option>)}
                    </select></label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={!!busy} onClick={() => save(shot)}>Save plan</button>
                  <button type="button" className={buttonClass} disabled={!!busy} onClick={() => prepare(shot,false)}>Preview prompt</button>
                  <button type="button" className={buttonClass} disabled={!!busy} onClick={() => prepare(shot,true)}>Generate this plan only</button>
                </div>
                {preview[shot.id] && <div className="rounded-lg bg-muted/40 p-3 text-xs">
                  <p>{preview[shot.id].prompt}</p>
                  {[...preview[shot.id].notes,...preview[shot.id].warnings].map((n,j) => <p key={j} className="mt-1 text-amber-400">{n}</p>)}
                </div>}
                <div className="space-y-2">
                  <p className="text-xs font-medium">Saved takes</p>
                  {takeList.map(t => { const run = runsById.get(t.run_id); return <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono">{t.run_id.slice(0,8)} · {run?.status ?? "unavailable"}{chosen?.id === t.id ? " · selected" : ""}</span>
                    <button type="button" className={buttonClass} disabled={!!busy || run?.status !== "done" || chosen?.id === t.id}
                      onClick={() => selectTake(shot,t)}>Use in final montage</button>
                  </div>; })}
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label={"Attach existing H3 run to plan " + (i+1)} className={inputClass + " max-w-sm flex-1"} value={attach[shot.id] ?? ""}
                      placeholder="Existing complete run UUID" onChange={e => setAttach(p => ({...p,[shot.id]:e.target.value}))} />
                    <button className={buttonClass} type="button" disabled={!!busy} onClick={() => attachTake(shot)}>Attach take</button>
                  </div>
                  <div className="text-xs text-muted-foreground">Completed H3 runs in Studio history:
                    {(s.history ?? []).filter(r => r.status === "done" && r.template_version === "minimax-h3@1").slice(0,8).map(r =>
                      <button type="button" key={r.id} onClick={() => setAttach(p => ({ ...p, [shot.id]: r.id }))} className="ml-2 underline">{r.id.slice(0,8)}</button>)}
                  </div>
                </div>
                {chosenAsset && <div className="space-y-2">
                  <button className={buttonClass} type="button" disabled={takeList.filter(t=>assetsByRun.has(t.run_id)).length<2}
                    onClick={() => { setCompare(v=>v===shot.id?null:shot.id); setSound("a"); }}>
                    {compare===shot.id?"Close comparison":"Compare two takes"}</button>
                  <div className={compare===shot.id && other ? "grid gap-3 md:grid-cols-2":"max-w-sm"}>
                    <Clip key={chosenAsset.id} id={chosenAsset.id} s={s} label="Selected take" muted={compare===shot.id && other ? sound!=="a":false}/>
                    {compare===shot.id && other && assetsByRun.get(other.run_id) &&
                      <Clip key={other.run_id} id={assetsByRun.get(other.run_id)!.id} s={s} label="Alternative take" muted={sound!=="b"}/>}
                  </div>
                  {compare===shot.id && other && <div className="flex gap-2 text-xs"><span>Audio:</span>
                    {(["a","b","off"] as const).map(v=><button key={v} type="button" className={buttonClass} aria-pressed={sound===v}
                      onClick={()=>setSound(v)}>{v==="a"?"Selected":v==="b"?"Alternative":"Off"}</button>)}</div>}
                </div>}
              </article>;
            })}
          </section>
        ))}
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <h4 className="font-semibold">Final montage · Corrected audio</h4>
          <p className="text-xs text-muted-foreground">Exports the selected completed takes, scene by scene. Never re-generates a clip or deletes the originals.</p>
          <button type="button" className={buttonClass} disabled={!!busy} onClick={exportSelected}>Assemble selected takes</button>
          {result && <div className="space-y-2">
            <p className="text-xs">Duration: {result.duration_s.toFixed(3)} s</p>
            {result.url && <video className="max-h-[380px] w-full max-w-sm bg-black" src={result.url} controls playsInline />}
            <button type="button" className={buttonClass} onClick={download}>Download MP4 with sound</button>
          </div>}
        </div>
      </>}
    </main>
  );
}
