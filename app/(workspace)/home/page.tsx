"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Film,
  ShoppingBag,
  Share2,
  Scissors,
  FlaskConical,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Workflow families
// ---------------------------------------------------------------------------
const WORKFLOWS = {
  production: {
    title: "AI Media Production",
    description: "Generate videos from text using AI models.",
    active: true,
    items: [
      {
        label: "Story Video",
        description: "Cinematic narrative scene",
        icon: Film,
        href: "/create/story",
      },
      {
        label: "Product Video",
        description: "Short product showcase",
        icon: ShoppingBag,
        href: "/create/product",
      },
      {
        label: "Social Clip",
        description: "Punchy shareable clip",
        icon: Share2,
        href: "/create/social",
      },
    ],
  },
  editing: {
    title: "Clip & Edit",
    description: "Trim, remix, and repurpose existing footage.",
    active: false,
    items: [
      {
        label: "Trim & tighten",
        description: "Coming soon",
        icon: Scissors,
        href: "#",
      },
    ],
  },
  playground: {
    title: "AI Playground",
    description: "Experiment with the latest generative AI models.",
    active: false,
    items: [
      {
        label: "Model explorer",
        description: "Coming soon",
        icon: FlaskConical,
        href: "#",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function statusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
}

function statusLabel(status: string) {
  if (status === "done") return "Complete";
  if (status === "failed") return "Failed";
  return "In progress";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
interface RecentJob {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
}

export default function WorkspaceHome() {
  const [recents, setRecents] = useState<RecentJob[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(true);

  useEffect(() => {
    async function fetchRecents() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("jobs")
          .select("id, prompt, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (data) setRecents(data);
      } catch {
        // fail silently
      } finally {
        setLoadingRecents(false);
      }
    }
    fetchRecents();
  }, []);

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-10"
      >
        <h1 className="text-3xl font-bold tracking-tight">
          What do you want to create?
        </h1>
        <p className="mt-1 text-muted-foreground">
          Choose a workflow or start from scratch.
        </p>
      </motion.div>

      {/* Workflow families */}
      <div className="space-y-8 mb-12">
        {Object.entries(WORKFLOWS).map(([key, family], fi) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 + fi * 0.08 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {family.title}
              </h2>
              {!family.active && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Coming soon
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {family.items.map((item) => {
                const disabled = !family.active;
                const Comp = disabled ? "div" : Link;
                return (
                  <Comp
                    key={item.label}
                    {...(disabled ? {} : { href: item.href })}
                    className={`group flex items-start gap-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm transition-all duration-150 ${
                      disabled
                        ? "cursor-not-allowed opacity-40"
                        : "hover:border-primary/50 hover:bg-card"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </Comp>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick start */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
      >
        <Link
          href="/create/story"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
        >
          Start from scratch
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>

      {/* Recent projects */}
      {!loadingRecents && recents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="mt-12"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Projects
            </h2>
            <Link
              href="/projects"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="space-y-2">
            {recents.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3 transition-colors hover:bg-card"
              >
                {statusIcon(job.status)}
                <span className="flex-1 truncate text-sm">
                  {job.prompt}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {timeAgo(job.created_at)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {statusLabel(job.status)}
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
