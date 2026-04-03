"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Film,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Project {
  id: string;
  prompt: string;
  status: string;
  plan: string;
  created_at: string;
  output_url_final: string | null;
  target_duration_seconds: number | null;
}

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

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("jobs")
          .select(
            "id, prompt, status, plan, created_at, output_url_final, target_duration_seconds"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (data) setProjects(data);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between mb-8"
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
            No projects yet. Create your first video!
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Create video
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {projects.map((project, i) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
            >
              <Link
                href={`/jobs/${project.id}`}
                className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/80 px-5 py-4 backdrop-blur-sm transition-all duration-150 hover:border-primary/30 hover:bg-card"
              >
                {/* Thumbnail placeholder */}
                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                  {project.output_url_final ? (
                    <Film className="h-5 w-5 text-primary/60" />
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
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
