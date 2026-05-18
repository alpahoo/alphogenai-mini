"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Film,
  CheckCircle2,
  Clock,
  Cpu,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { getEngineDisplayName } from "@/lib/types";

interface AnalyticsData {
  totalJobs: number;
  doneJobs: number;
  failedJobs: number;
  successRate: number;
  totalDurationSec: number;
  engineBreakdown: Record<string, { count: number; durationSec: number }>;
  dailyChart: Array<{ date: string; total: number; done: number; failed: number }>;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/30">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-sm text-muted-foreground">Failed to load analytics.</p>
      </div>
    );
  }

  // Compute chart bar max for scaling
  const chartMax = Math.max(1, ...data.dailyChart.map((d) => d.total));

  // Engine list sorted by count desc
  const engines = Object.entries(data.engineBreakdown)
    .sort(([, a], [, b]) => b.count - a.count);
  const engineMax = Math.max(1, ...engines.map(([, v]) => v.count));

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your generation stats over the last 30 days.
        </p>
      </motion.div>

      {/* ── KPI cards ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          {
            icon: Film,
            label: "Total generations",
            value: data.totalJobs,
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            icon: CheckCircle2,
            label: "Completed",
            value: data.doneJobs,
            color: "text-green-400",
            bg: "bg-green-500/10",
          },
          {
            icon: TrendingUp,
            label: "Success rate",
            value: `${data.successRate}%`,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
          },
          {
            icon: Clock,
            label: "Total video time",
            value: formatDuration(data.totalDurationSec),
            color: "text-amber-400",
            bg: "bg-amber-500/10",
          },
        ].map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-border/40 bg-card/60 p-5"
          >
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${kpi.bg}`}>
              <kpi.icon className={`h-4.5 w-4.5 ${kpi.color}`} />
            </div>
            <p className="text-2xl font-bold tracking-tight">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Daily chart ───────────────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5 mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Daily generations (30 days)
        </h3>
        <div className="flex items-end gap-[3px] h-32">
          {data.dailyChart.map((day) => {
            const pct = chartMax > 0 ? (day.total / chartMax) * 100 : 0;
            const failPct = day.total > 0 ? (day.failed / day.total) * 100 : 0;
            return (
              <div
                key={day.date}
                className="flex-1 group relative"
                title={`${day.date}: ${day.total} total, ${day.done} done, ${day.failed} failed`}
              >
                <div
                  className={`w-full rounded-sm transition-all ${
                    day.total === 0
                      ? "bg-muted/20"
                      : failPct > 50
                        ? "bg-red-500/60 hover:bg-red-500/80"
                        : "bg-primary/60 hover:bg-primary/80"
                  }`}
                  style={{ height: `${Math.max(2, pct)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/50">
          <span>{data.dailyChart[0]?.date.slice(5)}</span>
          <span>{data.dailyChart[data.dailyChart.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* ── Engine breakdown ──────────────────────────────── */}
      {engines.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Engines used
          </h3>
          <div className="space-y-3">
            {engines.map(([key, stats]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    {getEngineDisplayName(key)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stats.count} video{stats.count > 1 ? "s" : ""} &middot; {formatDuration(stats.durationSec)}
                  </span>
                </div>
                <MiniBar value={stats.count} max={engineMax} color="bg-primary/60" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
