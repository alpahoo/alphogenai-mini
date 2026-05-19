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
  Clapperboard,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Workflow families — with color coding
// ---------------------------------------------------------------------------
const WORKFLOW_ITEMS = [
  {
    label: "Story Video",
    description: "Cinematic narrative scene from text",
    icon: Film,
    href: "/create/story",
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    active: true,
  },
  {
    label: "Product Video",
    description: "Eye-catching product showcase",
    icon: ShoppingBag,
    href: "/create/product",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    active: true,
  },
  {
    label: "Social Clip",
    description: "Punchy clip for TikTok & Reels",
    icon: Share2,
    href: "/create/social",
    iconBg: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    active: true,
  },
  {
    label: "Scene Editor",
    description: "Multi-scene storyboard with drag & drop",
    icon: Clapperboard,
    href: "/create/editor",
    iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    active: true,
  },
];

const COMING_SOON_ITEMS = [
  {
    label: "Edit Your Video",
    description: "Trim & remix existing footage",
    icon: Scissors,
  },
  {
    label: "AI Playground",
    description: "Experiment with latest models",
    icon: FlaskConical,
  },
];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function statusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
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
        <p className="mt-2 text-base text-muted-foreground">
          Choose a template to start, or open the Scene Editor for full control.
        </p>
      </motion.div>

      {/* ── Active workflows ─────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Create with AI
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_ITEMS.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.08 + i * 0.05 }}
            >
              <Link
                href={item.href}
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.iconBg} mb-3 transition-transform group-hover:scale-110`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-semibold mb-0.5">{item.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Coming soon ──────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">
            Coming Soon
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMING_SOON_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex flex-col rounded-2xl border border-border/50 bg-muted/20 p-5 opacity-50 cursor-not-allowed"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground/40 mb-3">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-muted-foreground/50 mb-0.5">{item.label}</h3>
              <p className="text-sm text-muted-foreground/40 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Quick start */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
        className="mb-12"
      >
        <Link
          href="/create/story"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/30"
        >
          <Sparkles className="h-5 w-5" />
          Start from scratch
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>

      {/* ── Recent projects ──────────────────────────────────────── */}
      {!loadingRecents && recents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Projects
            </h2>
            <Link
              href="/projects"
              className="text-sm text-primary font-medium hover:underline transition-colors"
            >
              View all →
            </Link>
          </div>

          <div className="space-y-2">
            {recents.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 transition-all hover:border-primary/30 hover:shadow-sm"
              >
                {statusIcon(job.status)}
                <span className="flex-1 truncate text-sm font-medium">
                  {job.prompt}
                </span>
                <span className="hidden sm:inline text-sm text-muted-foreground">
                  {statusLabel(job.status)}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground/60">
                  <Clock className="h-3.5 w-3.5" />
                  {timeAgo(job.created_at)}
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
