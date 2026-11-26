/** Pure Cinema M1 ordering and ownership-bound selection rules (no media copies or GPU). */
export interface CinemaScene { id: string; project_id: string; position: number }
export interface CinemaShot { id: string; scene_id: string; project_id: string; position: number; selected_take_id: string | null }
export interface CinemaTake { id: string; shot_id: string; run_id: string }
export class CinemaSelectionError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

/** Fail closed on missing shots/takes/runs. Never silently remove an unready clip from an export. */
export function selectedRunsForMontage(
  scenes: CinemaScene[], shots: CinemaShot[], takes: CinemaTake[], completedRunIds: ReadonlySet<string>,
): string[] {
  const scenesById = new Map(scenes.map(s => [s.id,s]));
  const takesById = new Map(takes.map(t => [t.id,t]));
  const ordered = [...shots].sort((a,b) => {
    const sa = scenesById.get(a.scene_id), sb = scenesById.get(b.scene_id);
    return (sa?.position ?? Infinity)-(sb?.position ?? Infinity) || a.position-b.position;
  });
  if (ordered.length < 2 || ordered.length > 10) throw new CinemaSelectionError("clip_count","Choose between 2 and 10 completed plans.");
  const ids = ordered.map((shot,i) => {
    const scene = scenesById.get(shot.scene_id);
    if (!scene || scene.project_id !== shot.project_id) throw new CinemaSelectionError("scene","Plan belongs to an invalid scene.");
    const take = shot.selected_take_id ? takesById.get(shot.selected_take_id) : undefined;
    if (!take || take.shot_id !== shot.id || !completedRunIds.has(take.run_id))
      throw new CinemaSelectionError("missing_take", "Plan "+(i+1)+" has no selected completed video.");
    return take.run_id;
  });
  if (new Set(ids).size !== ids.length) throw new CinemaSelectionError("duplicate","The same video was selected for multiple plans.");
  return ids;
}

/** Preserve unsaved edits of other plans after a take is selected or one plan is saved. */
export interface CinemaDraft { action: string; duration: number; first_frame_path: string }
export function reconcileShotDrafts(
  shots: { id: string; action: string; duration: number; first_frame_path: string | null }[],
  prior: Record<string, CinemaDraft>,
  dirty: ReadonlySet<string>,
  resetId?: string,
): Record<string, CinemaDraft> {
  return Object.fromEntries(shots.map(shot => [
    shot.id,
    dirty.has(shot.id) && shot.id !== resetId && prior[shot.id]
      ? prior[shot.id]
      : { action: shot.action, duration: shot.duration, first_frame_path: shot.first_frame_path ?? "" },
  ]));
}
