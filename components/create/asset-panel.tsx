"use client";

/**
 * Right-rail Assets panel (CTO design): tabs (My Faces / Uploads), search,
 * thumbnail grids, click-to-insert into the prompt composer. Everything is
 * data-driven + self-service — no hard-coded assets.
 */

import { useMemo, useState } from "react";
import { ImagePlus, Loader2, Search, Sparkles, Film, Palette } from "lucide-react";
import { FacesManager, type FaceAsset } from "@/components/create/faces-manager";
import type { MediaRefData } from "@/components/create/prompt-composer";

type Tab = "faces" | "uploads";

interface AssetPanelProps {
  faces: FaceAsset[];
  facesLoading?: boolean;
  onReloadFaces: () => void;
  uploads: MediaRefData[];
  onUploadImage: (file: File) => void;
  uploading?: boolean;
  onInsert: (m: MediaRefData) => void;
}

export function AssetPanel({
  faces,
  facesLoading,
  onReloadFaces,
  uploads,
  onUploadImage,
  uploading,
  onInsert,
}: AssetPanelProps) {
  const [tab, setTab] = useState<Tab>("faces");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filteredFaces = useMemo(
    () => (q ? faces.filter((f) => (f.name || "").toLowerCase().includes(q)) : faces),
    [faces, q],
  );
  const filteredUploads = useMemo(
    () => (q ? uploads.filter((u) => u.label.toLowerCase().includes(q)) : uploads),
    [uploads, q],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Assets
        </h3>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-muted/40 p-1">
        {([
          ["faces", "My Faces"],
          ["uploads", "Uploads"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets…"
          className="w-full rounded-lg border border-border/40 bg-background py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none"
        />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "faces" && (
          <FacesManager
            faces={filteredFaces}
            loading={facesLoading}
            onReload={onReloadFaces}
            onInsert={(f) =>
              onInsert({
                refType: "face",
                label: f.name || "face",
                assetId: f.asset_id,
                provider: "byteplus",
                thumb: f.thumb_url ?? null,
              })
            }
          />
        )}

        {tab === "uploads" && (
          <div className="space-y-4">
            {/* Images */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Images</span>
                <label
                  className={`flex items-center gap-1 text-[11px] font-medium ${
                    uploading ? "cursor-wait opacity-60" : "cursor-pointer text-primary hover:underline"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadImage(f);
                      e.target.value = "";
                    }}
                  />
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                  Upload
                </label>
              </div>
              {filteredUploads.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/40 px-3 py-4 text-center text-[11px] text-muted-foreground/50">
                  No uploads yet. Click <span className="font-medium">Upload</span> to add a reference image.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filteredUploads.map((u, i) => (
                    <button
                      key={`${u.label}-${i}`}
                      type="button"
                      onClick={() => onInsert(u)}
                      className="aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/30 hover:border-primary/40"
                      title={`Insert ${u.label}`}
                    >
                      {u.thumb || u.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={(u.thumb || u.url) as string} alt={u.label} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <ImagePlus className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Styles / Videos — not available yet (honest placeholder) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-dashed border-border/40 px-3 py-3 text-center">
                <Palette className="mx-auto mb-1 h-4 w-4 text-muted-foreground/40" />
                <p className="text-[10px] text-muted-foreground/50">Styles — soon</p>
              </div>
              <div className="rounded-lg border border-dashed border-border/40 px-3 py-3 text-center">
                <Film className="mx-auto mb-1 h-4 w-4 text-muted-foreground/40" />
                <p className="text-[10px] text-muted-foreground/50">Videos — soon</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground/70">
          <span className="font-semibold text-foreground/80">How to use?</span> Click a tile, or type{" "}
          <span className="font-medium text-foreground/80">@</span> in the prompt to insert assets.
        </p>
      </div>
    </div>
  );
}
