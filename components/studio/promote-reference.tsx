"use client";

import { useState } from "react";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { MAX_NAME_LENGTH, cleanName } from "@/lib/studio/reference-library";
import type { StudioAsset } from "./types";

const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-8";

/**
 * Copies an image result into the permanent reference library, so a video model can use it as its first frame.
 * Nothing is generated and nothing is reserved: the server only reads the result file and stores a copy.
 */
export function PromoteReference({ asset }: { asset: StudioAsset }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const save = async () => {
    const clean = cleanName(name);
    if (!clean) { setError(`Give the reference a name (1 to ${MAX_NAME_LENGTH} characters)`); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/studio/references/promote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset_id: asset.id, name: clean }) });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not save the reference");
      window.dispatchEvent(new Event("studio:reference-promoted"));
      setSaved(clean); setOpen(false); setName("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the reference"); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <>
        <button type="button" onClick={() => { setOpen(true); setSaved(""); }} className={btn} title="Save this image to the reference library to use it as a video's first frame"><BookmarkPlus className="h-3.5 w-3.5" />Use as reference</button>
        {saved && <p role="status" className="w-full text-xs text-muted-foreground">Saved to the library as “{saved}”. Choose a video model in Create, then pick it as the first frame.</p>}
      </>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2" data-testid="promote-reference">
      <label className="min-w-0 flex-1 text-xs text-muted-foreground">
        <span className="sr-only">Reference name</span>
        <input value={name} maxLength={MAX_NAME_LENGTH} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void save(); if (e.key === "Escape") setOpen(false); }}
          placeholder="Name, for example Luz in the courtyard" className="h-10 w-full min-w-0 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground lg:h-8" />
      </label>
      <button type="button" disabled={busy} onClick={() => void save()} className={btn}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save</button>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); }} className={btn}>Cancel</button>
      {error && <p role="alert" className="w-full text-xs text-red-400">{error}</p>}
    </div>
  );
}
