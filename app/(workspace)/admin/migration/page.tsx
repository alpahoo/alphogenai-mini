"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Activity,
  Clock,
  DollarSign,
  CheckCircle2,
  Settings2,
  Zap,
} from "lucide-react";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderStats {
  total: number;
  successRate: number;
  avgLatencySec: number;
  totalCost: number;
  avgCostPerJob: number;
}

interface MigrationData {
  providers: Record<string, ProviderStats>;
  config: {
    bailianTrafficPct: number;
    bailianConfigured: boolean;
    mappedEngines: Record<string, string>;
  };
  period: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  bailian: "Bailian",
  evolink: "EvoLink",
  modal: "Modal",
};

const PROVIDER_COLORS: Record<string, string> = {
  bailian: "text-amber-400",
  evolink: "text-indigo-400",
  modal: "text-emerald-400",
};

const PROVIDER_BG: Record<string, string> = {
  bailian: "bg-amber-500/10",
  evolink: "bg-indigo-500/10",
  modal: "bg-emerald-500/10",
};

function successRateColor(rate: number): string {
  if (rate >= 90) return "text-green-400";
  if (rate >= 70) return "text-amber-400";
  return "text-red-400";
}

function successRateBg(rate: number): string {
  if (rate >= 90) return "bg-green-500/10";
  if (rate >= 70) return "bg-amber-500/10";
  return "bg-red-500/10";
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4.5 w-4.5 ${color}`} />
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MigrationDashboard() {
  const [data, setData] = useState<MigrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/migration")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Access denied — admin only." : `Request failed (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="px-8 py-10 max-w-5xl mx-auto">
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Create
        </Link>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <p className="text-sm text-muted-foreground">
            {error ?? "Failed to load migration data."}
          </p>
        </div>
      </div>
    );
  }

  const providerEntries = Object.entries(data.providers) as [string, ProviderStats][];
  const mappedEntries = Object.entries(data.config.mappedEngines);

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      {/* ── Back link ──────────────────────────────────────── */}
      <Link
        href="/create"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Create
      </Link>

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          Migration Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bailian vs EvoLink comparison &mdash; Last 7 days
        </p>
      </motion.div>

      {/* ── Provider KPI sections ──────────────────────────── */}
      {providerEntries.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">No provider data for this period.</p>
        </div>
      ) : (
        <div className="space-y-6 mb-8">
          {providerEntries.map(([key, stats], idx) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    PROVIDER_BG[key]?.replace("/10", "/80") ?? "bg-muted"
                  }`}
                />
                {PROVIDER_LABELS[key] ?? key}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard
                  label="Total Jobs"
                  value={stats.total}
                  icon={Zap}
                  color={PROVIDER_COLORS[key] ?? "text-muted-foreground"}
                  bg={PROVIDER_BG[key] ?? "bg-muted/10"}
                />
                <KpiCard
                  label="Success Rate"
                  value={`${stats.successRate}%`}
                  icon={CheckCircle2}
                  color={successRateColor(stats.successRate)}
                  bg={successRateBg(stats.successRate)}
                />
                <KpiCard
                  label="Avg Latency"
                  value={`${stats.avgLatencySec}s`}
                  icon={Clock}
                  color="text-blue-400"
                  bg="bg-blue-500/10"
                />
                <KpiCard
                  label="Total Cost"
                  value={`$${stats.totalCost.toFixed(4)}`}
                  icon={DollarSign}
                  color="text-yellow-400"
                  bg="bg-yellow-500/10"
                />
                <KpiCard
                  label="Avg Cost / Job"
                  value={`$${stats.avgCostPerJob.toFixed(4)}`}
                  icon={DollarSign}
                  color="text-yellow-400/70"
                  bg="bg-yellow-500/5"
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Config section ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-xl border border-border/40 bg-card/60 p-5"
      >
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5" />
          Configuration
        </h3>

        <div className="space-y-4">
          {/* Bailian configured */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Bailian configured</span>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  data.config.bailianConfigured ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm font-medium">
                {data.config.bailianConfigured ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Traffic % */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Bailian traffic</span>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${Math.min(100, data.config.bailianTrafficPct)}%` }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums w-10 text-right">
                {data.config.bailianTrafficPct}%
              </span>
            </div>
          </div>

          {/* Mapped engines */}
          {mappedEntries.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Mapped engines</p>
              <div className="space-y-1.5">
                {mappedEntries.map(([from, to]) => (
                  <div
                    key={from}
                    className="flex items-center gap-2 text-sm rounded-lg border border-border/30 bg-background/40 px-3 py-2"
                  >
                    <code className="text-xs font-mono text-foreground">{from}</code>
                    <ArrowLeft className="h-3 w-3 text-muted-foreground rotate-180" />
                    <code className="text-xs font-mono text-amber-400">{to}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
