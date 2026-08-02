"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, Film, Loader2, Upload, WandSparkles } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Short = { id: string; rank: number; title: string; transcript: string; video_url: string | null; status: string; error_message: string | null };
type Pack = { id: string; title: string; status: string; error_message: string | null; created_at: string; clipping_pack_clips: Short[] };

export default function ClippingPage() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [clipCount, setClipCount] = useState(3);
  const [pack, setPack] = useState<Pack | null>(null);
  const [recent, setRecent] = useState<Pack[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Please sign in again.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, [supabase]);
  const loadRecent = useCallback(async () => {
    try { const res = await fetch("/api/clipping-packs", { headers: await authHeaders() }); const json = await res.json(); if (res.ok) setRecent(json.packs ?? []); } catch { /* form remains usable */ }
  }, [authHeaders]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);
  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/clipping-packs/${id}`, { headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Could not refresh this project.");
    setPack(json.pack); return json.pack as Pack;
  }, [authHeaders]);
  useEffect(() => {
    if (!pack || !["queued", "processing"].includes(pack.status)) return;
    const timer = window.setInterval(() => void refresh(pack.id).catch((cause) => setError(cause.message)), 5000);
    return () => window.clearInterval(timer);
  }, [pack, refresh]);

  async function create() {
    if (!file) return;
    setBusy(true); setError(""); setProgress(5);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const prepare = await fetch("/api/clipping-packs", { method: "POST", headers, body: JSON.stringify({
        action: "prepare", title: title.trim() || file.name.replace(/\.[^.]+$/, ""), mime: file.type, size: file.size, clip_count: clipCount,
      }) });
      const prepared = await prepare.json().catch(() => ({}));
      if (!prepare.ok) throw new Error(prepared.error || "Could not prepare this project.");
      setProgress(20);
      const upload = await supabase.storage.from(prepared.upload.bucket)
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type });
      if (upload.error) throw new Error(upload.error.message || "Video upload failed.");
      setProgress(85);
      const submit = await fetch("/api/clipping-packs", { method: "POST", headers, body: JSON.stringify({ action: "submit", pack_id: prepared.pack.id }) });
      const submitted = await submit.json().catch(() => ({}));
      if (!submit.ok) throw new Error(submitted.error || "Could not start the Shorts.");
      setProgress(100); setPack({ ...prepared.pack, status: "queued", clipping_pack_clips: [] }); void loadRecent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the Shorts."); }
    finally { setBusy(false); }
  }

  async function resume(id: string) {
    setBusy(true); setError("");
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const response = await fetch("/api/clipping-packs", {
        method: "POST", headers, body: JSON.stringify({ action: "submit", pack_id: id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not resume these Shorts.");
      await refresh(id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resume these Shorts."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f7f8fa] px-5 py-8 text-slate-950"><div className="mx-auto max-w-6xl">
    <Link href="/create" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to create</Link>
    <header className="mt-7 max-w-2xl"><span className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-600">Clipping & Shorts</span><h1 className="mt-3 text-4xl font-black">Turn one video into your best Shorts.</h1><p className="mt-3 text-slate-600">Upload a long video. AlphoGen finds the strongest moments, reframes them vertically, and adds readable captions.</p></header>

    {!pack && <section className="mt-8 grid gap-7 border border-slate-200 bg-white p-6 md:grid-cols-[1fr_1.1fr]">
      <div><label className="text-sm font-bold">Project title</label><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product launch interview" className="mt-2 w-full border border-slate-300 px-3 py-2.5 outline-none focus:border-fuchsia-500" />
        <label className="mt-5 block text-sm font-bold">Number of Shorts</label><div className="mt-2 flex gap-2">{[3, 5, 8].map((count) => <button key={count} onClick={() => setClipCount(count)} className={`border px-5 py-2 text-sm font-bold ${clipCount === count ? "border-fuchsia-600 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200"}`}>{count}</button>)}</div>
        {error && <p className="mt-4 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button onClick={() => void create()} disabled={!file || busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} Create {clipCount} Shorts</button>
        {busy && <div className="mt-3 h-2 overflow-hidden bg-slate-100"><div className="h-full bg-fuchsia-600 transition-all" style={{ width: `${progress}%` }} /></div>}
      </div>
      <div><h2 className="font-bold">Source video</h2><p className="text-sm text-slate-500">MP4, MOV, or WEBM · up to 50 MB.</p><button onClick={() => inputRef.current?.click()} className="mt-4 flex min-h-60 w-full flex-col items-center justify-center gap-3 border border-dashed border-slate-300 bg-slate-50 hover:border-fuchsia-500">{file ? <><Film className="h-9 w-9 text-fuchsia-600" /><span className="max-w-sm truncate font-semibold">{file.name}</span><span className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB · click to replace</span></> : <><Upload className="h-8 w-8 text-slate-400" /><span className="font-semibold">Choose a long video</span></>}</button><input ref={inputRef} hidden type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
    </section>}

    {pack && <section className="mt-9"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-bold">{pack.title}</h2><p className="text-sm capitalize text-slate-500">{pack.status === "processing" || pack.status === "queued" ? "Finding and rendering the strongest moments..." : pack.status}</p></div><button onClick={() => { setPack(null); setFile(null); setProgress(0); setError(""); }} className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">New video</button></div>
      {pack.error_message && <p className="mb-4 bg-red-50 p-3 text-sm text-red-700">{pack.error_message}</p>}
      {["queued", "failed"].includes(pack.status) && <button onClick={() => void resume(pack.id)} disabled={busy} className="mb-4 inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Retry processing</button>}
      {["queued", "processing"].includes(pack.status) && <div className="flex min-h-72 items-center justify-center border border-slate-200 bg-white"><div className="text-center"><Loader2 className="mx-auto h-9 w-9 animate-spin text-fuchsia-600" /><p className="mt-4 font-semibold">Creating your ranked Shorts</p><p className="mt-1 text-sm text-slate-500">You can leave this page and return later.</p></div></div>}
      {pack.clipping_pack_clips?.length > 0 && <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{pack.clipping_pack_clips.map((clip) => <article key={clip.id} className="overflow-hidden border border-slate-200 bg-white"><div className="aspect-[9/16] bg-black">{clip.video_url ? <video src={clip.video_url} controls playsInline className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-white/60">{clip.status}</div>}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wider text-fuchsia-600">#{clip.rank} pick</span><h3 className="mt-1 line-clamp-2 font-bold">{clip.title}</h3></div>{clip.video_url && <a href={clip.video_url} download title="Download" className="border border-slate-200 p-2"><Download className="h-4 w-4" /></a>}</div>{clip.status === "ready" && <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" /> Ready to publish</p>}{clip.error_message && <p className="mt-2 text-xs text-red-600">{clip.error_message}</p>}</div></article>)}</div>}
    </section>}
    {recent.length > 0 && <section className="mt-12 border-t border-slate-200 pt-6"><h2 className="font-bold">Recent clipping projects</h2><div className="mt-4 flex gap-3 overflow-x-auto pb-2">{recent.map((item) => <button key={item.id} onClick={() => setPack(item)} className="min-w-60 border border-slate-200 bg-white p-4 text-left"><p className="truncate font-semibold">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.status} · {new Date(item.created_at).toLocaleDateString()}</p></button>)}</div></section>}
  </div></main>;
}
