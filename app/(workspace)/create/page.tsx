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
// Workflow cards config
// ---------------------------------------------------------------------------
const PRODUCTION_CARDS = [
  {
    id: "story",
    title: "Story Video",
    description: "Turn a narrative into a cinematic AI-generated scene",
    icon: Film,
  },
  {
    id: "product",
    title: "Product Video",
    description: "Create a short, eye-catching product showcase",
    icon: ShoppingBag,
  },
  {
    id: "social",
    title: "Social Clip",
    description: "Generate a punchy clip for social media",
    icon: Share2,
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
  if (s === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (s === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
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
        <p className="mt-1 text-muted-foreground">
          Start with AI or edit your own content.
        </p>
      </motion.div>

      {/* ── AI Media Production (PRIMARY) ────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-8"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Media Production
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PRODUCTION_CARDS.map((card) => (
            <Link
              key={card.id}
              href={`/create/${card.id}`}
              className="group relative flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/80 p-5 backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{card.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {card.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* ── Clip & Edit (COMING SOON) ────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Clip & Edit
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Coming soon
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-2xl border border-border/30 bg-card/40 p-5 opacity-40 cursor-not-allowed">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50">
              <Scissors className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground/60">
                Edit your own video
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground/40">
                Trim, remix, and repurpose existing footage
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── AI Playground (COMING SOON) ──────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            AI Playground
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Coming soon
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-2xl border border-border/30 bg-card/40 p-5 opacity-40 cursor-not-allowed">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50">
              <FlaskConical className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground/60">
                Generate clips, images, music
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground/40">
                Experiment with the latest AI models
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <Link
          href="/create/story"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          Start from scratch
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </motion.div>

      {/* ── Recent projects ──────────────────────────────────────── */}
      {recents.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="mt-12"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Projects
            </h2>
            <Link
              href="/projects"
              className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="space-y-1.5">
            {recents.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 transition-colors hover:bg-card"
              >
                {statusIcon(job.status)}
                <span className="flex-1 truncate text-sm">{job.prompt}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                  <Clock className="h-3 w-3" />
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
