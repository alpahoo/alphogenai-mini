"use client";

/**
 * Self-service verified-face manager (HeyGen-style photo tiles).
 *
 * The user fully manages their BytePlus verified faces here — add (photo +
 * Asset ID), attach/replace a photo, delete. Nothing is hard-coded: every tile
 * comes from /api/byteplus-assets (per-user, RLS). Tiles show the PHOTO only;
 * the Asset ID is hidden metadata used under the hood for generation.
 *
 * Clicking a tile inserts a @face chip into the prompt composer.
 */

import { useRef, useState } from "react";
import { Plus, X, Camera, Loader2, Check } from "lucide-react";
import { type AssetCompat, compatToneClass } from "@/lib/engine-intentions";

export interface FaceAsset {
  id: string;
  asset_id: string;
  name: string | null;
  thumb_url?: string | null;
}

interface FacesManagerProps {
  faces: FaceAsset[];
  loading?: boolean;
  onReload: () => void;
  onInsert: (f: FaceAsset) => void;
  /** Compatibility of a verified face with the currently selected engine. */
  compat?: AssetCompat | null;
}

/** Upload an image to the private references bucket → returns its storage_path. */
async function uploadPhoto(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload?bucket=references", { method: "POST", body: fd });
  if (!res.headers.get("content-type")?.includes("application/json")) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return typeof data.storage_path === "string" ? data.storage_path : null;
}

export function FacesManager({ faces, loading, onReload, onInsert, compat }: FacesManagerProps) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Add-face form
  const [newAssetId, setNewAssetId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);

  // Per-tile "attach photo" file input
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetId = useRef<string | null>(null);

  const resetForm = () => {
    setNewAssetId("");
    setNewName("");
    setNewPhoto(null);
    setNewPhotoPreview(null);
    setErr(null);
  };

  const submitNew = async () => {
    const assetId = newAssetId.trim();
    if (!/^asset-/.test(assetId)) {
      setErr("Paste a valid BytePlus Asset ID (asset-…).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      let thumbPath: string | null = null;
      if (newPhoto) thumbPath = await uploadPhoto(newPhoto);
      const res = await fetch("/api/byteplus-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          name: newName.trim() || "Face",
          ...(thumbPath && { thumb_path: thumbPath }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add face");
      resetForm();
      setAdding(false);
      onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add face");
    } finally {
      setBusy(false);
    }
  };

  const onAttachPhoto = async (file: File) => {
    const id = attachTargetId.current;
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const thumbPath = await uploadPhoto(file);
      if (!thumbPath) throw new Error("Upload failed");
      const res = await fetch("/api/byteplus-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, thumb_path: thumbPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set photo");
      onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to set photo");
    } finally {
      setBusy(false);
      attachTargetId.current = null;
    }
  };

  const deleteFace = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/byteplus-assets?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete");
      }
      onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Hidden input for attaching a photo to an existing face */}
      <input
        ref={attachInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAttachPhoto(f);
          e.target.value = "";
        }}
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {loading && faces.length === 0 ? (
          <div className="col-span-full flex items-center gap-2 py-3 text-xs text-muted-foreground/60">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your faces…
          </div>
        ) : (
          faces.map((f) => (
            <div
              key={f.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-muted/30"
            >
              {f.thumb_url ? (
                <button
                  type="button"
                  onClick={() => onInsert(f)}
                  className="block h-full w-full"
                  title={`Insert ${f.name || "face"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.thumb_url} alt={f.name || "face"} className="h-full w-full object-cover" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    attachTargetId.current = f.id;
                    attachInputRef.current?.click();
                  }}
                  className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/60 hover:text-primary"
                  title="Add a photo for this face"
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-[10px]">Add photo</span>
                </button>
              )}

              {/* Verified tick */}
              <span className="pointer-events-none absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-2.5 w-2.5" />
              </span>

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteFace(f.id)}
                disabled={busy}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                title="Delete face"
              >
                <X className="h-3 w-3" />
              </button>

              {/* Compatibility badge (relative to selected engine) */}
              {compat && (
                <span
                  className={`pointer-events-none absolute inset-x-1 bottom-1 truncate rounded px-1 py-0.5 text-center text-[9px] font-medium ${compatToneClass(
                    compat.tone,
                  )}`}
                >
                  {compat.label}
                </span>
              )}
            </div>
          ))
        )}

        {/* Add tile */}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 text-muted-foreground/60 transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[10px]">Add face</span>
          </button>
        )}
      </div>

      {/* Add-face form */}
      {adding && (
        <div className="mt-3 rounded-xl border border-border/40 bg-muted/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Add a verified face</span>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setAdding(false);
              }}
              className="text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-3">
            {/* Photo picker */}
            <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/50 bg-background hover:border-primary/40">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setNewPhoto(f);
                    setNewPhotoPreview(URL.createObjectURL(f));
                  }
                  e.target.value = "";
                }}
              />
              {newPhotoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={newPhotoPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground/50" />
              )}
            </label>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g. Me)"
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-xs text-foreground"
              />
              <input
                type="text"
                value={newAssetId}
                onChange={(e) => setNewAssetId(e.target.value)}
                placeholder="BytePlus Asset ID (asset-…)"
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-xs font-mono text-foreground"
              />
            </div>
          </div>
          {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
          <div className="mt-2 flex items-center justify-between">
            <a
              href="https://console.byteplus.com/ark/region:ark+ap-southeast-1/openManagement"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary/80 hover:underline"
            >
              Where&apos;s my Asset ID? ↗
            </a>
            <button
              type="button"
              onClick={submitNew}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save face
            </button>
          </div>
        </div>
      )}

      {err && !adding && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
