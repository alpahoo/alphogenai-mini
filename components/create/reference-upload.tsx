"use client";

import { useState } from "react";
import { Upload, X, Loader2, Lock, User, Palette, Camera, Music, AlertTriangle, Sparkles } from "lucide-react";
import type { ReferenceItem, ReferenceRole } from "@/lib/types";

interface SlotMeta {
  role: ReferenceRole;
  label: string;
  hint: string;
  icon: typeof User;
  accept: string;
  mediaType: "images" | "videos" | "audio";
}

// Multi-character support: up to FACE_MAX distinct face references, each stored
// under its own key but all sharing the role "character_face". The backend
// groups them into images[] and sends them as reference_image_urls[] (cap 9).
const FACE_MAX = 4;
const FACE_KEYS = [
  "character_face",
  "character_face_2",
  "character_face_3",
  "character_face_4",
];

const FACE_META: SlotMeta = {
  role: "character_face",
  label: "Character Face",
  hint: "Identity reference image",
  icon: User,
  accept: "image/*",
  mediaType: "images",
};

// Single-instance slots (one each).
const OTHER_SLOTS: SlotMeta[] = [
  { role: "outfit_style", label: "Style / Outfit", hint: "Visual style reference image", icon: Palette, accept: "image/*", mediaType: "images" },
  { role: "camera_motion", label: "Camera Motion", hint: "Movement reference video", icon: Camera, accept: "video/*", mediaType: "videos" },
  { role: "mood", label: "Mood / Rhythm", hint: "Audio mood reference", icon: Music, accept: "audio/*", mediaType: "audio" },
];

// V1 does not support video/audio reference slots yet — mark as coming soon.
const COMING_SOON_ROLES: Set<ReferenceRole> = new Set(["camera_motion", "mood"]);

interface ReferenceUploadProps {
  references: Record<string, ReferenceItem>;
  onChange: (refs: Record<string, ReferenceItem>) => void;
  locked?: boolean;
  /** Whether the currently selected engine supports character references.
   *  When false AND image refs are uploaded, a non-blocking warning is shown. */
  engineSupportsRefs?: boolean;
}

export function ReferenceUpload({ references, onChange, locked, engineSupportsRefs = true }: ReferenceUploadProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const hasImageRefs = Object.entries(references).some(
    ([k, v]) => !!v && (k.startsWith("character_face") || k === "outfit_style"),
  );

  const handleUpload = async (key: string, meta: SlotMeta, file: File) => {
    setUploading(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // V1 Étape A: target the private `references` bucket. The route
      // returns { url: <6h signed URL>, storage_path: "<user_id>/<uuid>.<ext>" }.
      // `storage_path` is the source of truth; `url` is preview-only.
      const res = await fetch("/api/upload?bucket=references", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const ref: ReferenceItem = {
        role: meta.role,
        url: data.url,
        // V1: persist canonical path. May be undefined for legacy / fallback
        // (older deploys), in which case downstream code uses `url` directly.
        ...(typeof data.storage_path === "string" && { storage_path: data.storage_path }),
        mime_type: file.type,
        filename: file.name,
        weight: 0.7, // V1 default, not exposed in UI
      };

      onChange({ ...references, [key]: ref });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeRef = (key: string) => {
    const next = { ...references };
    delete next[key];
    onChange(next);
  };

  if (locked) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-muted-foreground">References (Pro/Premium)</span>
        </div>
        <p className="text-xs text-muted-foreground/60">
          Upload reference images, videos, and audio to guide AI generation.
          Available with Pro plan.
        </p>
      </div>
    );
  }

  // Visible face slots: every filled face + one trailing empty slot to add the
  // next one (up to FACE_MAX). Always show at least the first slot.
  const filledFaceKeys = FACE_KEYS.filter((k) => references[k]);
  const visibleFaceKeys = [...filledFaceKeys];
  if (visibleFaceKeys.length < FACE_MAX) {
    const nextEmpty = FACE_KEYS.find((k) => !references[k]);
    if (nextEmpty) visibleFaceKeys.push(nextEmpty);
  }
  if (visibleFaceKeys.length === 0) visibleFaceKeys.push(FACE_KEYS[0]);

  const renderSlot = (key: string, meta: SlotMeta, label: string) => {
    const ref = references[key];
    const isUploading = uploading === key;
    const Icon = meta.icon;
    const isComingSoon = COMING_SOON_ROLES.has(meta.role);

    return (
      <div
        key={key}
        className={`rounded-xl border border-border/40 bg-card/50 p-3${isComingSoon ? " opacity-60" : ""}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">{label}</span>
          {isComingSoon && (
            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 leading-tight">
              Coming soon
            </span>
          )}
        </div>

        {ref ? (
          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
            <span className="text-xs text-primary truncate max-w-[140px]">
              {ref.filename || "Uploaded"}
            </span>
            <button
              type="button"
              onClick={() => removeRef(key)}
              className="rounded-full p-1 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label className={`flex h-12 items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/10 text-xs text-muted-foreground/60 transition-colors${
            isComingSoon ? " cursor-default" : " cursor-pointer hover:border-primary/30 hover:bg-primary/5"
          }`}>
            {!isComingSoon && (
              <input
                type="file"
                accept={meta.accept}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(key, meta, f);
                  e.target.value = "";
                }}
                className="hidden"
                disabled={isUploading}
              />
            )}
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isComingSoon ? (
              <span className="text-muted-foreground/40">Not available yet</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                {meta.hint}
              </span>
            )}
          </label>
        )}
      </div>
    );
  };

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
        <User className="h-4 w-4 text-teal-500" />
        References <span className="text-muted-foreground/50 font-normal text-xs">(optional)</span>
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {/* Multi-character faces (up to FACE_MAX) */}
        {visibleFaceKeys.map((k, i) =>
          renderSlot(k, FACE_META, i === 0 ? "Character Face" : `Character Face ${i + 1}`),
        )}
        {/* Single-instance slots */}
        {OTHER_SLOTS.map((slot) => renderSlot(slot.role, slot, slot.label))}
      </div>

      {filledFaceKeys.length >= 1 && (
        <p className="text-xs text-muted-foreground/50 mt-2">
          {filledFaceKeys.length}/{FACE_MAX} character{filledFaceKeys.length > 1 ? "s" : ""} added
          {filledFaceKeys.length < FACE_MAX
            ? " — add another to put multiple people in one scene."
            : " (max reached)."}
        </p>
      )}

      {/* ── Warning: refs uploaded but engine doesn't support them ── */}
      {hasImageRefs && !engineSupportsRefs && (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-amber-600 dark:text-amber-300/90">
              This model does not currently support character references.
              Uploaded references will be ignored.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 inline" />
              For best character consistency, try Seedance 2.0 or Kling O3.
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground/50 mt-2">
        References are used when supported by the selected engine. Ignored safely otherwise.
      </p>
    </div>
  );
}

/** Convert the flat record to the structured ReferencePayload for API. */
export function buildReferencePayload(refs: Record<string, ReferenceItem>): Record<string, ReferenceItem[]> | undefined {
  const items = Object.values(refs);
  if (items.length === 0) return undefined;

  const payload: Record<string, ReferenceItem[]> = {};
  for (const item of items) {
    // Determine media category from mime_type or role
    let category: string;
    if (item.mime_type?.startsWith("video/")) category = "videos";
    else if (item.mime_type?.startsWith("audio/")) category = "audio";
    else category = "images";

    if (!payload[category]) payload[category] = [];
    payload[category].push(item);
  }
  return payload;
}
