/**
 * Keeps the displayed run consistent with the selected run (URL `?run=`).
 *
 * Every fetch is tied to the selection that started it. A response or error is applied only if that
 * selection is still current and the payload is for the requested id. Aborting the previous request is
 * an optimisation; the identity check is the guarantee (an abort can lose the race with a response).
 */
export class RunSelection<Run extends { id: string }> {
  private currentId: string | null = null;
  private controller: AbortController | null = null;

  get current(): string | null { return this.currentId; }

  /** Make `id` the selected run and cancel in-flight requests for the previous one. */
  select(id: string | null): void {
    if (id === this.currentId) return;
    this.controller?.abort();
    this.currentId = id;
    this.controller = id ? new AbortController() : null;
  }

  isCurrent(id: string): boolean { return this.currentId === id; }

  /**
   * Fetch `id` and apply it only if it is still selected.
   * Returns the run when applied, `null` when the result was stale and dropped.
   */
  async load(
    id: string,
    fetcher: (id: string, signal: AbortSignal) => Promise<Run>,
    apply: (run: Run) => void,
    onError: (error: unknown) => void,
  ): Promise<Run | null> {
    if (!this.isCurrent(id) || !this.controller) return null;
    const signal = this.controller.signal;
    try {
      const run = await fetcher(id, signal);
      if (!this.isCurrent(id) || signal.aborted || run.id !== id) return null;
      apply(run);
      return run;
    } catch (error) {
      if (this.isCurrent(id) && !signal.aborted) onError(error);
      return null;
    }
  }
}
