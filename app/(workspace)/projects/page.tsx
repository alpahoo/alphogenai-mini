"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Film,
  Plus,
  Trash2,
  Search,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 20;

interface Project {
  id: string;
  prompt: string;
  status: string;
  plan: string;
  engine_used: string | null;
  created_at: string;
  output_url_final: string | null;
  target_duration_seconds: number | null;
}

type StatusFilter = "all" | "in_progress" | "done" | "failed";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Completed" },
  { key: "failed", label: "Failed" },
];

function statusBadge(status: string) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Complete
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      In progress
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadProjects = useCallback(
    async (offset = 0, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase
          .from("jobs")
          .select(
            "id, prompt, status, plan, engine_used, created_at, output_url_final, target_duration_seconds",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE);

        // Status filter
        if (statusFilter === "in_progress") {
          query = query.in("status", ["pending", "in_progress"]);
        } else if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        // Search filter (ilike on prompt)
        if (debouncedSearch.trim()) {
          query = query.ilike("prompt", `%${debouncedSearch.trim()}%`);
        }

        const { data } = await query;
        const rows = (data ?? []) as Project[];

        setHasMore(rows.length > PAGE_SIZE);
        const trimmed = rows.slice(0, PAGE_SIZE);

        if (append) {
          setProjects((prev) => [...prev, ...trimmed]);
        } else {
          setProjects(trimmed);
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, debouncedSearch],
  );

  // Reload when filter/search changes
  useEffect(() => {
    loadProjects(0, false);
  }, [loadProjects]);

  const handleLoadMore = () => {
    loadProjects(projects.length, true);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this project? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // fail silently
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              <Film className="h-3.5 w-3.5" />
              Project vault
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Projects</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Review every generation, reopen the studio, duplicate strong takes, or turn a completed video into a new reference.
            </p>
          </div>
          <Link
            href="/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4" />
            New project
          </Link>
        </div>
      </motion.div>

      {/* ── Filters bar ───────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row">
        {/* Status tabs */}
        <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                statusFilter === tab.key
                  ? "bg-white text-neutral-950 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-950"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-4 text-sm text-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950/10"
          />
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white py-20 text-center shadow-sm"
        >
          <Film className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground mb-4">
            {debouncedSearch || statusFilter !== "all"
              ? "No projects match your filters."
              : "No projects yet. Create your first video!"}
          </p>
          {!debouncedSearch && statusFilter === "all" && (
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-neutral-800"
            >
              <Plus className="h-4 w-4" />
              Create video
            </Link>
          )}
        </motion.div>
      ) : (
        <>
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.03 }}
                  className="group relative"
                >
                  <Link
                    href={`/jobs/${project.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-5 py-4 pr-14 shadow-sm transition-all duration-150 hover:border-neutral-300 hover:shadow-md"
                  >
                    {/* Thumbnail */}
                    <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
                      {project.output_url_final ? (
                        <video
                          src={project.output_url_final}
                          className="h-full w-full object-cover"
                          preload="metadata"
                          muted
                        />
                      ) : (
                        <Film className="h-6 w-6 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">
                        {project.prompt}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(project.created_at)}
                        </span>
                        {project.target_duration_seconds && (
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">{project.target_duration_seconds}s</span>
                        )}
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                          {project.plan}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    {statusBadge(project.status)}
                  </Link>

                  {/* Delete button — absolute right, visible on hover */}
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    disabled={deleting === project.id}
                    title="Delete project"
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {deleting === project.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-2 text-sm font-medium text-neutral-600 transition-all hover:bg-neutral-50 hover:text-neutral-950 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Load more
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
