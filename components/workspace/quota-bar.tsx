"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface QuotaData {
  plan: string;
  planLabel: string;
  used: number;
  limit: number; // -1 = unlimited
  activeJobs: number;
  maxActive: number;
}

export function QuotaBar() {
  const [quota, setQuota] = useState<QuotaData | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchQuota() {
      try {
        const res = await fetch("/api/quota");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setQuota(data);
      } catch {
        // silent — non-critical UI
      }
    }
    fetchQuota();

    // Refresh every 30s to keep in sync after job creation
    const interval = setInterval(fetchQuota, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!quota) return null;

  const isUnlimited = quota.limit === -1;
  const pct = isUnlimited ? 0 : quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit = !isUnlimited && quota.used >= quota.limit;

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-muted-foreground">
          <Zap className="h-4 w-4" />
          Daily usage
        </span>
        <span
          className={
            isAtLimit
              ? "font-semibold text-red-500"
              : isNearLimit
                ? "font-semibold text-amber-500"
                : "text-muted-foreground"
          }
        >
          {isUnlimited ? (
            <>{quota.used} used</>
          ) : (
            <>
              {quota.used} / {quota.limit}
            </>
          )}
        </span>
      </div>

      {/* Progress bar — hidden for unlimited plans */}
      {!isUnlimited && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isAtLimit
                ? "bg-red-500"
                : isNearLimit
                  ? "bg-amber-500"
                  : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {isUnlimited && (
        <p className="text-xs text-muted-foreground/60">Unlimited generations</p>
      )}

      {isAtLimit && (
        <p className="text-xs text-red-500/80">
          Limit reached — resets in 24h
        </p>
      )}
    </div>
  );
}
