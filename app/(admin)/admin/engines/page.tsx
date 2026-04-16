"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, Plus, Cpu, DollarSign, Settings } from "lucide-react";

interface Engine {
  id: string;
  name: string;
  type: "api" | "modal_local";
  status: "active" | "coming_soon" | "deprecated";
  max_duration: number;
  gpu: string | null;
  priority: number;
  plans: string[];
  cost: { billing_model: string; per_second_usd: number | null; per_video_usd: number | null } | null;
  secrets: { name: string; updated_at: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  coming_soon: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  deprecated: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function AdminEnginesPage() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEngines = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/engines")
      .then((r) => r.json())
      .then((d) => setEngines(d.engines ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEngines();
  }, [fetchEngines]);

  const formatCost = (cost: Engine["cost"]) => {
    if (!cost) return "—";
    if (cost.billing_model === "per_second" && cost.per_second_usd !== null) {
      return `$${cost.per_second_usd}/s`;
    }
    if (cost.billing_model === "per_video" && cost.per_video_usd !== null) {
      return `$${cost.per_video_usd}/video`;
    }
    return "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Engines</h1>
          <p className="text-sm text-muted-foreground">
            Manage video generation engines, plans, costs, and API secrets
          </p>
        </div>
        <Link
          href="/admin/engines/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Add Engine
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Engine</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plans</th>
                <th className="px-4 py-3">Max Duration</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Secrets</th>
                <th className="px-4 py-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {engines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No engines yet
                  </td>
                </tr>
              ) : (
                engines.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/engines/${e.id}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{e.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{e.id}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {e.type === "api" ? "API" : "Modal GPU"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          STATUS_COLORS[e.status] ?? ""
                        }`}
                      >
                        {e.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {e.plans.map((p) => (
                          <span
                            key={p}
                            className="inline-flex rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{e.max_duration}s</td>
                    <td className="px-4 py-3 tabular-nums text-yellow-400">{formatCost(e.cost)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                      {e.secrets.length}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{e.priority}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-border/20 bg-muted/10 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Session 1/4</strong> : Les configurations stockées ici ne sont pas encore
          utilisées par le pipeline Python (qui continue à utiliser le registry hardcodé). La
          migration complète vers DB-driven est prévue en Sessions 3-4.
        </p>
      </div>
    </div>
  );
}
