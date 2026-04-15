"use client";

import { useState, useEffect } from "react";
import { Users, Film, DollarSign, Cpu, Loader2 } from "lucide-react";
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
} from "recharts";
import { StatCard } from "@/components/admin/stat-card";
import { PlanBadge } from "@/components/admin/plan-badge";
import { getEngineDisplayName } from "@/lib/types";

interface Stats {
  totalUsers: number;
  totalJobs: number;
  totalCostUsd: number;
  costByEngine: Record<string, { count: number; cost: number }>;
  jobsLast7Days: { date: string; count: number }[];
  planDistribution: Record<string, number>;
}

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd"];
const ENGINE_COLORS: Record<string, string> = {
  wan_i2v: "#6366f1",
  seedance: "#8b5cf6",
  unknown: "#71717a",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Prepare chart data
  const engineData = Object.entries(stats.costByEngine).map(([key, val]) => ({
    name: getEngineDisplayName(key),
    value: val.count,
    cost: Math.round(val.cost * 10000) / 10000,
  }));

  const planData = Object.entries(stats.planDistribution).map(([plan, count]) => ({
    name: plan.charAt(0).toUpperCase() + plan.slice(1),
    value: count as number,
  }));

  const activeEngines = Object.keys(stats.costByEngine).length;

  // Format daily chart labels
  const dailyData = stats.jobsLast7Days.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your platform</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          icon={Users}
          color="text-blue-400"
        />
        <StatCard
          label="Total Jobs"
          value={stats.totalJobs}
          icon={Film}
          color="text-green-400"
        />
        <StatCard
          label="Total Cost"
          value={`$${stats.totalCostUsd.toFixed(2)}`}
          icon={DollarSign}
          color="text-yellow-400"
        />
        <StatCard
          label="Active Engines"
          value={activeEngines}
          icon={Cpu}
          color="text-purple-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Jobs per day */}
        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Jobs — Last 7 Days
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1c1c1e",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Engine distribution */}
        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Engine Distribution
          </h3>
          {engineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={engineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {engineData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={ENGINE_COLORS[Object.keys(stats.costByEngine)[i]] ?? PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs text-muted-foreground">{value}</span>
                  )}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1c1c1e",
                    border: "1px solid #333",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string, props: { payload?: { cost?: number } }) => [
                    `${value} jobs ($${props.payload?.cost?.toFixed(4) ?? "0"})`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-16">No data yet</p>
          )}
        </div>
      </div>

      {/* Plan distribution */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Users by Plan
        </h3>
        <div className="flex gap-6">
          {planData.map((p) => (
            <div key={p.name} className="flex items-center gap-3">
              <PlanBadge plan={p.name.toLowerCase()} />
              <span className="text-lg font-bold tabular-nums">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
