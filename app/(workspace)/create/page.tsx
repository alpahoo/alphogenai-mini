"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Film,
  ShoppingBag,
  Share2,
  Scissors,
  Clapperboard,
  FlaskConical,
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
// Workflow cards config — with color coding
// ---------------------------------------------------------------------------
const PRODUCTION_CARDS = [
  {
    id: "story",
    title: "Story Video",
    description: "Turn a narrative into a cinematic AI-generated scene. Perfect for trailers, intros, and creative storytelling.",
    icon: Film,
    color: "from-blue-500 to-indigo-600",
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    badge: null,
  },
  {
    id: "product",
    title: "Product Video",
    description: "Create a short, eye-catching product showcase. Ideal for e-commerce listings and ads.",
    icon: ShoppingBag,
    color: "from-emerald-500 to-teal-600",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    badge: null,
  },
  {
    id: "social",
    title: "Social Clip",
    description: "Generate a punchy clip for TikTok, Reels, or YouTube Shorts. Ready to post in minutes.",
    icon: Share2,
    color: "from-pink-500 to-rose-600",
    iconBg: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    badge: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface RecentJob {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
}

function statusIcon(s: string) {
  if (s === "done") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (s === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
}

function statusLabel(s: string) {
  if (s === "done") return "Complete";
  if (s === "failed") return "Failed";
  return "In progress";
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CreateHub() {
  const [recents, setRecents] = useState<RecentJob[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("jobs")
          .select("id, prompt, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(4);
        if (data) setRecents(data);
      } catch { /* silent */ }
    }
    load();
  }, []);

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-10"
      >
        <h1 className="text-3xl font-bold tracking-tight">
          What do you want to create?
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Choose a template to get started, or build your own from scratch.
        </p>
      </motion.div>

      {/* ── AI Video Production ─────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            AI Video Production
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {PRODUCTION_CARDS.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
            >
              <Link
                href={`/create/${card.id}`}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
              >
                {/* Gradient accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${card.color} opacity-0 group-hover:opacity-100 transition-opacity`} />

                {/* Icon */}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg} mb-4 transition-transform group-hover:scale-110`}>
                  <card.icon className="h-6 w-6" />
                </div>

                {/* Content */}
                <h3 className="text-base font-semibold mb-1.5">{card.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {card.description}
                </p>

                {/* Arrow */}
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Get started <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Scene Editor (featured tool) ────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-4">
          <Clapperboard className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Advanced Tools
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Scene Editor — live */}
          <Link
            href="/create/editor"
            className="group relative flex items-start gap-5 rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
          >
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-violet-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 transition-transform group-hover:scale-110">
              <Clapperboard className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold mb-1">Scene Editor</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Build a multi-scene storyboard with drag & drop. Customize each scene, then generate all at once.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Open editor <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>

          {/* Edit video — coming soon */}
          <div className="relative flex items-start gap-5 rounded-2xl border border-border/60 bg-muted/30 p-6 opacity-60 cursor-not-allowed">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground/50">
              <Scissors className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-semibold text-muted-foreground/60">
                  Edit Your Own Video
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground/60">
                  <Lock className="h-3 w-3" /> Coming Soon
                </span>
              </div>
              <p className="text-sm text-muted-foreground/40 leading-relaxed">
                Trim, remix, and repurpose existing footage with AI assistance.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── AI Playground (coming soon) ─────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="h-4 w-4 text-muted-foreground/50" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">
            AI Playground
          </h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground/50">
            Coming Soon
          </span>
        </div>
        <div className="relative flex items-start gap-5 rounded-2xl border border-border/60 bg-muted/30 p-6 opacity-50 cursor-not-allowed max-w-md">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground/40">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-muted-foreground/50 mb-1">
              Model Explorer
            </h3>
            <p className="text-sm text-muted-foreground/40 leading-relaxed">
              Experiment with the latest AI models — generate clips, images, and music.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Quick start CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
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

      {/* ── Recent projects ────────────────────────────────────── */}
      {recents.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
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
                <span className="flex-1 truncate text-sm font-medium">{job.prompt}</span>
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
        </motion.section>
      )}
    </div>
  );
}
