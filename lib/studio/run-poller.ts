/**
 * Bounded status polling for one selected Studio run.
 *
 * Previously the hook re-armed its timer only when React state changed. A response dropped as stale,
 * a hung request (fetch had no timeout) or a hidden tab could leave the timer unarmed, and the screen
 * stayed on "Generating" after the server had moved the run to `failed`. This loop owns its own
 * timer: every outcome (update, stale, error, hidden tab) schedules exactly one next step, until a
 * terminal state, an explicit stop, or one of the bounds below.
 *
 * Bounds (no unlimited request loop):
 * - requests time out after `requestTimeoutMs`;
 * - consecutive errors back off exponentially and stop after `maxConsecutiveErrors`;
 * - polling stops once the run is older than `maxAgeMs` (server deadlines expire runs well before);
 * - a hidden tab sends no request; it re-checks on `wake()` (tab visible again).
 */

export interface PollableRun { id: string; status: string; created_at?: string | null }

export type PollStopReason = "terminal" | "errors" | "max_age" | "stopped";

export interface RunPollerOptions<Run extends PollableRun> {
  run: Run;
  /** Fetch the run. Resolve `null` when the response was dropped as stale. Reject on failure. */
  fetchRun: (id: string, signal: AbortSignal) => Promise<Run | null>;
  isActive: (status: string) => boolean;
  /** Delay before the next request for an active run, or null to stop. */
  delay: (status: string, ageMs: number) => number | null;
  onUpdate: (run: Run) => void;
  onTerminal: (run: Run) => void;
  onTransientError: (consecutiveErrors: number) => void;
  onStop?: (reason: PollStopReason) => void;
  isVisible?: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  requestTimeoutMs?: number;
  maxConsecutiveErrors?: number;
  maxBackoffMs?: number;
  maxAgeMs?: number;
}

export interface RunPoller {
  /** Check now if a step is waiting (e.g. the tab became visible). No-op while a request is in flight. */
  wake: () => void;
  stop: () => void;
}

export function startRunPolling<Run extends PollableRun>(o: RunPollerOptions<Run>): RunPoller {
  const now = o.now ?? (() => Date.now());
  const isVisible = o.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
  const setTimer = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const requestTimeoutMs = o.requestTimeoutMs ?? 15_000;
  const maxErrors = o.maxConsecutiveErrors ?? 5;
  const maxBackoffMs = o.maxBackoffMs ?? 30_000;
  const maxAgeMs = o.maxAgeMs ?? 30 * 60_000;
  const id = o.run.id;
  const createdAt = o.run.created_at ? Date.parse(o.run.created_at) : NaN;
  const startedAt = now();
  const age = () => now() - (Number.isFinite(createdAt) ? createdAt : startedAt);

  let status = o.run.status;
  let errors = 0;
  let stopped = false;
  let inFlight = false;
  let timer: unknown = null;
  let controller: AbortController | null = null;

  const finish = (reason: PollStopReason) => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) { clearTimer(timer); timer = null; }
    controller?.abort(); controller = null;
    o.onStop?.(reason);
  };

  const schedule = () => {
    if (stopped) return;
    if (age() > maxAgeMs) { finish("max_age"); return; }
    const base = o.delay(status, age());
    if (base === null) { finish("terminal"); return; }
    const ms = errors > 0 ? Math.min(maxBackoffMs, base * 2 ** errors) : base;
    timer = setTimer(() => { timer = null; void step(); }, ms);
  };

  const step = async () => {
    if (stopped || inFlight) return;
    if (!isVisible()) { schedule(); return; }
    inFlight = true;
    controller = new AbortController();
    const c = controller;
    const timeout = setTimer(() => c.abort(), requestTimeoutMs);
    try {
      const run = await o.fetchRun(id, c.signal);
      if (stopped) return;
      errors = 0;
      if (run && run.id === id) {
        status = run.status;
        o.onUpdate(run);
        if (!o.isActive(run.status)) { o.onTerminal(run); finish("terminal"); return; }
      }
    } catch {
      if (stopped) return;
      errors += 1;
      if (errors >= maxErrors) { finish("errors"); return; }
      o.onTransientError(errors);
    } finally {
      clearTimer(timeout);
      inFlight = false;
      if (controller === c) controller = null;
    }
    schedule();
  };

  const wake = () => {
    if (stopped || inFlight || timer === null) return;
    clearTimer(timer); timer = null;
    void step();
  };

  if (!o.isActive(status)) { stopped = true; return { wake: () => undefined, stop: () => undefined }; }
  schedule();
  return { wake, stop: () => finish("stopped") };
}

/** Signal aborted when either input aborts (AbortSignal.any where available). */
export function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (any) return any([a, b]);
  const c = new AbortController();
  const abort = () => c.abort();
  if (a.aborted || b.aborted) c.abort();
  else { a.addEventListener("abort", abort, { once: true }); b.addEventListener("abort", abort, { once: true }); }
  return c.signal;
}
