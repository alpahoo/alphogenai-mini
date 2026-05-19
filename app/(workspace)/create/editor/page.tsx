"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  Undo2,
  Redo2,
  Keyboard,
  ChevronUp,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
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
// Constants
// ---------------------------------------------------------------------------

const PROMPT_MAX_CHARS = 500;

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
    opacity: isDragging ? 0.4 : 1,
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
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Action buttons (hover) */}
      <div className="absolute top-1 right-1 z-10 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
          title="Duplicate scene (D)"
        >
          <CopyPlus className="h-3 w-3" />
        </button>
        {canRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-0.5 text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10"
            title="Remove scene (Del)"
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
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag Overlay Card (static clone shown while dragging)
// ---------------------------------------------------------------------------

function DragOverlayCard({ scene, index }: { scene: EditorScene; index: number }) {
  return (
    <div className="flex flex-col rounded-lg border border-primary/50 bg-card p-2 text-left shadow-2xl shadow-primary/20 w-[160px] rotate-2">
      <div className="mb-1.5 aspect-video w-full rounded-md bg-muted/30 flex items-center justify-center overflow-hidden">
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Film className="h-4 w-4 text-muted-foreground/30" />
        )}
      </div>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] font-semibold">Scene {index + 1}</span>
        <span className="text-[9px] text-muted-foreground tabular-nums">{scene.duration_sec}s</span>
      </div>
      <p className="text-[9px] text-muted-foreground line-clamp-2 leading-tight">
        {scene.prompt}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Tooltip
// ---------------------------------------------------------------------------

function ShortcutsTooltip({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const shortcuts = [
    { keys: ["←", "→"], desc: "Navigate scenes" },
    { keys: ["D"], desc: "Duplicate scene" },
    { keys: ["Del"], desc: "Remove scene" },
    { keys: ["N"], desc: "Add scene after" },
    { keys: ["Ctrl", "Z"], desc: "Undo" },
    { keys: ["Ctrl", "Shift", "Z"], desc: "Redo" },
    { keys: ["Ctrl", "Enter"], desc: "Generate / Submit" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-border/60 bg-card/95 backdrop-blur-md p-4 shadow-xl z-50"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold">Keyboard Shortcuts</h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        {shortcuts.map((s) => (
          <div key={s.desc} className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{s.desc}</span>
            <div className="flex gap-0.5">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Editor Content (inside provider)
// ---------------------------------------------------------------------------

function EditorContent() {
  const { state, dispatch, totalDuration, canUndo, canRedo, undo, redo } = useEditor();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ----- DnD sensors -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ----- Auto-scroll timeline to selected scene -----
  useEffect(() => {
    if (state.selectedIndex < 0 || !timelineRef.current) return;
    const child = timelineRef.current.children[state.selectedIndex] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [state.selectedIndex]);

  // ----- Generate storyboard -----
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

  // ----- Submit to create job -----
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

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    if (!state.hasStoryboard) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Ctrl+Z / Ctrl+Shift+Z always work
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+Enter: generate or submit
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (state.hasStoryboard && state.scenes.length > 0 && !submitting) {
          handleSubmit();
        }
        return;
      }

      // Skip if user is typing in an input
      if (isInput) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          if (state.selectedIndex > 0) {
            dispatch({ type: "SELECT_SCENE", index: state.selectedIndex - 1 });
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (state.selectedIndex < state.scenes.length - 1) {
            dispatch({ type: "SELECT_SCENE", index: state.selectedIndex + 1 });
          }
          break;
        case "d":
        case "D":
          e.preventDefault();
          if (state.selectedIndex >= 0) {
            dispatch({ type: "DUPLICATE_SCENE", index: state.selectedIndex });
          }
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (state.selectedIndex >= 0 && state.scenes.length > 1) {
            dispatch({ type: "REMOVE_SCENE", index: state.selectedIndex });
          }
          break;
        case "n":
        case "N":
          e.preventDefault();
          dispatch({
            type: "ADD_SCENE",
            afterIndex: Math.max(0, state.selectedIndex),
          });
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((p) => !p);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.hasStoryboard, state.selectedIndex, state.scenes, submitting, dispatch, undo, redo, handleSubmit]);

  // ----- Drag handlers -----
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
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

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const selectedScene =
    state.selectedIndex >= 0 && state.selectedIndex < state.scenes.length
      ? state.scenes[state.selectedIndex]
      : null;

  const activeDragScene = activeDragId
    ? state.scenes.find((s) => s.id === activeDragId)
    : null;
  const activeDragIndex = activeDragId
    ? state.scenes.findIndex((s) => s.id === activeDragId)
    : -1;

  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border/40 px-4 sm:px-6 py-3 shrink-0">
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
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Undo/Redo */}
            <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border/30 bg-card/40">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="rounded-l-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-4 bg-border/30" />
              <button
                onClick={redo}
                disabled={!canRedo}
                className="rounded-r-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums">
              {state.scenes.length} scene{state.scenes.length > 1 ? "s" : ""} &middot; {Math.round(totalDuration)}s
            </span>

            {/* Mobile: scene count badge */}
            <span className="sm:hidden text-[10px] text-muted-foreground tabular-nums bg-muted/30 rounded-full px-2 py-0.5">
              {state.scenes.length} &middot; {Math.round(totalDuration)}s
            </span>

            <button
              onClick={handleSubmit}
              disabled={submitting || state.scenes.length === 0}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-primary px-3 sm:px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              )}
              <span className="hidden sm:inline">{submitting ? "Creating..." : "Generate Video"}</span>
              <span className="sm:hidden">{submitting ? "..." : "Go"}</span>
            </button>
          </div>
        )}
      </header>

      {/* ── Main area ────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Center: Prompt input / Scene preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
            <AnimatePresence mode="wait">
              {!state.hasStoryboard ? (
                /* ── Step 1: Prompt input ──────────────── */
                <motion.div
                  key="prompt-input"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="max-w-xl mx-auto pt-8 sm:pt-16"
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
                    <div className="relative">
                      <textarea
                        value={state.basePrompt}
                        onChange={(e) =>
                          dispatch({ type: "SET_BASE_PROMPT", prompt: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            handleGenerate();
                          }
                        }}
                        placeholder="A breathtaking drone shot over misty mountains at sunrise, revealing a hidden valley with ancient ruins..."
                        rows={4}
                        maxLength={PROMPT_MAX_CHARS}
                        className="w-full rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-sm text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                      />
                      {/* Character counter */}
                      <span
                        className={`absolute bottom-2 right-3 text-[10px] tabular-nums transition-colors ${
                          state.basePrompt.length > PROMPT_MAX_CHARS * 0.9
                            ? "text-amber-400"
                            : "text-muted-foreground/40"
                        }`}
                      >
                        {state.basePrompt.length}/{PROMPT_MAX_CHARS}
                      </span>
                    </div>

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

                    <p className="text-center text-[10px] text-muted-foreground/50">
                      Press <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 text-[9px] font-mono">Ctrl+Enter</kbd> to generate
                    </p>
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
                  <AnimatePresence mode="wait">
                    {selectedScene ? (
                      <motion.div
                        key={selectedScene.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
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
                                Preview will appear after generation. Edit the prompt in the side panel.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Scene info bar */}
                        <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background/30 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Scene {state.selectedIndex + 1} of {state.scenes.length}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 tabular-nums flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {selectedScene.duration_sec}s
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                              <Cpu className="h-3 w-3" /> {getEngineDisplayName(selectedScene.engine)}
                            </span>
                          </div>
                          {/* Mobile: open panel button */}
                          <button
                            onClick={() => setMobilePanel(true)}
                            className="lg:hidden flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                          >
                            Edit <ChevronUp className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Prompt preview (mobile — read-only) */}
                        <div className="lg:hidden rounded-xl border border-border/30 bg-background/30 p-4">
                          <p className="text-xs text-foreground leading-relaxed line-clamp-4">
                            {selectedScene.prompt}
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="no-selection"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center py-20"
                      >
                        <p className="text-sm text-muted-foreground">
                          Select a scene from the timeline below
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Timeline (bottom) ─────────────────────── */}
          {state.hasStoryboard && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-border/40 bg-card/30 px-3 sm:px-4 py-3 shrink-0"
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={state.scenes.map((s) => s.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div
                    ref={timelineRef}
                    className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                  >
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
                      title="Add scene (N)"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </SortableContext>

                {/* DnD drag overlay */}
                <DragOverlay dropAnimation={{
                  duration: 200,
                  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                }}>
                  {activeDragScene ? (
                    <DragOverlayCard scene={activeDragScene} index={activeDragIndex} />
                  ) : null}
                </DragOverlay>
              </DndContext>

              {/* Progress bar */}
              <div className="mt-2 flex gap-0.5">
                {state.scenes.map((scene, i) => {
                  const pct = totalDuration > 0 ? (scene.duration_sec / totalDuration) * 100 : 100 / state.scenes.length;
                  return (
                    <motion.div
                      key={scene.id}
                      layout
                      style={{ width: `${pct}%` }}
                      className={`h-1 rounded-full transition-colors duration-200 ${
                        i === state.selectedIndex ? "bg-primary" : "bg-primary/25"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Shortcuts hint + keyboard icon */}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[9px] text-muted-foreground/40">
                  Use <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> to navigate &middot; <kbd className="font-mono">?</kbd> for all shortcuts
                </p>
                <div className="relative">
                  <button
                    onClick={() => setShowShortcuts((p) => !p)}
                    className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    title="Keyboard shortcuts (?)"
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                  </button>
                  <AnimatePresence>
                    <ShortcutsTooltip open={showShortcuts} onClose={() => setShowShortcuts(false)} />
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Right panel: Scene editor (desktop) ────── */}
        <AnimatePresence>
          {state.hasStoryboard && selectedScene && (
            <motion.aside
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
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
                  <div className="relative">
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
                      maxLength={PROMPT_MAX_CHARS}
                      className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-xs text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                    />
                    <span
                      className={`absolute bottom-1.5 right-2 text-[9px] tabular-nums transition-colors ${
                        selectedScene.prompt.length > PROMPT_MAX_CHARS * 0.9
                          ? "text-amber-400"
                          : "text-muted-foreground/30"
                      }`}
                    >
                      {selectedScene.prompt.length}/{PROMPT_MAX_CHARS}
                    </span>
                  </div>
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
        </AnimatePresence>

        {/* ── Mobile bottom sheet panel ───────────────── */}
        <AnimatePresence>
          {mobilePanel && selectedScene && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobilePanel(false)}
                className="lg:hidden fixed inset-0 bg-black/40 z-40"
              />
              {/* Sheet */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="lg:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border/60 bg-card p-5 max-h-[70vh] overflow-y-auto"
              >
                {/* Drag indicator */}
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/20" />

                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">
                    Edit Scene {state.selectedIndex + 1}
                  </h3>
                  <button
                    onClick={() => setMobilePanel(false)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Prompt */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                      Prompt
                    </label>
                    <div className="relative">
                      <textarea
                        value={selectedScene.prompt}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_SCENE",
                            index: state.selectedIndex,
                            updates: { prompt: e.target.value },
                          })
                        }
                        rows={4}
                        maxLength={PROMPT_MAX_CHARS}
                        className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                      <span className="absolute bottom-1.5 right-2 text-[9px] tabular-nums text-muted-foreground/30">
                        {selectedScene.prompt.length}/{PROMPT_MAX_CHARS}
                      </span>
                    </div>
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
                      className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        dispatch({ type: "DUPLICATE_SCENE", index: state.selectedIndex });
                        setMobilePanel(false);
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-2.5 text-xs font-medium"
                    >
                      <CopyPlus className="h-3.5 w-3.5" /> Duplicate
                    </button>
                    {state.scenes.length > 1 && (
                      <button
                        onClick={() => {
                          dispatch({ type: "REMOVE_SCENE", index: state.selectedIndex });
                          setMobilePanel(false);
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs font-medium text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
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
