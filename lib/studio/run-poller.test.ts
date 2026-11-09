import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRunPolling, type PollableRun, type RunPollerOptions } from "./run-poller";
import { RunSelection } from "./run-selection";
import { isActive, pollDelay } from "./status";

type Run = PollableRun & { error_code?: string | null };
const T0 = Date.parse("2026-11-09T21:49:35Z");

function setup(overrides: Partial<RunPollerOptions<Run>> = {}, initial: Run = { id: "R", status: "running", created_at: new Date(T0).toISOString() }) {
  const shown: Run[] = []; const errors: number[] = []; const stops: string[] = []; const terminal: Run[] = [];
  let visible = true;
  const fetchRun = vi.fn<(id: string, signal: AbortSignal) => Promise<Run | null>>();
  const poller = startRunPolling<Run>({
    run: initial, fetchRun, isActive, delay: pollDelay,
    onUpdate: r => shown.push(r), onTerminal: r => terminal.push(r),
    onTransientError: n => errors.push(n), onStop: r => stops.push(r),
    isVisible: () => visible,
    ...overrides,
  });
  return { poller, fetchRun, shown, errors, stops, terminal, setVisible: (v: boolean) => { visible = v; } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0 + 1_000); });
afterEach(() => { vi.useRealTimers(); });

describe("startRunPolling", () => {
  it("keeps polling while active and leaves 'Generating' on GPU_START_TIMEOUT, then stops", async () => {
    const t = setup();
    t.fetchRun.mockResolvedValueOnce({ id: "R", status: "running" })
      .mockResolvedValueOnce({ id: "R", status: "running" })
      .mockResolvedValueOnce({ id: "R", status: "failed", error_code: "GPU_START_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(t.fetchRun).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(t.shown.at(-1)).toMatchObject({ status: "failed", error_code: "GPU_START_TIMEOUT" });
    expect(t.terminal).toHaveLength(1);
    expect(t.stops).toEqual(["terminal"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.fetchRun).toHaveBeenCalledTimes(3); // no request after the terminal transition
  });

  it("does not stop early when a response is dropped as stale", async () => {
    const t = setup();
    t.fetchRun.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "R", status: "failed" });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(t.fetchRun).toHaveBeenCalledTimes(3);
    expect(t.stops).toEqual(["terminal"]);
  });

  it("ignores a response for another run id", async () => {
    const t = setup();
    t.fetchRun.mockResolvedValueOnce({ id: "OTHER", status: "failed" }).mockResolvedValueOnce({ id: "R", status: "running" });
    await vi.advanceTimersByTimeAsync(6_000);
    expect(t.shown).toEqual([{ id: "R", status: "running" }]);
    expect(t.stops).toEqual([]);
  });

  it("retries transient network errors with backoff, then recovers", async () => {
    const t = setup();
    t.fetchRun.mockRejectedValueOnce(new Error("net")).mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce({ id: "R", status: "failed" });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(t.errors).toEqual([1]);
    await vi.advanceTimersByTimeAsync(5_999); // backoff 6 s
    expect(t.fetchRun).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.errors).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(12_000); // backoff 12 s
    expect(t.stops).toEqual(["terminal"]);
  });

  it("gives up after repeated errors instead of looping forever", async () => {
    const t = setup({ maxConsecutiveErrors: 3 });
    t.fetchRun.mockRejectedValue(new Error("down"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(t.fetchRun).toHaveBeenCalledTimes(3);
    expect(t.stops).toEqual(["errors"]);
  });

  it("aborts a hung request after the timeout and retries", async () => {
    const t = setup({ requestTimeoutMs: 5_000 });
    t.fetchRun.mockImplementationOnce((_id, signal) => new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))))
      .mockResolvedValueOnce({ id: "R", status: "failed" });
    await vi.advanceTimersByTimeAsync(3_000 + 5_000);
    expect(t.errors).toEqual([1]);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(t.stops).toEqual(["terminal"]);
  });

  it("sends nothing while the tab is hidden, and checks at once when visible again", async () => {
    const t = setup();
    t.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.fetchRun).not.toHaveBeenCalled();
    t.fetchRun.mockResolvedValueOnce({ id: "R", status: "failed" });
    t.setVisible(true); t.poller.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.fetchRun).toHaveBeenCalledTimes(1);
    expect(t.stops).toEqual(["terminal"]);
  });

  it("stops at the age bound", async () => {
    const t = setup({ maxAgeMs: 60_000 });
    t.fetchRun.mockResolvedValue({ id: "R", status: "queued" });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(t.stops).toEqual(["max_age"]);
    expect(t.fetchRun.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it("stop() (run changed or unmounted) cancels the in-flight request and applies nothing", async () => {
    let signal: AbortSignal | undefined;
    const t = setup();
    t.fetchRun.mockImplementationOnce((_id, s) => { signal = s; return new Promise(() => undefined); });
    await vi.advanceTimersByTimeAsync(3_000);
    t.poller.stop();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.fetchRun).toHaveBeenCalledTimes(1);
    expect(t.stops).toEqual(["stopped"]);
  });

  it("does not poll a run that is already terminal", async () => {
    const t = setup({}, { id: "R", status: "failed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.fetchRun).not.toHaveBeenCalled();
  });

  it("with RunSelection: a late response for a deselected run is never applied", async () => {
    const sel = new RunSelection<Run>(); sel.select("R");
    const applied: Run[] = [];
    let resolveR: (r: Run) => void = () => undefined;
    const t = setup({
      fetchRun: (id) => new Promise<Run | null>((resolve, reject) => {
        void sel.load(id, () => new Promise<Run>(r => { resolveR = r; }), r => applied.push(r), reject).then(resolve, reject);
      }),
    });
    await vi.advanceTimersByTimeAsync(3_000);
    sel.select("B"); t.poller.stop();
    resolveR({ id: "R", status: "failed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(applied).toEqual([]);
  });
});
