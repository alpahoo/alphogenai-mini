"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
  type Dispatch,
} from "react";
import type { EngineKey } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorScene {
  /** Client-side ID (nanoid or index-based) */
  id: string;
  scene_index: number;
  prompt: string;
  engine: EngineKey;
  duration_sec: number;
  /** Optional reference/first-frame image URL */
  imageUrl?: string;
}

export interface EditorState {
  scenes: EditorScene[];
  selectedIndex: number;
  /** Base prompt entered by the user */
  basePrompt: string;
  /** LLM-enhanced prompt */
  enhancedPrompt: string;
  /** User's plan */
  plan: string;
  /** Preferred engine key */
  engine: EngineKey;
  /** Target total duration */
  targetDuration: number;
  /** Whether storyboard has been generated */
  hasStoryboard: boolean;
  /** Whether any scene has been modified since generation */
  isDirty: boolean;
  /** Loading state for storyboard generation */
  generating: boolean;
  /** Error message */
  error: string | null;
}

/** Wrapper that includes undo history */
interface EditorStateWithHistory {
  present: EditorState;
  past: EditorState[];
  future: EditorState[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type EditorAction =
  | { type: "SET_BASE_PROMPT"; prompt: string }
  | { type: "SET_ENGINE"; engine: EngineKey }
  | { type: "SET_DURATION"; duration: number }
  | { type: "SET_GENERATING"; generating: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "LOAD_STORYBOARD"; scenes: EditorScene[]; enhancedPrompt: string; plan: string }
  | { type: "SELECT_SCENE"; index: number }
  | { type: "UPDATE_SCENE"; index: number; updates: Partial<EditorScene> }
  | { type: "ADD_SCENE"; afterIndex: number }
  | { type: "REMOVE_SCENE"; index: number }
  | { type: "DUPLICATE_SCENE"; index: number }
  | { type: "REORDER_SCENES"; fromIndex: number; toIndex: number }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reindex(scenes: EditorScene[]): EditorScene[] {
  return scenes.map((s, i) => ({ ...s, scene_index: i }));
}

let nextId = 0;
function genId(): string {
  return `scene-${Date.now()}-${nextId++}`;
}

const initialState: EditorState = {
  scenes: [],
  selectedIndex: -1,
  basePrompt: "",
  enhancedPrompt: "",
  plan: "free",
  engine: "wan_i2v",
  targetDuration: 5,
  hasStoryboard: false,
  isDirty: false,
  generating: false,
  error: null,
};

const MAX_UNDO = 30;

/** Actions that should be recorded in undo history (scene mutations) */
const UNDOABLE_ACTIONS = new Set([
  "UPDATE_SCENE",
  "ADD_SCENE",
  "REMOVE_SCENE",
  "DUPLICATE_SCENE",
  "REORDER_SCENES",
  "LOAD_STORYBOARD",
]);

function coreReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_BASE_PROMPT":
      return { ...state, basePrompt: action.prompt };

    case "SET_ENGINE":
      return { ...state, engine: action.engine };

    case "SET_DURATION":
      return { ...state, targetDuration: action.duration };

    case "SET_GENERATING":
      return { ...state, generating: action.generating, error: null };

    case "SET_ERROR":
      return { ...state, error: action.error, generating: false };

    case "LOAD_STORYBOARD": {
      const scenes = action.scenes.map((s, i) => ({
        ...s,
        id: s.id || genId(),
        scene_index: i,
      }));
      return {
        ...state,
        scenes,
        enhancedPrompt: action.enhancedPrompt,
        plan: action.plan,
        hasStoryboard: true,
        isDirty: false,
        generating: false,
        selectedIndex: 0,
        error: null,
      };
    }

    case "SELECT_SCENE":
      return { ...state, selectedIndex: action.index };

    case "UPDATE_SCENE": {
      const scenes = [...state.scenes];
      if (scenes[action.index]) {
        scenes[action.index] = { ...scenes[action.index], ...action.updates };
      }
      return { ...state, scenes, isDirty: true };
    }

    case "ADD_SCENE": {
      const afterIdx = Math.min(action.afterIndex, state.scenes.length - 1);
      const refScene = state.scenes[afterIdx];
      const newScene: EditorScene = {
        id: genId(),
        scene_index: afterIdx + 1,
        prompt: "New scene — describe what happens next...",
        engine: refScene?.engine ?? state.engine,
        duration_sec: refScene?.duration_sec ?? 5,
      };
      const scenes = reindex([
        ...state.scenes.slice(0, afterIdx + 1),
        newScene,
        ...state.scenes.slice(afterIdx + 1),
      ]);
      return {
        ...state,
        scenes,
        selectedIndex: afterIdx + 1,
        isDirty: true,
      };
    }

    case "REMOVE_SCENE": {
      if (state.scenes.length <= 1) return state;
      const scenes = reindex(state.scenes.filter((_, i) => i !== action.index));
      const newSelected = Math.min(state.selectedIndex, scenes.length - 1);
      return { ...state, scenes, selectedIndex: newSelected, isDirty: true };
    }

    case "DUPLICATE_SCENE": {
      const src = state.scenes[action.index];
      if (!src) return state;
      const dup: EditorScene = {
        ...src,
        id: genId(),
        prompt: src.prompt,
      };
      const scenes = reindex([
        ...state.scenes.slice(0, action.index + 1),
        dup,
        ...state.scenes.slice(action.index + 1),
      ]);
      return {
        ...state,
        scenes,
        selectedIndex: action.index + 1,
        isDirty: true,
      };
    }

    case "REORDER_SCENES": {
      const { fromIndex, toIndex } = action;
      if (fromIndex === toIndex) return state;
      const scenes = [...state.scenes];
      const [moved] = scenes.splice(fromIndex, 1);
      scenes.splice(toIndex, 0, moved);
      return {
        ...state,
        scenes: reindex(scenes),
        selectedIndex: toIndex,
        isDirty: true,
      };
    }

    case "RESET":
      return { ...initialState };

    // UNDO/REDO handled at history level
    default:
      return state;
  }
}

function historyReducer(
  histState: EditorStateWithHistory,
  action: EditorAction,
): EditorStateWithHistory {
  if (action.type === "UNDO") {
    if (histState.past.length === 0) return histState;
    const prev = histState.past[histState.past.length - 1];
    return {
      past: histState.past.slice(0, -1),
      present: prev,
      future: [histState.present, ...histState.future].slice(0, MAX_UNDO),
    };
  }

  if (action.type === "REDO") {
    if (histState.future.length === 0) return histState;
    const next = histState.future[0];
    return {
      past: [...histState.past, histState.present].slice(-MAX_UNDO),
      present: next,
      future: histState.future.slice(1),
    };
  }

  const newPresent = coreReducer(histState.present, action);

  // If state didn't change, skip
  if (newPresent === histState.present) return histState;

  // Only push to undo stack for undoable actions
  if (UNDOABLE_ACTIONS.has(action.type)) {
    return {
      past: [...histState.past, histState.present].slice(-MAX_UNDO),
      present: newPresent,
      future: [], // new action clears redo
    };
  }

  return { ...histState, present: newPresent };
}

const initialHistoryState: EditorStateWithHistory = {
  present: initialState,
  past: [],
  future: [],
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Total duration of all scenes */
  totalDuration: number;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Undo last undoable action */
  undo: () => void;
  /** Redo last undone action */
  redo: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [histState, dispatch] = useReducer(historyReducer, initialHistoryState);

  const state = histState.present;
  const totalDuration = useMemo(
    () => state.scenes.reduce((s, sc) => s + sc.duration_sec, 0),
    [state.scenes],
  );

  const canUndo = histState.past.length > 0;
  const canRedo = histState.future.length > 0;
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return (
    <EditorContext.Provider
      value={{ state, dispatch, totalDuration, canUndo, canRedo, undo, redo }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
