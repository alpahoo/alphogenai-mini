"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Film,
  X,
} from "lucide-react";
import type { JobScene } from "@/lib/types";
import { getEngineDisplayName } from "@/lib/types";

interface ScenePanelProps {
  scene: JobScene;
  sceneIndex: number;
  jobId: string;
  /** Is the parent job in a terminal state (done/failed)? */
  editable: boolean;
  onClose: () => void;
  /** Called after a successful prompt save */
  onPromptSaved?: (index: number, newPrompt: string) => void;
  /** Called after regeneration is triggered */
  onRegenerate?: (index: number) => void;
  /** Actual engine used at job level (overrides storyboard default) */
  jobEngine?: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "done":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
          <CheckCircle2 className="h-3 w-3" /> Complete
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    case "generating":
    case "encoding":
    case "uploading":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <Loader2 className="h-3 w-3 animate-spin" /> {status === "generating" ? "Generating" : status === "encoding" ? "Encoding" : "Uploading"}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Queued
        </span>
      );
  }
}

export function ScenePanel({
  scene,
  sceneIndex,
  jobId,
  editable,
  onClose,
  onPromptSaved,
  onRegenerate,
  jobEngine,
}: ScenePanelProps) {
  const [prompt, setPrompt] = useState(scene.prompt);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [regenError, setRegenError] = useState<string | null>(null);

  // Sync prompt when scene changes
  useEffect(() => {
    setPrompt(scene.prompt);
    setSaveStatus("idle");
    setRegenError(null);
  }, [scene.id, scene.prompt]);

  const isDirty = prompt.trim() !== scene.prompt;

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`/api/jobs/${jobId}/scenes/${sceneIndex}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }
      setSaveStatus("saved");
      onPromptSaved?.(sceneIndex, prompt.trim());
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus("error");
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    if (!confirm(`Regenerate Scene ${sceneIndex + 1}? The video will be reassembled after generation.`)) {
      return;
    }
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/scenes/${sceneIndex}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      onRegenerate?.(sceneIndex);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={scene.id}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 12 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col gap-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Scene {sceneIndex + 1}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          {statusBadge(scene.status)}
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {scene.duration_sec}s
          </span>
        </div>

        {/* Preview */}
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border/30 bg-muted/20">
          {scene.clip_url ? (
            <video
              src={scene.clip_url}
              controls
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : scene.last_frame_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scene.last_frame_url}
              alt={`Scene ${sceneIndex + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {scene.status === "generating" ? (
                <div className="text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary/40 mb-2" />
                  <p className="text-[10px] text-muted-foreground">Generating...</p>
                </div>
              ) : (
                <Film className="h-8 w-8 text-muted-foreground/20" />
              )}
            </div>
          )}
        </div>

        {/* Prompt editor */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={!editable}
            rows={4}
            className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-xs text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Scene prompt..."
          />
          {isDirty && editable && (
            <p className="mt-1 text-[10px] text-amber-400">Unsaved changes</p>
          )}
        </div>

        {/* Details */}
        <div className="rounded-lg border border-border/30 bg-background/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Duration
            </span>
            <span className="font-medium">{scene.duration_sec}s</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <Cpu className="h-3 w-3" /> Engine
            </span>
            <span className="font-medium">{getEngineDisplayName(jobEngine ?? scene.engine)}</span>
          </div>
        </div>

        {/* Error message */}
        {scene.error_message && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
            <p className="text-[10px] text-red-400 break-all">
              {scene.error_message.length > 200
                ? scene.error_message.slice(0, 200) + "..."
                : scene.error_message}
            </p>
          </div>
        )}

        {regenError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
            <p className="text-[10px] text-red-400">{regenError}</p>
          </div>
        )}

        {/* Actions */}
        {editable && (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saveStatus === "saved" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-300" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save"}
            </button>

            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs font-medium hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {regenerating ? "Firing..." : "Regenerate"}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
