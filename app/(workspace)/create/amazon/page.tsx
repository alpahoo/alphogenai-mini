"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, ImagePlus, Loader2, PackageCheck, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { COMMERCE_ROLES, type CommerceImageRole, type CommercePreset } from "@/lib/commerce-pack";

type Asset = { id: string; role: CommerceImageRole; status: string; image_url: string | null; error_message: string | null };
type Pack = { id: string; title: string; product_name: string; status: string; created_at: string; commerce_pack_assets: Asset[] };

const ROLE_COPY: Record<CommerceImageRole, { title: string; description: string }> = {
  hero: { title: "Hero", description: "Clean marketplace main image" },
  lifestyle: { title: "Lifestyle", description: "Product shown in a believable setting" },
  feature: { title: "Feature card", description: "Visual with verified feature callouts" },
  detail: { title: "Close-up", description: "Materials and finish in detail" },
};

const PRESETS: { value: CommercePreset; label: string }[] = [
  { value: "minimal_studio", label: "Minimal studio" },
  { value: "premium_dark", label: "Premium dark" },
  { value: "natural_lifestyle", label: "Natural lifestyle" },
  { value: "modern_office", label: "Modern office" },
];

export default function AmazonPackPage() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [buyer, setBuyer] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [featureText, setFeatureText] = useState("");
  const [preset, setPreset] = useState<CommercePreset>("minimal_studio");
  const [images, setImages] = useState<string[]>([]);
  const [pack, setPack] = useState<Pack | null>(null);
  const [recent, setRecent] = useState<Pack[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again.");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetch("/api/commerce-packs", { headers: await authHeaders() });
      const json = await response.json();
      if (response.ok) setRecent(json.packs ?? []);
    } catch { /* The creation form remains usable if history fails. */ }
  }, [authHeaders]);

  useEffect(() => { void loadRecent(); }, [loadRecent]);

  const refreshPack = useCallback(async (id: string) => {
    const response = await fetch(`/api/commerce-packs/${id}`, { headers: await authHeaders() });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not refresh the pack.");
    setPack(json.pack);
    return json.pack as Pack;
  }, [authHeaders]);

  useEffect(() => {
    if (!pack || !pack.commerce_pack_assets.some((asset) => asset.status === "processing")) return;
    const timer = window.setInterval(() => { void refreshPack(pack.id).catch((e) => setError(e.message)); }, 4000);
    return () => window.clearInterval(timer);
  }, [pack, refreshPack]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setError("");
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, 14 - images.length)) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: form });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.url) throw new Error(json.error || `Could not upload ${file.name}.`);
        added.push(json.url);
      }
      setImages((current) => [...current, ...added].slice(0, 14));
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function start(role?: CommerceImageRole) {
    setBusy(true); setError("");
    try {
      let active = pack;
      if (!active) {
        const features = featureText.split("\n").map((value) => value.trim()).filter(Boolean);
        const response = await fetch("/api/commerce-packs", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ product_name: productName, category, target_buyer: buyer, source_url: sourceUrl, source_images: images, verified_features: features, preset }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Could not create the pack.");
        active = json.pack; setPack(active);
      }
      if (!active) throw new Error("Pack could not be prepared.");
      const response = await fetch(`/api/commerce-packs/${active.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(role ? { role } : {}),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not start the visuals.");
      await refreshPack(active.id); await loadRecent();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate the pack."); }
    finally { setBusy(false); }
  }

  function load(packToLoad: Pack) {
    setPack(packToLoad); setProductName(packToLoad.product_name); setError("");
    void refreshPack(packToLoad.id);
  }

  function newPack() {
    setPack(null); setProductName(""); setCategory(""); setBuyer(""); setSourceUrl(""); setFeatureText(""); setImages([]); setError("");
  }

  const readyCount = pack?.commerce_pack_assets.filter((asset) => asset.status === "ready").length ?? 0;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#15171a]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Link href="/create" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to Create</Link>
        <header className="mt-7 max-w-3xl">
          <span className="text-xs font-bold uppercase text-blue-600">Amazon product photography</span>
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Turn product photos into a complete listing pack</h1>
          <p className="mt-4 text-base text-slate-600">Four consistent, downloadable visuals built from your real product references.</p>
        </header>

        <div className="mt-9 grid gap-8 lg:grid-cols-[360px_1fr]">
          <section className="space-y-5">
            <div>
              <label className="text-sm font-semibold">Product photos</label>
              <button onClick={() => inputRef.current?.click()} disabled={uploading || images.length >= 14} className="mt-2 flex min-h-28 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-semibold hover:border-blue-400 disabled:opacity-50">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />} {uploading ? "Uploading..." : "Add product photos"}
              </button>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void upload(event.target.files)} />
              <div className="mt-2 grid grid-cols-4 gap-2">{images.map((url) => <div key={url} className="group relative aspect-square overflow-hidden border bg-white"><img src={url} alt="Product reference" className="h-full w-full object-cover" /><button onClick={() => setImages((all) => all.filter((item) => item !== url))} className="absolute right-1 top-1 hidden bg-white p-1 shadow group-hover:block" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
            </div>
            <Field label="Product name" value={productName} onChange={setProductName} placeholder="Powerbeats Pro 2" disabled={Boolean(pack)} />
            <Field label="Category" value={category} onChange={setCategory} placeholder="Wireless earbuds" disabled={Boolean(pack)} />
            <Field label="Target buyer" value={buyer} onChange={setBuyer} placeholder="Athletes and active commuters" disabled={Boolean(pack)} />
            <Field label="Product URL (optional)" value={sourceUrl} onChange={setSourceUrl} placeholder="https://..." disabled={Boolean(pack)} />
            <div><label className="text-sm font-semibold">Verified features</label><textarea value={featureText} onChange={(e) => setFeatureText(e.target.value)} disabled={Boolean(pack)} rows={4} placeholder={"Secure-fit ear hooks\nActive noise cancelling\nUp to 45 hours battery"} className="mt-2 w-full resize-none border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100" /><p className="mt-1 text-xs text-slate-500">One confirmed feature per line. These are the only claims used.</p></div>
            <div><label className="text-sm font-semibold">Visual direction</label><select value={preset} onChange={(e) => setPreset(e.target.value as CommercePreset)} disabled={Boolean(pack)} className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm">{PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            {!pack ? <button onClick={() => void start()} disabled={busy || uploading} className="flex w-full items-center justify-center gap-2 bg-[#15171a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate my Amazon pack</button> : <button onClick={newPack} className="w-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold">Start a new pack</button>}
            {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </section>

          <section>
            <div className="flex min-h-10 items-center justify-between"><div><h2 className="text-xl font-bold">{pack ? pack.title : "Your four deliverables"}</h2>{pack && <p className="text-sm text-slate-500">{readyCount}/4 ready</p>}</div>{readyCount === 4 && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><PackageCheck className="h-4 w-4" /> Pack complete</span>}</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{COMMERCE_ROLES.map((role) => {
              const asset = pack?.commerce_pack_assets.find((item) => item.role === role);
              return <article key={role} className="overflow-hidden border border-slate-200 bg-white">
                <div className="aspect-square bg-slate-100">{asset?.image_url ? <img src={asset.image_url} alt={`${ROLE_COPY[role].title} result`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">{asset?.status === "processing" ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImagePlus className="h-8 w-8" />}<span className="text-sm">{asset?.status === "processing" ? "Creating..." : "Waiting to generate"}</span></div>}</div>
                <div className="flex min-h-24 items-start justify-between gap-3 p-4"><div><h3 className="font-bold">{ROLE_COPY[role].title}</h3><p className="mt-1 text-xs text-slate-500">{ROLE_COPY[role].description}</p>{asset?.error_message && <p className="mt-2 text-xs text-red-600">{asset.error_message}</p>}</div><div className="flex gap-1">{asset?.image_url && <a href={asset.image_url} download title="Download" className="border border-slate-200 p-2 hover:bg-slate-50"><Download className="h-4 w-4" /></a>}{asset && (asset.status === "ready" || asset.status === "failed") && <button onClick={() => void start(role)} disabled={busy} title="Regenerate this visual" className="border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><RefreshCw className="h-4 w-4" /></button>}</div></div>
              </article>;
            })}</div>
          </section>
        </div>

        {recent.length > 0 && <section className="mt-14 border-t border-slate-200 pt-7"><h2 className="text-lg font-bold">Recent Amazon packs</h2><div className="mt-4 flex gap-3 overflow-x-auto pb-2">{recent.map((item) => <button key={item.id} onClick={() => load(item)} className="min-w-56 border border-slate-200 bg-white p-4 text-left hover:border-blue-400"><p className="truncate font-semibold">{item.product_name}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.status} · {new Date(item.created_at).toLocaleDateString()}</p>{item.status === "ready" && <Check className="mt-3 h-4 w-4 text-emerald-600" />}</button>)}</div></section>}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  return <div><label className="text-sm font-semibold">{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100" /></div>;
}
