export interface ExpiringNativeBase {
  id: string;
  userId: string;
  videoPath: string;
  normalizedVideoPath?: string | null;
}

export interface NativeBaseRetentionDependencies {
  removeObjects: (paths: string[]) => Promise<boolean>;
  markRemoved: (id: string, userId: string, deletedAt: string) => Promise<boolean>;
  now?: () => string;
}

export const NATIVE_NORMALIZATION_STALE_MS = 2 * 60 * 60 * 1000;

export function isNativeNormalizationActive(
  status: string,
  updatedAt: string,
  now = Date.now(),
) {
  if (status !== "normalizing") return false;
  const updatedAtMs = Date.parse(updatedAt);
  return Number.isFinite(updatedAtMs)
    && now - updatedAtMs < NATIVE_NORMALIZATION_STALE_MS;
}

export async function expireNativePresenterBase(
  base: ExpiringNativeBase,
  deps: NativeBaseRetentionDependencies,
) {
  const paths = [base.videoPath, base.normalizedVideoPath].filter(
    (path): path is string => Boolean(path),
  );
  if (!(await deps.removeObjects(paths))) return "error" as const;
  const removed = await deps.markRemoved(
    base.id,
    base.userId,
    (deps.now ?? (() => new Date().toISOString()))(),
  );
  return removed ? "removed" as const : "error" as const;
}
