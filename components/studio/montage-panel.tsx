"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, ListVideo, Loader2, Play, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_MONTAGE_CLIPS, MAX_NAME_LENGTH, MIN_MONTAGE_CLIPS, type MontageItem } from "@/lib/montage/files";
import { canMakeMontage, formatBytes, montageRequestBody, type MontageAudio } from "@/lib/montage/select";

const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-8";

async function api<T>(res: Response, fallback: string): Promise<T> {
  const d = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(d.error ?? fallback);
  return d;
}

/**
 * Selection bar of the montage mode: the clips chosen in the history (in order), the sound to use, an optional name.
 * Making a montage joins finished videos into one private file. It starts no generation and reserves nothing.
 */
export function MontageBar({ picked, labelOf, audio, onAudio, onRemove, onClear, onCreated }: {
  picked: string[]; labelOf: (id: string) => string; audio: MontageAudio; onAudio: (a: MontageAudio) => void;
  onRemove: (id: string) => void; onClear: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const make = async () => {
    setBusy(true); setError("");
    try {
      await api(await fetch("/api/admin/studio/montages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(montageRequestBody(picked, audio, name)) }), "The montage could not be made");
      setName(""); onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : "The montage could not be made"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-5 mb-3 space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-3" data-testid="montage-bar">
      <p className="text-xs text-muted-foreground">Choose finished videos in the order you want, then join them into one file. Only videos of the same format can be joined.</p>
      {picked.length === 0 ? <p className="text-xs text-muted-foreground">No clip chosen yet.</p> : (
        <ol className="flex flex-wrap gap-1.5" aria-label="Clips in order">
          {picked.map((id, i) => (
            <li key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 py-1 pl-2.5 pr-1 text-xs">
              <span className="font-mono text-[10px] text-primary">{i + 1}</span><span className="max-w-[10rem] truncate">{labelOf(id)}</span>
              <button type="button" onClick={() => onRemove(id)} aria-label={`Remove clip ${i + 1}`} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground lg:h-6 lg:w-6"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Sound of the montage" className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
          <span className="px-1.5 text-xs text-muted-foreground">Sound</span>
          {(["corrected", "original"] as const).map(a => (
            <button key={a} type="button" role="radio" aria-checked={audio === a} onClick={() => onAudio(a)}
              className={cn("min-h-9 rounded-lg px-2.5 py-1 text-xs capitalize transition lg:min-h-7", audio === a ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{a}</button>
          ))}
        </div>
        <label className="min-w-0 flex-[1_1_9rem] text-xs">
          <span className="sr-only">Montage name</span>
          <input value={name} maxLength={MAX_NAME_LENGTH} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && canMakeMontage(picked) && !busy) void make(); }}
            placeholder="Name (optional)" className="h-10 w-full min-w-0 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground lg:h-8" />
        </label>
        <button type="button" disabled={!canMakeMontage(picked) || busy} onClick={() => void make()} className={cn(btn, "border-primary/40 text-foreground")}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListVideo className="h-3.5 w-3.5" />}{busy ? "Joining…" : `Make montage (${picked.length})`}
        </button>
        <button type="button" onClick={onClear} disabled={busy || picked.length === 0} className={btn}>Clear</button>
      </div>
      {picked.length < MIN_MONTAGE_CLIPS && <p className="text-xs text-muted-foreground">Choose at least {MIN_MONTAGE_CLIPS} clips (up to {MAX_MONTAGE_CLIPS}).</p>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function MontagePlayer({ item, onClose }: { item: MontageItem; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(item.url);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const refresh = async () => {
    if (retried) { setFailed(true); return; }
    setRetried(true);
    try { const d = await api<{ url: string }>(await fetch(`/api/admin/studio/montages?id=${encodeURIComponent(item.id)}`, { cache: "no-store" }), "Montage unavailable"); setUrl(d.url); } catch { setFailed(true); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Montage ${item.name}`} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative max-h-full w-full max-w-md" onClick={e => e.stopPropagation()}>
        <button type="button" autoFocus onClick={onClose} aria-label="Close player" className="absolute -top-1 right-0 z-10 grid h-11 w-11 -translate-y-full place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><X className="h-5 w-5" /></button>
        {failed || !url ? <p role="alert" className="rounded-2xl bg-black/60 p-6 text-center text-sm text-white">This montage cannot be played right now. Try again.</p>
          : <video key={url} src={url} controls autoPlay playsInline onError={() => void refresh()} className="max-h-[80vh] w-full rounded-2xl bg-black object-contain" />}
        <p className="mt-2 truncate text-center text-xs text-white/80">{item.name}</p>
      </div>
    </div>
  );
}

/** The administrator's montages: play, download, delete with a confirmation. */
export function MontageList({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<MontageItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<MontageItem | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const d = await api<{ items: MontageItem[] }>(await fetch("/api/admin/studio/montages", { cache: "no-store" }), "Montages unavailable"); setItems(d.items); setError(""); }
    catch (e) { setItems(prev => prev ?? []); setError(e instanceof Error ? e.message : "Montages unavailable"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const download = async (item: MontageItem) => {
    setBusy(item.id); setError("");
    try {
      const d = await api<{ url: string }>(await fetch(`/api/admin/studio/montages?id=${encodeURIComponent(item.id)}&download=1`, { cache: "no-store" }), "Download unavailable");
      const a = document.createElement("a"); a.href = d.url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError(e instanceof Error ? e.message : "Download unavailable"); }
    finally { setBusy(null); }
  };
  const remove = async (item: MontageItem) => {
    setBusy(item.id); setError("");
    try { await api(await fetch(`/api/admin/studio/montages?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }), "Delete failed"); setItems(prev => (prev ?? []).filter(i => i.id !== item.id)); setConfirming(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setBusy(null); }
  };

  if (items !== null && items.length === 0 && !error) return null;
  return (
    <div className="px-5 pb-4" data-testid="montage-list">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex min-h-10 w-full items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground lg:min-h-8">
        <ListVideo className="h-3.5 w-3.5" />Montages{items ? ` (${items.length})` : ""}<ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {open && items && (
        <ul className="mt-1 grid max-h-64 grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto">
          {items.map(item => (
            <li key={item.id} className="rounded-2xl border border-border/50 p-2.5">
              {confirming === item.id ? (
                <div role="alertdialog" aria-label="Confirm deletion" className="space-y-2 text-xs">
                  <p>Delete the montage “{item.name}”? The generations it was made from are not affected. This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === item.id} onClick={() => void remove(item)} className="min-h-10 flex-1 rounded-lg bg-red-500/90 px-2 text-white hover:bg-red-500 disabled:opacity-60 lg:min-h-8">{busy === item.id ? "Deleting…" : "Delete"}</button>
                    <button type="button" disabled={busy === item.id} onClick={() => setConfirming(null)} className="min-h-10 flex-1 rounded-lg border border-border/60 px-2 text-muted-foreground hover:bg-muted/50 lg:min-h-8">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-xs text-foreground">{item.name}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{[item.created_at && new Date(item.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), formatBytes(item.bytes)].filter(Boolean).join(" · ")}</p></div>
                  <button type="button" onClick={() => setPlaying(item)} className={btn} aria-label={`Play ${item.name}`}><Play className="h-3.5 w-3.5" />Play</button>
                  <button type="button" disabled={busy === item.id} onClick={() => void download(item)} className={btn} aria-label={`Download ${item.name}`}>{busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download</button>
                  <button type="button" onClick={() => setConfirming(item.id)} className={cn(btn, "px-2.5 hover:text-red-400")} aria-label={`Delete ${item.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {playing && <MontagePlayer item={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
