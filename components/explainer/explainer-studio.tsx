"use client";

/**
 * ExplainerStudio — editable explainer working copy with a live WYSIWYG preview.
 *
 * Scope (T-1120d step 3, UI-only): edits a LOCAL working copy of the storyboard
 * (seeded from the research plan) and drives the live preview. It NEVER writes to
 * research_storyboards (§13.2) — the working copy is in-memory only. Persisting
 * edits across reloads, and making the final render use the edits, both require a
 * backend (new table + route + migration) and are intentionally out of scope here;
 * the final render still derives from the saved plan. See
 * docs/product/research-explainer-premium-ui-spec.md §13.
 *
 * Simple mode is the default (text / voice / duration / template per scene);
 * Advanced (camera motion, citation) is collapsed (§13.6).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Loader2, RotateCcw, Trash2, Wand2, X } from "lucide-react";
import { ExplainerPreview } from "@/components/explainer/explainer-preview";
import { compositionDurationSec } from "@/lib/explainer/composition";
import type { ExplainerScene, ExplainerStoryboard, ExplainerTemplate } from "@/lib/explainer/storyboard";

const TEMPLATE_OPTIONS: { value: ExplainerTemplate; label: string }[] = [
  { value: "hero", label: "Hero" },
  { value: "screenshot_zoom", label: "Screenshot" },
  { value: "bullets", label: "Bullets" },
  { value: "comparison", label: "Comparison" },
  { value: "stat", label: "Stat" },
  { value: "cta", label: "Call to action" },
];

const MOTION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None (static)" },
  { value: "slow_push_in", label: "Slow push in" },
  { value: "pull_back", label: "Pull back" },
  { value: "pan", label: "Pan" },
];

function cloneStoryboard(sb: ExplainerStoryboard): ExplainerStoryboard {
  return { meta: sb.meta, scenes: sb.scenes.map((s) => ({ ...s })) };
}

export function ExplainerStudio({
  initial,
  plan,
  onClose,
  onRender,
  onSave,
  canRender = true,
}: {
  /** Seed for the editor: the persisted draft if any, else the plan. */
  initial: ExplainerStoryboard;
  /** The pristine plan-derived storyboard, used by "Reset to plan". Defaults to initial. */
  plan?: ExplainerStoryboard;
  onClose?: () => void;
  /** Render the current working copy. Provided by the page (auth + job state). */
  onRender?: (storyboard: ExplainerStoryboard) => void;
  /** Persist the working copy (Tier B autosave). Resolves to a savedAt ISO string. */
  onSave?: (storyboard: ExplainerStoryboard) => Promise<string>;
  /** False when the plan isn't approved yet (render gated upstream). */
  canRender?: boolean;
}) {
  const [draft, setDraft] = useState<ExplainerStoryboard>(() => cloneStoryboard(initial));
  const [selected, setSelected] = useState(0);
  const [advanced, setAdvanced] = useState(false);

  // Debounce the storyboard handed to the preview so typing doesn't reload the
  // iframe on every keystroke.
  const [previewSb, setPreviewSb] = useState<ExplainerStoryboard>(draft);
  useEffect(() => {
    const t = setTimeout(() => setPreviewSb(draft), 350);
    return () => clearTimeout(t);
  }, [draft]);

  const resetTarget = plan ?? initial;
  const totalDuration = useMemo(() => compositionDurationSec(draft), [draft]);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(resetTarget),
    [draft, resetTarget],
  );

  // Tier B autosave: debounce edits and persist the working copy. Skips the initial
  // mount (nothing to save yet).
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const firstRef = useRef(true);
  useEffect(() => {
    if (!onSave) return;
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await onSave(draft);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [draft, onSave]);

  const sel = draft.scenes[selected] ?? draft.scenes[0];

  function patchScene(i: number, patch: Partial<ExplainerScene>) {
    setDraft((d) => ({ ...d, scenes: d.scenes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }
  function moveScene(i: number, dir: -1 | 1) {
    const j = i + dir;
    setDraft((d) => {
      if (j < 0 || j >= d.scenes.length) return d;
      const scenes = d.scenes.slice();
      [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
      return { ...d, scenes };
    });
    setSelected((s) => (s === i ? Math.max(0, Math.min(draft.scenes.length - 1, j)) : s));
  }
  function duplicateScene(i: number) {
    setDraft((d) => {
      const scenes = d.scenes.slice();
      scenes.splice(i + 1, 0, { ...d.scenes[i] });
      return { ...d, scenes };
    });
  }
  function deleteScene(i: number) {
    setDraft((d) => {
      if (d.scenes.length <= 1) return d;
      return { ...d, scenes: d.scenes.filter((_, idx) => idx !== i) };
    });
    setSelected((s) => Math.max(0, s - (i <= s ? 1 : 0)));
  }

  const fieldCls =
    "mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none";
  const labelCls = "text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500";

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Explainer Studio</h2>
          <p className="text-xs text-neutral-500">
            Editing a working copy — autosaved as a draft, separate from your approved plan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onSave && (
            <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-neutral-500">
              {saveState === "saving" && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </>
              )}
              {saveState === "saved" && (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" /> Saved
                </>
              )}
              {saveState === "error" && <span className="text-red-600">Save failed</span>}
            </span>
          )}
          <button
            type="button"
            onClick={() => setDraft(cloneStoryboard(resetTarget))}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to plan
          </button>
          {onRender && (
            <button
              type="button"
              onClick={() => onRender(draft)}
              disabled={!canRender}
              title={canRender ? undefined : "Approve the storyboard first"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <Wand2 className="h-3.5 w-3.5" /> Render these edits (~$0.03)
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          )}
        </div>
      </div>

      <div className="grid flex-1 gap-4 py-4 lg:grid-cols-[240px_1fr_300px]">
        {/* Left — scene list */}
        <div className="space-y-2">
          <p className={labelCls}>
            Scenes · {draft.scenes.length} · {Math.round(totalDuration)}s
          </p>
          <div className="space-y-2">
            {draft.scenes.map((s, i) => (
              <div
                key={i}
                className={`rounded-xl border p-2.5 ${
                  i === selected ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"
                }`}
              >
                <button type="button" onClick={() => setSelected(i)} className="block w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      {i + 1} · {s.template}
                    </span>
                    <span className="text-xs text-neutral-400">{Math.round(s.duration_sec)}s</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium text-neutral-900">
                    {s.onscreen_text || "(no text)"}
                  </p>
                </button>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveScene(i, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30"
                    aria-label="Move scene up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveScene(i, 1)}
                    disabled={i === draft.scenes.length - 1}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30"
                    aria-label="Move scene down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateScene(i)}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-200"
                    aria-label="Duplicate scene"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteScene(i)}
                    disabled={draft.scenes.length <= 1}
                    className="ml-auto rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
                    aria-label="Delete scene"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center — live preview */}
        <div>
          <ExplainerPreview storyboard={previewSb} />
        </div>

        {/* Right — inspector */}
        <div className="space-y-3">
          <p className={labelCls}>Scene {selected + 1} — inspector</p>

          <label className="block">
            <span className={labelCls}>Template</span>
            <select
              value={sel?.template ?? "hero"}
              onChange={(e) => patchScene(selected, { template: e.target.value as ExplainerTemplate })}
              className={fieldCls}
            >
              {TEMPLATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelCls}>On-screen text</span>
            <textarea
              value={sel?.onscreen_text ?? ""}
              onChange={(e) => patchScene(selected, { onscreen_text: e.target.value })}
              rows={2}
              className={fieldCls}
            />
          </label>

          <label className="block">
            <span className={labelCls}>Voice-over line</span>
            <textarea
              value={sel?.voiceover_line ?? ""}
              onChange={(e) => patchScene(selected, { voiceover_line: e.target.value })}
              rows={2}
              className={fieldCls}
            />
          </label>

          {sel?.template === "bullets" && (
            <label className="block">
              <span className={labelCls}>Bullets (one per line)</span>
              <textarea
                value={(sel?.bullets ?? []).join("\n")}
                onChange={(e) =>
                  patchScene(selected, {
                    bullets: e.target.value.split("\n").map((b) => b.trim()).filter(Boolean),
                  })
                }
                rows={4}
                className={fieldCls}
              />
            </label>
          )}

          <label className="block">
            <span className={labelCls}>Duration (seconds)</span>
            <input
              type="number"
              min={2}
              max={30}
              value={sel?.duration_sec ?? 5}
              onChange={(e) => patchScene(selected, { duration_sec: Math.max(2, Number(e.target.value) || 2) })}
              className={fieldCls}
            />
          </label>

          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Advanced (cinematic)
            {advanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {advanced && (
            <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
              <label className="block">
                <span className={labelCls}>Camera motion</span>
                <select
                  value={sel?.camera_motion ?? ""}
                  onChange={(e) => patchScene(selected, { camera_motion: e.target.value || null })}
                  className={fieldCls}
                >
                  {MOTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Source citation</span>
                <input
                  type="text"
                  value={sel?.source_citation ?? ""}
                  onChange={(e) => patchScene(selected, { source_citation: e.target.value || null })}
                  className={fieldCls}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <p className="border-t border-neutral-200 pt-3 text-xs leading-5 text-neutral-400">
        &ldquo;Render these edits&rdquo; renders this working copy (~$0.03); the result appears in
        Library. Edits autosave as a draft (kept across reloads) and your approved plan is never
        modified. &ldquo;Reset to plan&rdquo; discards the draft.
      </p>
    </div>
  );
}
