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
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <Loader2 className="h-3 w-3 animate-spin" />
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
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your generated videos and creations.
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          New project
        </Link>
      </motion.div>

      {/* ── Filters bar ───────────────────────────────────── */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 rounded-lg border border-border/40 bg-muted/20 p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border/40 bg-muted/20 py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
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
          className="flex flex-col items-center justify-center py-20 text-center"
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
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Create video
            </Link>
          )}
        </motion.div>
      ) : (
        <>
          <div className="space-y-2">
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
                    className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/80 px-5 py-4 pr-14 backdrop-blur-sm transition-all duration-150 hover:border-primary/30 hover:bg-card"
                  >
                    {/* Thumbnail */}
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-muted/50 overflow-hidden">
                      {project.output_url_final ? (
                        <video
                          src={project.output_url_final}
                          className="h-full w-full object-cover"
                          preload="metadata"
                          muted
                        />
                      ) : (
                        <Film className="h-5 w-5 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">
                        {project.prompt}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(project.created_at)}
                        </span>
                        {project.target_duration_seconds && (
                          <span>{project.target_duration_seconds}s</span>
                        )}
                        <span className="uppercase text-[10px]">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all disabled:opacity-50"
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
                className="inline-flex items-center gap-2 rounded-lg border border-border/40 px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50"
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
  );
}
