"use client";

import { useState } from "react";
import { Upload, X, Loader2, Lock, User, Palette, Camera, Music } from "lucide-react";
import type { ReferenceItem, ReferenceRole } from "@/lib/types";

interface ReferenceSlot {
  role: ReferenceRole;
  label: string;
  hint: string;
  icon: typeof User;
  accept: string;
  mediaType: "images" | "videos" | "audio";
}

const SLOTS: ReferenceSlot[] = [
  { role: "character_face", label: "Character Face", hint: "Identity reference image", icon: User, accept: "image/*", mediaType: "images" },
  { role: "outfit_style", label: "Style / Outfit", hint: "Visual style reference image", icon: Palette, accept: "image/*", mediaType: "images" },
  { role: "camera_motion", label: "Camera Motion", hint: "Movement reference video", icon: Camera, accept: "video/*", mediaType: "videos" },
  { role: "mood", label: "Mood / Rhythm", hint: "Audio mood reference", icon: Music, accept: "audio/*", mediaType: "audio" },
];

interface ReferenceUploadProps {
  references: Record<string, ReferenceItem>;
  onChange: (refs: Record<string, ReferenceItem>) => void;
  locked?: boolean;
}

export function ReferenceUpload({ references, onChange, locked }: ReferenceUploadProps) {
  const [uploading, setUploading] = useState<string | null>(null);

  const handleUpload = async (slot: ReferenceSlot, file: File) => {
    setUploading(slot.role);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const ref: ReferenceItem = {
        role: slot.role,
        url: data.url,
        mime_type: file.type,
        filename: file.name,
        weight: 0.7, // V1 default, not exposed in UI
      };

      onChange({ ...references, [slot.role]: ref });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeRef = (role: string) => {
    const next = { ...references };
    delete next[role];
    onChange(next);
  };

  if (locked) {
    return (
      <div className="rounded-xl border border-border/20 bg-muted/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">References (Pro/Premium)</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Upload reference images, videos, and audio to guide AI generation.
          Available with Pro plan.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        References <span className="text-muted-foreground/50">(optional)</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SLOTS.map((slot) => {
          const ref = references[slot.role];
          const isUploading = uploading === slot.role;
          const Icon = slot.icon;

          return (
            <div
              key={slot.role}
              className="rounded-lg border border-border/30 bg-background/30 p-2.5"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium">{slot.label}</span>
              </div>

              {ref ? (
                <div className="flex items-center justify-between rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                  <span className="text-[10px] text-primary truncate max-w-[120px]">
                    {ref.filename || "Uploaded"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRef(slot.role)}
                    className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-dashed border-border/30 bg-muted/5 text-[10px] text-muted-foreground/60 hover:border-border hover:bg-muted/10 transition-colors">
                  <input
                    type="file"
                    accept={slot.accept}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(slot, f);
                      e.target.value = "";
                    }}
                    className="hidden"
                    disabled={isUploading}
                  />
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {slot.hint}
                    </span>
                  )}
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/40 mt-1.5">
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
