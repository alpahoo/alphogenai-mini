"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_NAME_LENGTH, cleanName, type LibraryItem } from "@/lib/studio/reference-library";
import type { StudioState } from "./use-studio";

async function api<T>(res: Response): Promise<T> {
  const d = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(d.error ?? "Reference library unavailable");
  return d;
}

/**
 * The permanent reference library, inside the Create panel. Choosing an image only attaches it to the form;
 * it never starts a generation. Deleting a reference needs a confirmation and never touches a generation.
 */
export function ReferenceLibrary({ s, label, enabled }: { s: StudioState; label: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [max, setMax] = useState(60);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const attached = s.reference?.path;

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: LibraryItem[]; max: number }>(await fetch("/api/admin/studio/references", { cache: "no-store" }));
      setItems(d.items); setMax(d.max); setError("");
    } catch (e) { setItems(prev => prev ?? []); setError(e instanceof Error ? e.message : "Reference library unavailable"); }
  }, []);
  useEffect(() => {
    if (!enabled || !open) return;
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("studio:reference-promoted", refresh);
    return () => window.removeEventListener("studio:reference-promoted", refresh);
  }, [enabled, open, load]);

  const save = async () => {
    if (!pending) return;
    const name = cleanName(pending.name);
    if (!name) { setError(`Give the reference a name (1 to ${MAX_NAME_LENGTH} characters)`); return; }
    setBusy("save"); setError("");
    try {
      const form = new FormData(); form.append("file", pending.file); form.append("name", name);
      const d = await api<{ item: LibraryItem }>(await fetch("/api/admin/studio/references", { method: "POST", body: form }));
      setItems(prev => [d.item, ...(prev ?? [])]); setPending(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(null); }
  };

  const remove = async (item: LibraryItem) => {
    setBusy(item.id); setError("");
    try {
      await api(await fetch(`/api/admin/studio/references?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }));
      setItems(prev => (prev ?? []).filter(i => i.id !== item.id));
      if (attached === item.path) s.clearReference();
      setConfirming(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setBusy(null); }
  };

  const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-8";
  return (
    <div className="space-y-2" data-testid="reference-library">
      <button type="button" onClick={() => setOpen(o => !o)} disabled={!enabled} aria-expanded={open} className={btn}
        title={enabled ? undefined : "Not available with the current settings"}>
        <FolderOpen className="h-3.5 w-3.5" />Library{items ? ` (${items.length})` : ""}
      </button>
      {open && (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Saved images, kept until you delete them. Choose one as the {label.toLowerCase()}; it is not removed when a generation is deleted.</p>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          {items === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading library" />
            : items.length === 0 ? <p className="text-xs text-muted-foreground">No saved image yet.</p>
            : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map(item => (
                  <li key={item.id} className="relative min-w-0">
                    {confirming === item.id ? (
                      <div role="alertdialog" aria-label="Confirm deletion" className="flex h-full min-h-[8rem] flex-col justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-2 text-xs">
                        <p className="leading-snug">Delete “{item.name}” from the library? This cannot be undone.</p>
                        <div className="flex gap-1.5">
                          <button type="button" disabled={busy === item.id} onClick={() => void remove(item)} className="min-h-10 flex-1 rounded-lg bg-red-500/90 px-2 text-white hover:bg-red-500 disabled:opacity-60 lg:min-h-8">{busy === item.id ? "…" : "Delete"}</button>
                          <button type="button" disabled={busy === item.id} onClick={() => setConfirming(null)} className="min-h-10 flex-1 rounded-lg border border-border/60 px-2 text-muted-foreground hover:bg-muted/50 lg:min-h-8">Cancel</button>
                        </div>
                      </div>
                    ) : (<>
                      <button type="button" onClick={() => s.selectLibraryReference(item)} aria-pressed={attached === item.path} aria-label={`Use ${item.name}`} title={`Use “${item.name}”`}
                        className={cn("block w-full overflow-hidden rounded-xl border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60",
                          attached === item.path ? "border-primary bg-primary/10" : "border-border/60 hover:border-foreground/30")}>
                        {item.thumb_url
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived private signed URL
                          ? <img src={item.thumb_url} alt="" draggable={false} className="aspect-square w-full bg-black/30 object-cover" />
                          : <span className="grid aspect-square w-full place-items-center bg-black/30 text-xs text-muted-foreground">No preview</span>}
                        <span className="flex items-center gap-1 px-2 py-1.5 text-xs"><span className="min-w-0 flex-1 truncate">{item.name}</span>{attached === item.path && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="In use" />}</span>
                      </button>
                      <button type="button" onClick={() => setConfirming(item.id)} aria-label={`Delete ${item.name}`} title="Delete from the library"
                        className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg bg-black/50 text-white/80 backdrop-blur transition hover:bg-red-500/80 lg:h-8 lg:w-8"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>)}
                  </li>
                ))}
              </ul>
            )}
          {pending ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                <span className="sr-only">Name</span>
                <input value={pending.name} maxLength={MAX_NAME_LENGTH} onChange={e => setPending({ ...pending, name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") void save(); }}
                  placeholder="Name, for example Luz" className="h-10 w-full min-w-0 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground lg:h-8" />
              </label>
              <button type="button" disabled={busy === "save"} onClick={() => void save()} className={btn}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save</button>
              <button type="button" disabled={busy === "save"} onClick={() => setPending(null)} className={btn}>Cancel</button>
            </div>
          ) : (
            <button type="button" disabled={(items?.length ?? 0) >= max} onClick={() => input.current?.click()} className={btn}><Plus className="h-3.5 w-3.5" />Add to library</button>
          )}
          <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp"
            onChange={e => { const f = e.target.files?.[0]; if (f) setPending({ file: f, name: f.name.replace(/\.[^.]+$/, "").slice(0, MAX_NAME_LENGTH) }); e.target.value = ""; }} />
        </div>
      )}
    </div>
  );
}
