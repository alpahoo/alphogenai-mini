"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, ImagePlus, Loader2, RefreshCw, ShieldCheck, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { HEADSHOT_ROLES, type HeadshotRole } from "@/lib/headshot-pack";

type Asset = { id: string; role: HeadshotRole; status: string; image_url: string | null; error_message: string | null };
type Pack = { id: string; title: string; subject_name: string | null; status: string; created_at: string; headshot_pack_assets: Asset[] };
const COPY: Record<HeadshotRole, { title: string; description: string }> = {
  studio: { title: "Studio", description: "Clean and versatile" },
  executive: { title: "Executive", description: "Leadership profile" },
  natural: { title: "Natural", description: "Warm and approachable" },
  creative: { title: "Creative", description: "Modern personal brand" },
};

const CLIENT_IMAGE_MAX_EDGE = 1600;
const CLIENT_IMAGE_QUALITY = 0.9;

async function prepareHeadshotUpload(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name} is not a readable JPG, PNG or WebP image.`);
  }

  try {
    const scale = Math.min(1, CLIENT_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`Could not prepare ${file.name}.`);

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", CLIENT_IMAGE_QUALITY));
    if (!blob) throw new Error(`Could not prepare ${file.name}.`);

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export default function HeadshotPage() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [pack, setPack] = useState<Pack | null>(null);
  const [recent, setRecent] = useState<Pack[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Please sign in again.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, [supabase]);
  const loadRecent = useCallback(async () => {
    try { const res = await fetch("/api/headshot-packs", { headers: await authHeaders() }); const json = await res.json(); if (res.ok) setRecent(json.packs ?? []); } catch { /* form remains usable */ }
  }, [authHeaders]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/headshot-packs/${id}`, { headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Could not refresh the headshots.");
    setPack(json.pack); return json.pack as Pack;
  }, [authHeaders]);
  useEffect(() => {
    if (!pack?.headshot_pack_assets.some((asset) => asset.status === "processing")) return;
    const timer = window.setInterval(() => void refresh(pack.id).catch((e) => setError(e.message)), 4000);
    return () => window.clearInterval(timer);
  }, [pack, refresh]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setError(""); setUploadWarning("");
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, 6 - images.length)) {
        const prepared = await prepareHeadshotUpload(file);
        const form = new FormData(); form.append("file", prepared);
        const res = await fetch("/api/headshot-packs/upload", { method: "POST", body: form }); const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) throw new Error(json.error || `Could not upload ${file.name}.`);
        added.push(json.url);
        if (json.warning) setUploadWarning(json.warning);
      }
      setImages((current) => [...current, ...added].slice(0, 6));
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function generate(role?: HeadshotRole) {
    setBusy(true); setError("");
    try {
      let active = pack;
      if (!active) {
        const res = await fetch("/api/headshot-packs", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ name, source_images: images, consent }) });
        const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error(json.error || "Could not create the headshot pack.");
        active = json.pack; setPack(active);
      }
      const res = await fetch(`/api/headshot-packs/${active!.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(role ? { role } : {}) });
      const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error(json.error || "Could not start the headshots.");
      await refresh(active!.id); void loadRecent();
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); }
    finally { setBusy(false); }
  }

  const ready = pack?.headshot_pack_assets.filter((asset) => asset.status === "ready").length ?? 0;
  return <main className="min-h-screen bg-[#f7f8fa] px-5 py-8 text-slate-950">
    <div className="mx-auto max-w-6xl">
      <Link href="/create" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to create</Link>
      <header className="mt-7 max-w-2xl"><span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Professional Headshots</span><h1 className="mt-3 text-4xl font-black">One person. Four polished profiles.</h1><p className="mt-3 text-slate-600">Upload clear photos of the same person. AlphoGen creates a consistent professional set for profiles, teams and personal brands.</p></header>

      {!pack && <section className="mt-8 grid gap-7 border border-slate-200 bg-white p-6 md:grid-cols-[1fr_1.2fr]">
        <div><label className="text-sm font-bold">Name <span className="font-normal text-slate-400">(optional)</span></label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya Rivers" className="mt-2 w-full border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          <div className="mt-5 flex items-start gap-3 border border-blue-100 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><label className="text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mr-2" />I own these photos or have explicit permission to create professional portraits of this person.</label></div>
          {uploadWarning && <p className="mt-4 bg-amber-50 p-3 text-sm text-amber-800">{uploadWarning}</p>}
          {error && <p className="mt-4 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button onClick={() => void generate()} disabled={busy || uploading || !consent || images.length < 1} className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />} Create 4 headshots</button>
        </div>
        <div><div className="flex items-end justify-between"><div><h2 className="font-bold">Reference photos</h2><p className="text-sm text-slate-500">1-6 front-facing, well-lit photos of the same person.</p></div><span className="text-xs text-slate-400">{images.length}/6</span></div>
          <div className="mt-4 grid grid-cols-3 gap-3">{images.map((url, index) => <button key={url} onClick={() => setImages((current) => current.filter((_, i) => i !== index))} className="group relative aspect-square overflow-hidden border border-slate-200"><img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" /><span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-xs text-white opacity-0 group-hover:opacity-100">Remove</span></button>)}
            {images.length < 6 && <button onClick={() => inputRef.current?.click()} disabled={uploading} className="flex aspect-square flex-col items-center justify-center gap-2 border border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-500 hover:text-blue-600">{uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />} Add photo</button>}</div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </div>
      </section>}

      {pack && <section className="mt-9"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-bold">{pack.title}</h2><p className="text-sm text-slate-500">{ready}/4 ready</p></div><button onClick={() => { setPack(null); setImages([]); setConsent(false); setError(""); }} className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">New set</button></div>
        {error && <p className="mb-4 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{HEADSHOT_ROLES.map((role) => { const asset = pack.headshot_pack_assets.find((item) => item.role === role); return <article key={role} className="overflow-hidden border border-slate-200 bg-white"><div className="aspect-square bg-slate-100">{asset?.image_url ? <img src={asset.image_url} alt={`${COPY[role].title} headshot`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">{asset?.status === "processing" ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImagePlus className="h-8 w-8" />}<span className="text-sm">{asset?.status === "processing" ? "Creating..." : "Waiting"}</span></div>}</div><div className="flex min-h-24 justify-between gap-2 p-4"><div><h3 className="font-bold">{COPY[role].title}</h3><p className="mt-1 text-xs text-slate-500">{COPY[role].description}</p>{asset?.error_message && <p className="mt-2 text-xs text-red-600">{asset.error_message}</p>}</div><div className="flex gap-1">{asset?.image_url && <a href={asset.image_url} download title="Download" className="border border-slate-200 p-2"><Download className="h-4 w-4" /></a>}{asset && ["ready", "failed"].includes(asset.status) && <button onClick={() => void generate(role)} disabled={busy} title="Regenerate" className="border border-slate-200 p-2 disabled:opacity-40"><RefreshCw className="h-4 w-4" /></button>}</div></div></article>; })}</div>
      </section>}

      {recent.length > 0 && <section className="mt-12 border-t border-slate-200 pt-6"><h2 className="font-bold">Recent headshot sets</h2><div className="mt-4 flex gap-3 overflow-x-auto pb-2">{recent.map((item) => <button key={item.id} onClick={() => setPack(item)} className="min-w-56 border border-slate-200 bg-white p-4 text-left"><p className="truncate font-semibold">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.status} · {new Date(item.created_at).toLocaleDateString()}</p>{item.status === "ready" && <Check className="mt-3 h-4 w-4 text-emerald-600" />}</button>)}</div></section>}
    </div>
  </main>;
}
