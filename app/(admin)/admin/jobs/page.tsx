"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PlanBadge } from "@/components/admin/plan-badge";
import { getEngineDisplayName } from "@/lib/types";

interface AdminJob {
  id: string;
  user_email: string;
  prompt_short: string;
  status: string;
  plan: string;
  engine_used: string | null;
  estimated_cost_usd: number | string | null;
  target_duration_seconds: number;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_STYLES: Record<string, string> = {
  done: "text-green-400",
  failed: "text-red-400",
  in_progress: "text-yellow-400",
  pending: "text-zinc-400",
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [engineFilter, setEngineFilter] = useState("");

  const fetchJobs = useCallback(
    (page = 1) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (engineFilter) params.set("engine", engineFilter);

      fetch(`/api/admin/jobs?${params}`)
        .then((r) => r.json())
        .then((d) => {
          setJobs(d.jobs ?? []);
          setPagination(d.pagination ?? pagination);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    },
    [statusFilter, engineFilter]
  );

  useEffect(() => {
    fetchJobs(1);
  }, [fetchJobs]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatCost = (c: number | string | null) => {
    if (c === null || c === undefined) return "—";
    const n = Number(c);
    return Number.isFinite(n) ? `$${n.toFixed(4)}` : "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Browse all generation jobs across all users
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
          <option value="in_progress">In progress</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.target.value)}
          className="rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
        >
          <option value="">All engines</option>
          <option value="wan_i2v">Wan 2.2 I2V</option>
          <option value="seedance">Seedance 2.0</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Prompt</th>
                  <th className="px-4 py-3">Engine</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {job.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[140px] truncate">
                      {job.user_email}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {job.prompt_short}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {getEngineDisplayName(job.engine_used)}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {formatCost(job.estimated_cost_usd)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium capitalize ${
                          STATUS_STYLES[job.status] ?? ""
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={job.plan} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(job.created_at)}
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No jobs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchJobs(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-30"
                >
                  <ChevronLeft className="h-3 w-3" /> Prev
                </button>
                <button
                  onClick={() => fetchJobs(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-30"
                >
                  Next <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
