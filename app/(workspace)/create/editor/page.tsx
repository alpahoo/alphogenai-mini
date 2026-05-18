"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2,
  Play,
  Loader2,
  Plus,
  Trash2,
  CopyPlus,
  GripVertical,
  Film,
  Clock,
  Cpu,
  ArrowLeft,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  EditorProvider,
  useEditor,
  type EditorScene,
} from "@/components/editor/EditorProvider";
import { getEngineDisplayName } from "@/lib/types";

// ---------------------------------------------------------------------------
// Sortable Scene Card
// ---------------------------------------------------------------------------

function SortableSceneCard({
  scene,
  index,
  isSelected,
  onSelect,
  onRemove,
  onDuplicate,
  canRemove,
}: {
  scene: EditorScene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative flex flex-col rounded-lg border p-2 text-left transition-all duration-200 shrink-0 w-[160px]
        ${isSelected
          ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
          : "border-border/30 bg-background/40 hover:border-border/60"
        }
        ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}
      `}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 z-10 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Action buttons (hover) */}
      <div className="absolute top-1 right-1 z-10 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
          title="Duplicate scene"
        >
          <CopyPlus className="h-3 w-3" />
        </button>
        {canRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-0.5 text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10"
            title="Remove scene"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Content (clickable) */}
      <button onClick={onSelect} className="flex flex-col text-left w-full">
        {/* Thumbnail placeholder */}
        <div className="mb-1.5 aspect-video w-full rounded-md bg-muted/30 flex items-center justify-center overflow-hidden">
          {scene.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Film className="h-4 w-4 text-muted-foreground/30" />
          )}
        </div>

        {/* Info */}
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] font-semibold">Scene {index + 1}</span>
          <span className="text-[9px] text-muted-foreground tabular-nums">{scene.duration_sec}s</span>
        </div>
        <p className="text-[9px] text-muted-foreground line-clamp-2 leading-tight">
          {scene.prompt}
        </p>
      </button>

      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          layoutId="editor-indicator"
          className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-primary"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor Content (inside provider)
// ---------------------------------------------------------------------------

function EditorContent() {
  const { state, dispatch, totalDuration } = useEditor();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Generate storyboard from prompt
  const handleGenerate = useCallback(async () => {
    if (!state.basePrompt.trim() || state.generating) return;
    dispatch({ type: "SET_GENERATING", generating: true });

    try {
      const res = await fetch("/api/storyboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: state.basePrompt.trim(),
          target_duration_seconds: state.targetDuration,
          preferred_engine: state.engine !== "wan_i2v" ? state.engine : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      const scenes: EditorScene[] = data.scenes.map(
        (s: { scene_index: number; prompt: string; engine: string; duration_sec: number }, i: number) => ({
          id: `scene-gen-${i}`,
          scene_index: i,
          prompt: s.prompt,
          engine: s.engine,
          duration_sec: s.duration_sec,
        }),
      );

      dispatch({
        type: "LOAD_STORYBOARD",
        scenes,
        enhancedPrompt: data.enhancedPrompt,
        plan: data.plan,
      });
    } catch (e) {
      dispatch({ type: "SET_ERROR", error: e instanceof Error ? e.message : "Failed" });
    }
  }, [state.basePrompt, state.targetDuration, state.engine, state.generating, dispatch]);

  // Submit to create job
  const handleSubmit = useCallback(async () => {
    if (submitting || state.scenes.length === 0) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: state.basePrompt.trim(),
          target_duration_seconds: Math.round(totalDuration),
          preferred_engine: state.engine !== "wan_i2v" ? state.engine : undefined,
          scenes: state.scenes.map((s) => ({
            prompt: s.prompt,
            engine: s.engine,
            duration_sec: s.duration_sec,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Creation failed");
      if (data.jobId) router.push(`/jobs/${data.jobId}`);
    } catch (e) {
      dispatch({ type: "SET_ERROR", error: e instanceof Error ? e.message : "Failed" });
      setSubmitting(false);
    }
  }, [submitting, state.scenes, state.basePrompt, state.engine, totalDuration, router, dispatch]);

  // Drag end handler
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = state.scenes.findIndex((s) => s.id === active.id);
      const toIndex = state.scenes.findIndex((s) => s.id === over.id);
      if (fromIndex >= 0 && toIndex >= 0) {
        dispatch({ type: "REORDER_SCENES", fromIndex, toIndex });
      }
    },
    [state.scenes, dispatch],
  );

  const selectedScene =
    state.selectedIndex >= 0 && state.selectedIndex < state.scenes.length
      ? state.scenes[state.selectedIndex]
      : null;

  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/create"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">Video Editor</h1>
          </div>
        </div>
        {state.hasStoryboard && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {state.scenes.length} scene{state.scenes.length > 1 ? "s" : ""} &middot; {Math.round(totalDuration)}s
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting || state.scenes.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              )}
              {submitting ? "Creating..." : "Generate Video"}
            </button>
          </div>
        )}
      </header>

      {/* ── Main area ────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center: Prompt input / Scene preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <AnimatePresence mode="wait">
              {!state.hasStoryboard ? (
                /* ── Step 1: Prompt input ──────────────── */
                <motion.div
                  key="prompt-input"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="max-w-xl mx-auto pt-16"
                >
                  <div className="text-center mb-8">
                    <h2 className="text-xl font-bold tracking-tight mb-2">
                      Describe your video
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      AI will split your concept into cinematic scenes you can edit before generating.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <textarea
                      value={state.basePrompt}
                      onChange={(e) =>
                        dispatch({ type: "SET_BASE_PROMPT", prompt: e.target.value })
                      }
                      placeholder="A breathtaking drone shot over misty mountains at sunrise, revealing a hidden valley with ancient ruins..."
                      rows={4}
                      className="w-full rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-sm text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                    />

                    <div className="flex gap-3">
                      {/* Duration */}
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                          Duration
                        </label>
                        <select
                          value={state.targetDuration}
                          onChange={(e) =>
                            dispatch({ type: "SET_DURATION", duration: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50"
                        >
                          <option value={5}>5s (1 scene)</option>
                          <option value={10}>10s (2 scenes)</option>
                          <option value={15}>15s (3 scenes)</option>
                          <option value={20}>20s (4 scenes)</option>
                          <option value={25}>25s (5 scenes)</option>
                        </select>
                      </div>
                    </div>

                    {state.error && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <p className="text-[11px] text-red-400">{state.error}</p>
                      </div>
                    )}

                    <button
                      onClick={handleGenerate}
                      disabled={!state.basePrompt.trim() || state.generating}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-all"
                    >
                      {state.generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      {state.generating ? "Generating storyboard..." : "Generate Storyboard"}
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* ── Step 2: Scene preview ─────────────── */
                <motion.div
                  key="scene-preview"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-2xl mx-auto"
                >
                  {selectedScene ? (
                    <div className="space-y-4">
                      {/* Scene preview area */}
                      <div className="aspect-video w-full rounded-2xl border border-border/40 bg-card/40 flex items-center justify-center overflow-hidden">
                        {selectedScene.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedScene.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="text-center p-8">
                            <Film className="mx-auto h-12 w-12 text-muted-foreground/15 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground/60">
                              Scene {state.selectedIndex + 1} Preview
                            </p>
                            <p className="text-[11px] text-muted-foreground/40 mt-1 max-w-sm mx-auto">
                              Preview will appear after generation. Edit the prompt below before launching.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Scene prompt (read-only here, editable in panel) */}
                      <div className="rounded-xl border border-border/30 bg-background/30 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Scene {state.selectedIndex + 1} of {state.scenes.length}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {selectedScene.duration_sec}s
                          </span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">
                          {selectedScene.prompt}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-20">
                      <p className="text-sm text-muted-foreground">
                        Select a scene from the timeline below
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Timeline (bottom) ─────────────────────── */}
          {state.hasStoryboard && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-border/40 bg-card/30 px-4 py-3 shrink-0"
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={state.scenes.map((s) => s.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {state.scenes.map((scene, i) => (
                      <SortableSceneCard
                        key={scene.id}
                        scene={scene}
                        index={i}
                        isSelected={i === state.selectedIndex}
                        onSelect={() => dispatch({ type: "SELECT_SCENE", index: i })}
                        onRemove={() => dispatch({ type: "REMOVE_SCENE", index: i })}
                        onDuplicate={() => dispatch({ type: "DUPLICATE_SCENE", index: i })}
                        canRemove={state.scenes.length > 1}
                      />
                    ))}

                    {/* Add scene button */}
                    <button
                      onClick={() =>
                        dispatch({
                          type: "ADD_SCENE",
                          afterIndex: state.scenes.length - 1,
                        })
                      }
                      className="flex shrink-0 w-[80px] items-center justify-center rounded-lg border border-dashed border-border/40 text-muted-foreground/50 hover:border-primary/40 hover:text-primary/70 transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </SortableContext>
              </DndContext>

              {/* Progress bar */}
              <div className="mt-2 flex gap-0.5">
                {state.scenes.map((scene, i) => {
                  const pct = totalDuration > 0 ? (scene.duration_sec / totalDuration) * 100 : 100 / state.scenes.length;
                  return (
                    <div
                      key={scene.id}
                      style={{ width: `${pct}%` }}
                      className={`h-1 rounded-full transition-colors duration-200 ${
                        i === state.selectedIndex ? "bg-primary" : "bg-primary/25"
                      }`}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Right panel: Scene editor ───────────────── */}
        {state.hasStoryboard && selectedScene && (
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-72 border-l border-border/40 bg-muted/20 p-5 overflow-y-auto shrink-0 hidden lg:block"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Edit Scene {state.selectedIndex + 1}
                </h3>
              </div>

              {/* Prompt */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Prompt
                </label>
                <textarea
                  value={selectedScene.prompt}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_SCENE",
                      index: state.selectedIndex,
                      updates: { prompt: e.target.value },
                    })
                  }
                  rows={5}
                  className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-xs text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  step={1}
                  value={selectedScene.duration_sec}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_SCENE",
                      index: state.selectedIndex,
                      updates: { duration_sec: Math.max(3, Math.min(10, Number(e.target.value))) },
                    })
                  }
                  className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>

              {/* Engine */}
              <div className="rounded-lg border border-border/30 bg-background/30 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> Engine
                  </span>
                  <span className="font-medium">
                    {getEngineDisplayName(selectedScene.engine)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-2">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Total
                  </span>
                  <span className="font-medium tabular-nums">
                    {Math.round(totalDuration)}s
                  </span>
                </div>
              </div>

              {/* Scene actions */}
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    dispatch({ type: "DUPLICATE_SCENE", index: state.selectedIndex })
                  }
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-2 text-[11px] font-medium hover:bg-muted/40 transition-colors"
                >
                  <CopyPlus className="h-3 w-3" /> Duplicate
                </button>
                {state.scenes.length > 1 && (
                  <button
                    onClick={() =>
                      dispatch({ type: "REMOVE_SCENE", index: state.selectedIndex })
                    }
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                )}
              </div>

              {state.isDirty && (
                <p className="text-[10px] text-amber-400 text-center">
                  Storyboard modified — changes will be used when generating
                </p>
              )}
            </div>
          </motion.aside>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper (with provider)
// ---------------------------------------------------------------------------

export default function EditorPage() {
  return (
    <EditorProvider>
      <EditorContent />
    </EditorProvider>
  );
}
