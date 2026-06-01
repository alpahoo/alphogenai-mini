"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Film,
  DollarSign,
  Loader2,
  TrendingUp,
  XCircle,
  CheckCircle2,
  Power,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import { StatCard } from "@/components/admin/stat-card";
import { PlanBadge } from "@/components/admin/plan-badge";
import { getEngineDisplayName } from "@/lib/types";

interface EngineStat {
  count: number;
  cost: number;
  totalDurationSec: number;
}

interface PlanCostStat {
  count: number;
  cost: number;
}

interface Stats {
  totalUsers: number;
  totalJobs: number;
  doneJobs: number;
  failedJobs: number;
  successRate: number;
  totalCostUsd: number;
  avgCostPerJob: number;
  engineStats: Record<string, EngineStat>;
  planCostStats: Record<string, PlanCostStat>;
  planDistribution: Record<string, number>;
  jobsLast7Days: { date: string; count: number }[];
  costLast30Days: { date: string; cost: number }[];
  costByEngine: Record<string, { count: number; cost: number }>;
}

const ENGINE_COLORS: Record<string, string> = {
  wan_i2v: "#6366f1",
  seedance: "#8b5cf6",
  heygen_avatar_iv: "#06b6d4",
  unknown: "#71717a",
};

const PROVIDER_INFO: Record<string, { label: string; desc: string; color: string }> = {
  evolink: { label: "EvoLink", desc: "Seedance, Kling, WAN, Hailuo, Sora", color: "text-blue-400" },
  bailian: { label: "Bailian (Alibaba)", desc: "WAN 2.6 / 2.7 via DashScope", color: "text-orange-400" },
  modal: { label: "Modal (GPU)", desc: "Wan 2.2 I2V self-hosted", color: "text-violet-400" },
  heygen: { label: "HeyGen", desc: "Avatar IV talking head, full body", color: "text-cyan-400" },
  musicgen: { label: "MusicGen (Audio)", desc: "Background music via ACE-Step 1.5", color: "text-emerald-400" },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Record<string, { enabled: boolean }>>({});
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));

    // Fetch provider toggles
    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? {}))
      .catch(console.error);
  }, []);

  const toggleProvider = async (provider: string) => {
    const current = providers[provider]?.enabled !== false;
    const newState = !current;
    setTogglingProvider(provider);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled: newState }),
      });
      const data = await res.json();
      if (data.providers) setProviders(data.providers);
    } catch (e) {
      console.error("Toggle failed:", e);
    } finally {
      setTogglingProvider(null);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const engineData = Object.entries(stats.engineStats).map(([key, val]) => ({
    name: getEngineDisplayName(key),
    key,
    count: val.count,
    cost: val.cost,
    totalDurationSec: val.totalDurationSec,
    avgCostPerSec: val.totalDurationSec > 0 ? val.cost / val.totalDurationSec : 0,
  }));

  const planData = Object.entries(stats.planDistribution).map(
    ([plan, count]) => ({
      name: plan.charAt(0).toUpperCase() + plan.slice(1),
      plan,
      value: count as number,
      cost: stats.planCostStats[plan]?.cost ?? 0,
    })
  );

  const dailyJobs = stats.jobsLast7Days.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en", {
      weekday: "short",
      day: "numeric",
    }),
  }));

  const costTrend = stats.costLast30Days.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Real-time overview of platform usage and costs
        </p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="text-blue-400" />
        <StatCard label="Total Jobs" value={stats.totalJobs} icon={Film} color="text-green-400" />
        <StatCard
          label="Total Cost"
          value={`$${stats.totalCostUsd.toFixed(2)}`}
          icon={DollarSign}
          color="text-yellow-400"
          description={`Avg $${stats.avgCostPerJob.toFixed(4)}/job`}
        />
        <StatCard
          label="Success Rate"
          value={`${stats.successRate}%`}
          icon={stats.successRate >= 80 ? CheckCircle2 : XCircle}
          color={stats.successRate >= 80 ? "text-green-400" : "text-red-400"}
          description={`${stats.doneJobs} done · ${stats.failedJobs} failed`}
        />
      </div>

      {/* Provider toggles */}
      <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
        <div className="border-b border-border/40 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Provider Controls
          </h3>
        </div>
        <div className="grid gap-0 divide-y divide-border/20">
          {Object.entries(PROVIDER_INFO).map(([key, info]) => {
            const enabled = providers[key]?.enabled !== false;
            const isToggling = togglingProvider === key;
            return (
              <div key={key} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${enabled ? "bg-green-400" : "bg-zinc-600"}`} />
                  <div>
                    <p className={`text-sm font-medium ${info.color}`}>{info.label}</p>
                    <p className="text-xs text-muted-foreground/60">{info.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleProvider(key)}
                  disabled={isToggling}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    enabled
                      ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "border-zinc-600/30 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50"
                  } disabled:opacity-50`}
                >
                  {isToggling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Power className="h-3 w-3" />
                  )}
                  {enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost trends (30d) */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cost Trends — Last 30 Days
          </h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span className="tabular-nums">
              ${stats.costLast30Days.reduce((s, d) => s + d.cost, 0).toFixed(2)} total
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={costTrend}>
            <defs>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1c1c1e",
                border: "1px solid #333",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, "Cost"]}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#costGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Jobs 7d + Engine distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Jobs — Last 7 Days
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyJobs}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1c1c1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Engine Distribution
          </h3>
          {engineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={engineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {engineData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={ENGINE_COLORS[entry.key] ?? "#71717a"}
                    />
                  ))}
                </Pie>
                <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1c1c1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                  formatter={(value, _name, item) => {
                    // Recharts types `item.payload` as `unknown` — narrow safely
                    const payload = (item as { payload?: { cost?: number } }).payload;
                    return [
                      `${Number(value ?? 0)} jobs · $${payload?.cost?.toFixed(4) ?? "0"}`,
                      "",
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No data yet</p>
          )}
        </div>
      </div>

      {/* Engine cost breakdown */}
      <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
        <div className="border-b border-border/40 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cost Breakdown by Engine
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left text-xs text-muted-foreground">
              <th className="px-5 py-3">Engine</th>
              <th className="px-5 py-3 text-right">Jobs</th>
              <th className="px-5 py-3 text-right">Total cost</th>
              <th className="px-5 py-3 text-right">Avg cost/job</th>
              <th className="px-5 py-3 text-right">Total seconds</th>
            </tr>
          </thead>
          <tbody>
            {engineData.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No jobs yet
                </td>
              </tr>
            ) : (
              engineData.map((e) => (
                <tr key={e.key} className="border-b border-border/20 last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: ENGINE_COLORS[e.key] ?? "#71717a" }} />
                      <span className="font-medium">{e.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{e.count}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-yellow-400">${e.cost.toFixed(4)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    ${(e.count > 0 ? e.cost / e.count : 0).toFixed(4)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{e.totalDurationSec}s</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Plan breakdown */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Users & Cost by Plan
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {planData.map((p) => (
            <div key={p.name} className="rounded-lg border border-border/30 bg-background/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <PlanBadge plan={p.plan} />
                <span className="text-xs text-muted-foreground">{p.value} users</span>
              </div>
              <p className="text-xl font-bold tabular-nums">${p.cost.toFixed(2)}</p>
              <p className="text-[11px] text-muted-foreground/60">
                {stats.planCostStats[p.plan]?.count ?? 0} jobs
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
