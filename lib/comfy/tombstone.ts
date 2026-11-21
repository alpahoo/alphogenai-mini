/**
 * A deleted generation keeps a minimal accounting row. It is marked inside `params_effective` (no migration),
 * and every read that lists or opens runs excludes marked rows. PostgREST filter: `params_effective->>deleted_at`.
 */
export const TOMBSTONE_FILTER = "params_effective->>deleted_at";
export const tombstone = () => ({ deleted_at: new Date().toISOString() });
export const isTombstone = (params: unknown): boolean =>
  !!params && typeof params === "object" && !Array.isArray(params) && typeof (params as Record<string, unknown>).deleted_at === "string";
