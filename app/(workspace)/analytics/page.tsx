"use client";

import { useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Film,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  Send,
  Play,
  AlertTriangle,
  Mic,
  Volume2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  RefreshCw,
} from "lucide-react";
import { getEngineDisplayName } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AnalyticsData {
  days: number;
  totalJobs: number;
  doneJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  successRate: number;
  totalDurationSec: number;
  engineBreakdown: Record<string, { count: number; durationSec: number }>;
  planBreakdown: Record<string, number>;
  audioStats: { withAudio: number; withVoiceover: number; total: number };
  publishStats: {
    totalScheduled: number;
    published: number;
    failed: number;
    partiallyPublished: number;
    pending: number;
  };
  platformBreakdown: Record<
    string,
    { scheduled: number; published: number; failed: number }
  >;
  dailyChart: Array<{
    date: string;
    generated: number;
    done: number;
    failed: number;
    published: number;
  }>;
  recentJobs: Array<{
    id: string;
    prompt: string;
    status: string;
    engine: string | null;
    plan: string | null;
    created_at: string;
  }>;
}

type TabKey = "overview" | "publishing" | "engines";
type PeriodKey = 7 | 30 | 90;

// ---------------------------------------------------------------------------
// Platform visuals (Postiz-inspired)
// ---------------------------------------------------------------------------
const PLATFORM_META: Record<
  string,
  { label: string; color: string; bg: string; icon: string }
> = {
  youtube: {
    label: "YouTube",
    color: "text-red-400",
    bg: "bg-red-500/15",
    icon: "▶",
  },
  tiktok: {
    label: "TikTok",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    icon: "♪",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-400",
    bg: "bg-pink-500/15",
    icon: "◎",
  },
};

const PLAN_COLORS: Record<string, { bar: string; dot: string }> = {
  free: { bar: "bg-zinc-400", dot: "bg-zinc-400" },
  pro: { bar: "bg-indigo-500", dot: "bg-indigo-500" },
  premium: { bar: "bg-amber-500", dot: "bg-amber-500" },
};

const STATUS_DOT: Record<string, string> = {
  done: "bg-emerald-400",
  failed: "bg-red-400",
  in_progress: "bg-amber-400",
  pending: "bg-zinc-400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = Math.floor(hrs / 24);
  return `${d}d ago`;
}

function pct(val: number, total: number): number {
  return total > 0 ? Math.round((val / total) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const KpiCard = memo(function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
  trend,
}: {
  icon: typeof Film;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  bg: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border border-border/40 bg-card/60 p-5 hover:border-border/60 transition-colors"
    >
      {/* Accent bar top — Postiz style */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${bg.replace("/10", "/40").replace("/15", "/50")}`} />
      <div className="flex items-start justify-between mb-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}
        >
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === "up" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>
      )}
    </motion.div>
  );
});

const MiniBar = memo(function MiniBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/20">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${w}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
});

const SectionCard = memo(function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/40 bg-card/60 p-5 ${className ?? ""}`}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------
function OverviewTab({ data }: { data: AnalyticsData }) {
  const chartMax = Math.max(1, ...data.dailyChart.map((d) => d.generated));
  const engines = Object.entries(data.engineBreakdown).sort(
    ([, a], [, b]) => b.count - a.count
  );
  const engineMax = Math.max(1, ...engines.map(([, v]) => v.count));

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Film}
          label="Total generations"
          value={data.totalJobs}
          color="text-primary"
          bg="bg-primary/10"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Completed"
          value={data.doneJobs}
          sub={`${data.successRate}% success rate`}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
          trend={data.successRate >= 80 ? "up" : data.successRate < 50 ? "down" : null}
        />
        <KpiCard
          icon={Clock}
          label="Total video time"
          value={formatDuration(data.totalDurationSec)}
          color="text-amber-400"
          bg="bg-amber-500/10"
        />
        <KpiCard
          icon={Activity}
          label="In progress"
          value={data.inProgressJobs}
          sub={`${data.failedJobs} failed`}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
      </div>

      {/* Daily chart */}
      <SectionCard title={`Daily generations (${data.days} days)`}>
        <div className="flex items-end gap-[3px] h-36">
          {data.dailyChart.map((day) => {
            const genPct =
              chartMax > 0 ? (day.generated / chartMax) * 100 : 0;
            const failRatio =
              day.generated > 0 ? day.failed / day.generated : 0;
            return (
              <div
                key={day.date}
                className="flex-1 group relative cursor-default"
                title={`${day.date}: ${day.generated} generated, ${day.done} done, ${day.failed} failed`}
              >
                <div className="relative">
                  <div
                    className={`w-full rounded-t-sm transition-all duration-200 ${
                      day.generated === 0
                        ? "bg-muted/15"
                        : failRatio > 0.5
                          ? "bg-red-500/50 group-hover:bg-red-500/70"
                          : "bg-primary/50 group-hover:bg-primary/70"
                    }`}
                    style={{ height: `${Math.max(2, genPct)}%` }}
                  />
                  {/* Published overlay dot */}
                  {day.published > 0 && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/50">
          <span>{data.dailyChart[0]?.date.slice(5)}</span>
          <span>
            {data.dailyChart[data.dailyChart.length - 1]?.date.slice(5)}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-primary/50" />
            Generated
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-500/50" />
            Failed (&gt;50%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Published
          </span>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Engine breakdown */}
        {engines.length > 0 && (
          <SectionCard title="Engines used">
            <div className="space-y-3">
              {engines.slice(0, 8).map(([key, stats]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      {getEngineDisplayName(key)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stats.count} &middot;{" "}
                      {formatDuration(stats.durationSec)}
                    </span>
                  </div>
                  <MiniBar
                    value={stats.count}
                    max={engineMax}
                    color="bg-primary/60"
                  />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Plan & audio breakdown */}
        <div className="space-y-6">
          {/* Plan breakdown */}
          <SectionCard title="Plan usage">
            <div className="space-y-3">
              {Object.entries(data.planBreakdown)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([plan, count]) => (
                  <div key={plan} className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        PLAN_COLORS[plan]?.dot ?? "bg-zinc-400"
                      }`}
                    />
                    <span className="text-sm font-medium capitalize flex-1">
                      {plan}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {count} video{count > 1 ? "s" : ""} &middot;{" "}
                      {pct(count, data.doneJobs)}%
                    </span>
                  </div>
                ))}
              {Object.values(data.planBreakdown).every((v) => v === 0) && (
                <p className="text-sm text-muted-foreground/60">
                  No completed videos yet
                </p>
              )}
            </div>
          </SectionCard>

          {/* Audio usage */}
          <SectionCard title="Audio features">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted/20 p-3 text-center">
                <Volume2 className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold">
                  {data.audioStats.withAudio}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  With music
                </p>
              </div>
              <div className="rounded-lg bg-muted/20 p-3 text-center">
                <Mic className="h-4 w-4 text-sky-400 mx-auto mb-1" />
                <p className="text-lg font-bold">
                  {data.audioStats.withVoiceover}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  With voiceover
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Recent activity */}
      {data.recentJobs.length > 0 && (
        <SectionCard title="Recent activity">
          <div className="space-y-2">
            {data.recentJobs.map((job) => (
              <a
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors group"
              >
                <div
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    STATUS_DOT[job.status] ?? "bg-zinc-400"
                  }`}
                />
                <p className="text-sm font-medium truncate flex-1 group-hover:text-primary transition-colors">
                  {job.prompt || "Untitled"}
                </p>
                {job.engine && (
                  <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                    {getEngineDisplayName(job.engine)}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                  {timeAgo(job.created_at)}
                </span>
              </a>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Publishing
// ---------------------------------------------------------------------------
function PublishingTab({ data }: { data: AnalyticsData }) {
  const ps = data.publishStats;
  const platforms = Object.entries(data.platformBreakdown).sort(
    ([, a], [, b]) => b.scheduled - a.scheduled
  );
  const platMax = Math.max(1, ...platforms.map(([, v]) => v.scheduled));

  return (
    <div className="space-y-6">
      {/* Publishing KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Calendar}
          label="Total scheduled"
          value={ps.totalScheduled}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <KpiCard
          icon={Send}
          label="Published"
          value={ps.published}
          sub={
            ps.totalScheduled > 0
              ? `${pct(ps.published, ps.totalScheduled)}% publish rate`
              : undefined
          }
          color="text-emerald-400"
          bg="bg-emerald-500/10"
          trend={
            ps.totalScheduled > 0 && pct(ps.published, ps.totalScheduled) >= 80
              ? "up"
              : null
          }
        />
        <KpiCard
          icon={AlertTriangle}
          label="Failed"
          value={ps.failed}
          sub={
            ps.partiallyPublished > 0
              ? `${ps.partiallyPublished} partial`
              : undefined
          }
          color="text-red-400"
          bg="bg-red-500/10"
          trend={ps.failed > 3 ? "down" : null}
        />
        <KpiCard
          icon={Play}
          label="Pending"
          value={ps.pending}
          sub="Waiting to publish"
          color="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      {/* Platform breakdown */}
      {platforms.length > 0 ? (
        <SectionCard title="Platform breakdown">
          <div className="space-y-5">
            {platforms.map(([plat, stats]) => {
              const meta = PLATFORM_META[plat] ?? {
                label: plat,
                color: "text-muted-foreground",
                bg: "bg-muted/20",
                icon: "•",
              };
              return (
                <div key={plat}>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${meta.bg} ${meta.color}`}
                    >
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {stats.scheduled} scheduled &middot;{" "}
                        <span className="text-emerald-400">
                          {stats.published} published
                        </span>
                        {stats.failed > 0 && (
                          <>
                            {" "}
                            &middot;{" "}
                            <span className="text-red-400">
                              {stats.failed} failed
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {pct(stats.published, stats.scheduled)}%
                    </span>
                  </div>
                  <MiniBar
                    value={stats.published}
                    max={platMax}
                    color={
                      plat === "youtube"
                        ? "bg-red-500/60"
                        : plat === "tiktok"
                          ? "bg-cyan-500/60"
                          : "bg-pink-500/60"
                    }
                  />
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Platform breakdown">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Send className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">
              No scheduled posts yet
            </p>
            <a
              href="/schedule"
              className="mt-2 text-xs text-primary hover:underline"
            >
              Schedule your first post
            </a>
          </div>
        </SectionCard>
      )}

      {/* Publishing timeline (daily chart — published overlay) */}
      <SectionCard title={`Publishing activity (${data.days} days)`}>
        {data.dailyChart.some((d) => d.published > 0) ? (
          <>
            <div className="flex items-end gap-[3px] h-28">
              {data.dailyChart.map((day) => {
                const maxPub = Math.max(
                  1,
                  ...data.dailyChart.map((d) => d.published)
                );
                const h =
                  day.published > 0
                    ? (day.published / maxPub) * 100
                    : 0;
                return (
                  <div
                    key={day.date}
                    className="flex-1 group"
                    title={`${day.date}: ${day.published} published`}
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        day.published === 0
                          ? "bg-muted/15"
                          : "bg-emerald-500/50 group-hover:bg-emerald-500/70"
                      }`}
                      style={{
                        height: `${Math.max(day.published > 0 ? 8 : 2, h)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/50">
              <span>{data.dailyChart[0]?.date.slice(5)}</span>
              <span>
                {data.dailyChart[data.dailyChart.length - 1]?.date.slice(5)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground/50 text-center py-8">
            No publications in this period
          </p>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Engines
// ---------------------------------------------------------------------------
function EnginesTab({ data }: { data: AnalyticsData }) {
  const engines = Object.entries(data.engineBreakdown).sort(
    ([, a], [, b]) => b.count - a.count
  );
  const totalEngineVideos = engines.reduce((s, [, v]) => s + v.count, 0);
  const totalEngineDur = engines.reduce((s, [, v]) => s + v.durationSec, 0);

  const barColors = [
    "bg-primary/60",
    "bg-indigo-500/60",
    "bg-violet-500/60",
    "bg-cyan-500/60",
    "bg-emerald-500/60",
    "bg-amber-500/60",
    "bg-pink-500/60",
    "bg-rose-500/60",
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={Cpu}
          label="Engines used"
          value={engines.length}
          color="text-violet-400"
          bg="bg-violet-500/10"
        />
        <KpiCard
          icon={Film}
          label="Total engine videos"
          value={totalEngineVideos}
          color="text-primary"
          bg="bg-primary/10"
        />
        <KpiCard
          icon={Clock}
          label="Total engine time"
          value={formatDuration(totalEngineDur)}
          color="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      {engines.length > 0 ? (
        <SectionCard title="Engine comparison">
          <div className="space-y-4">
            {engines.map(([key, stats], i) => {
              const avgDur =
                stats.count > 0
                  ? Math.round(stats.durationSec / stats.count)
                  : 0;
              return (
                <div key={key} className="rounded-lg bg-muted/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-3 w-3 rounded-sm ${
                          barColors[i % barColors.length]
                        }`}
                      />
                      <span className="text-sm font-semibold">
                        {getEngineDisplayName(key)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {pct(stats.count, totalEngineVideos)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center mt-3">
                    <div>
                      <p className="text-lg font-bold">{stats.count}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Videos
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {formatDuration(stats.durationSec)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Total time
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {formatDuration(avgDur)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Avg/video
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <MiniBar
                      value={stats.count}
                      max={totalEngineVideos}
                      color={barColors[i % barColors.length]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Engine comparison">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Cpu className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">
              No completed videos yet
            </p>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<PeriodKey>(30);

  const fetchData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setRefreshing(true);
      try {
        const res = await fetch(`/api/analytics?days=${period}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period]
  );

  useEffect(() => {
    setLoading(true);
    fetchData(false);
  }, [fetchData]);

  // ── Loading state ────────────────────────────────────────────────────────
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
        <p className="text-sm text-muted-foreground">
          Failed to load analytics.
        </p>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "publishing", label: "Publishing", icon: Send },
    { key: "engines", label: "Engines", icon: Cpu },
  ];

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Analytics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your generation and publishing performance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex rounded-lg border border-border/40 bg-card/60 p-0.5">
              {([7, 30, 90] as PeriodKey[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    period === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}d
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </motion.div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card/60 p-0.5 mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "overview" && <OverviewTab data={data} />}
          {tab === "publishing" && <PublishingTab data={data} />}
          {tab === "engines" && <EnginesTab data={data} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
