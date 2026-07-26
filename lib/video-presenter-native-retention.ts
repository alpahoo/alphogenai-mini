export interface ExpiringNativeBase {
  id: string;
  userId: string;
  videoPath: string;
}

export interface NativeBaseRetentionDependencies {
  removeObject: (path: string) => Promise<boolean>;
  markRemoved: (id: string, userId: string, deletedAt: string) => Promise<boolean>;
  now?: () => string;
}

export async function expireNativePresenterBase(
  base: ExpiringNativeBase,
  deps: NativeBaseRetentionDependencies,
) {
  if (!(await deps.removeObject(base.videoPath))) return "error" as const;
  const removed = await deps.markRemoved(
    base.id,
    base.userId,
    (deps.now ?? (() => new Date().toISOString()))(),
  );
  return removed ? "removed" as const : "error" as const;
}
