"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Image as ImageIcon,
  Check,
  Download,
  Type,
  Palette,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { JobScene } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThumbnailPickerProps {
  jobId: string;
  scenes: JobScene[];
  videoUrl: string;
  /** Initial thumbnail URL (from social_exports.thumbnail) */
  initialThumbnail?: string | null;
  /** Callback when thumbnail is selected/generated */
  onThumbnailChange?: (url: string) => void;
  /** Optional title for text overlay */
  title?: string;
}

interface ThumbnailCandidate {
  url: string;
  label: string;
  source: "scene" | "video" | "custom";
}

// ---------------------------------------------------------------------------
// Text overlay configuration
// ---------------------------------------------------------------------------

const OVERLAY_FONTS = [
  { label: "Bold", value: "bold 48px Inter, sans-serif" },
  { label: "Thin", value: "300 42px Inter, sans-serif" },
  { label: "Impact", value: "bold 52px Impact, sans-serif" },
] as const;

const OVERLAY_COLORS = [
  { label: "White", value: "#ffffff", shadow: "#000000" },
  { label: "Yellow", value: "#facc15", shadow: "#000000" },
  { label: "Cyan", value: "#22d3ee", shadow: "#000000" },
  { label: "Pink", value: "#f472b6", shadow: "#000000" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThumbnailPicker({
  jobId,
  scenes,
  videoUrl,
  initialThumbnail,
  onThumbnailChange,
  title,
}: ThumbnailPickerProps) {
  const [candidates, setCandidates] = useState<ThumbnailCandidate[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [overlayText, setOverlayText] = useState(title ?? "");
  const [showOverlay, setShowOverlay] = useState(false);
  const [fontIdx, setFontIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build candidate list from scenes
  useEffect(() => {
    const cands: ThumbnailCandidate[] = [];

    // Scene last frames
    scenes.forEach((s, i) => {
      if (s.last_frame_url) {
        cands.push({
          url: s.last_frame_url,
          label: `Scene ${i + 1}`,
          source: "scene",
        });
      }
    });

    // Scene clips (first frame — requires video poster)
    scenes.forEach((s, i) => {
      if (s.clip_url && !s.last_frame_url) {
        cands.push({
          url: s.clip_url,
          label: `Scene ${i + 1} clip`,
          source: "scene",
        });
      }
    });

    // If initial thumbnail exists and isn't already in list
    if (initialThumbnail && !cands.some((c) => c.url === initialThumbnail)) {
      cands.unshift({
        url: initialThumbnail,
        label: "Current",
        source: "custom",
      });
    }

    // Fallback: at least show something
    if (cands.length === 0 && videoUrl) {
      cands.push({ url: videoUrl, label: "Video", source: "video" });
    }

    setCandidates(cands);

    // Auto-select initial thumbnail if it matches
    if (initialThumbnail) {
      const idx = cands.findIndex((c) => c.url === initialThumbnail);
      if (idx >= 0) setSelectedIdx(idx);
    }
  }, [scenes, initialThumbnail, videoUrl]);

  // Render text overlay on canvas
  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candidates[selectedIdx] || !showOverlay) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth || 1280;
      canvas.height = img.naturalHeight || 720;

      // Draw image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw gradient overlay at bottom
      const grad = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);

      // Draw text
      if (overlayText.trim()) {
        const font = OVERLAY_FONTS[fontIdx];
        const color = OVERLAY_COLORS[colorIdx];
        ctx.font = font.value;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        // Shadow
        ctx.fillStyle = color.shadow;
        ctx.fillText(
          overlayText,
          canvas.width / 2 + 2,
          canvas.height - 30 + 2,
          canvas.width - 80,
        );

        // Text
        ctx.fillStyle = color.value;
        ctx.fillText(
          overlayText,
          canvas.width / 2,
          canvas.height - 30,
          canvas.width - 80,
        );
      }
    };
    img.src = candidates[selectedIdx].url;
  }, [candidates, selectedIdx, showOverlay, overlayText, fontIdx, colorIdx]);

  useEffect(() => {
    if (showOverlay) renderOverlay();
  }, [showOverlay, renderOverlay]);

  // Save selected thumbnail
  const handleSave = async () => {
    if (!candidates[selectedIdx]) return;
    setSaving(true);
    setSaved(false);

    try {
      // If overlay is active, we could upload the canvas; for V1 just use the source URL
      const thumbnailUrl = candidates[selectedIdx].url;

      const res = await fetch(`/api/jobs/${jobId}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: overlayText || "" }),
      });
      const data = await res.json();
      const url = data.thumbnail_url ?? thumbnailUrl;

      onThumbnailChange?.(url);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // fail silently
    } finally {
      setSaving(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="text-center py-4">
        <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/20 mb-2" />
        <p className="text-[11px] text-muted-foreground/60">
          No frames available yet. Thumbnails appear after scene generation completes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Candidate grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {candidates.map((c, i) => (
          <button
            key={`${c.source}-${i}`}
            onClick={() => { setSelectedIdx(i); setSaved(false); }}
            className={`relative aspect-video rounded-md overflow-hidden border-2 transition-all ${
              i === selectedIdx
                ? "border-primary ring-1 ring-primary/30"
                : "border-transparent hover:border-border/60"
            }`}
          >
            {c.source === "video" ? (
              <video
                src={c.url}
                className="h-full w-full object-cover"
                preload="metadata"
                muted
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.url} alt={c.label} className="h-full w-full object-cover" />
            )}
            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white">
              {c.label}
            </span>
            {i === selectedIdx && (
              <div className="absolute top-0.5 right-0.5 rounded-full bg-primary p-0.5">
                <Check className="h-2.5 w-2.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-border/40 bg-black">
        {showOverlay ? (
          <canvas ref={canvasRef} className="h-full w-full object-contain" />
        ) : candidates[selectedIdx]?.source === "video" ? (
          <video
            src={candidates[selectedIdx].url}
            className="h-full w-full object-contain"
            preload="metadata"
            muted
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidates[selectedIdx]?.url}
            alt="Thumbnail preview"
            className="h-full w-full object-contain"
          />
        )}
      </div>

      {/* Text overlay toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowOverlay(!showOverlay)}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
            showOverlay
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <Type className="h-3 w-3" />
          Text overlay
        </button>

        {showOverlay && (
          <>
            <button
              onClick={() => setFontIdx((p) => (p + 1) % OVERLAY_FONTS.length)}
              className="rounded-md border border-border/40 bg-background/40 p-1.5 text-muted-foreground hover:text-foreground"
              title="Change font"
            >
              <Type className="h-3 w-3" />
            </button>
            <button
              onClick={() => setColorIdx((p) => (p + 1) % OVERLAY_COLORS.length)}
              className="rounded-md border border-border/40 bg-background/40 p-1.5 text-muted-foreground hover:text-foreground"
              title="Change color"
            >
              <Palette className="h-3 w-3" />
            </button>
            <button
              onClick={renderOverlay}
              className="rounded-md border border-border/40 bg-background/40 p-1.5 text-muted-foreground hover:text-foreground"
              title="Refresh preview"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Overlay text input */}
      {showOverlay && (
        <input
          value={overlayText}
          onChange={(e) => setOverlayText(e.target.value)}
          onBlur={renderOverlay}
          placeholder="Add title text..."
          maxLength={60}
          className="w-full rounded-md border border-border/40 bg-background/60 px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50"
        />
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : saved ? (
            <Check className="h-3 w-3" />
          ) : (
            <ImageIcon className="h-3 w-3" />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Set as thumbnail"}
        </button>

        {candidates[selectedIdx] && (
          <a
            href={candidates[selectedIdx].url}
            download={`thumbnail-${jobId}.jpg`}
            className="flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40"
          >
            <Download className="h-3 w-3" /> Download
          </a>
        )}
      </div>
    </div>
  );
}
