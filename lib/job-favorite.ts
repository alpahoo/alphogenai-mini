export type JobAppState = Record<string, unknown> | null | undefined;

export function isPlainJobAppState(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isJobFavorite(appState: JobAppState): boolean {
  return isPlainJobAppState(appState) && appState.favorite === true;
}

export function withJobFavorite(appState: unknown, favorite: boolean): Record<string, unknown> {
  const base = isPlainJobAppState(appState) ? appState : {};
  return { ...base, favorite };
}
