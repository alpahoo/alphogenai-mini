/**
 * Duplicate-render protection on the client side of the talking-avatar screen. The server remains the authority
 * (SQL idempotency key + duplicate guard + single claim); this only avoids sending two different requests by accident.
 *
 * One attempt = one idempotency key + one seed. They are reused when a request fails or its response is lost (so the
 * retry returns the same run), and renewed only after success or when the inputs change.
 */
export interface Attempt { key: string; seed: number }

export function createAttemptStore(newKey: () => string = () => crypto.randomUUID(), newSeed: () => number = () => Math.floor(Math.random() * 2 ** 31)) {
  let current: Attempt | null = null;
  return {
    /** The attempt to send: created on first use, then stable until `reset()`. */
    get(): Attempt { current ??= { key: newKey(), seed: newSeed() }; return current; },
    reset() { current = null; },
  };
}

export interface SubmitState { ready: boolean; portraitPath: string | null; audioPath: string | null; submitting: boolean; activeRunId: string | null }

/** Render is possible only when authorized, both inputs are chosen, nothing is being sent and no render is queued or running. */
export function canSubmit(s: SubmitState): boolean {
  return s.ready && !!s.portraitPath && !!s.audioPath && !s.submitting && !s.activeRunId;
}

/** Why the button is disabled, or "" when it is enabled. */
export function submitBlocker(s: SubmitState, readinessReason: string): string {
  if (!s.ready) return readinessReason;
  if (!s.portraitPath) return "Choose a portrait";
  if (!s.audioPath) return "Choose an audio";
  if (s.activeRunId) return "A render is already running";
  return "";
}
