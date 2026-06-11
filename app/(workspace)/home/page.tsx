"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  Clock,
  Film,
  ImagePlus,
  Library,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Wand2,
  XCircle,
  SearchCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface RecentJob {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
}

const PRIMARY_ACTIONS = [
  {
    label: "Create with Director",
    description: "Plan scenes before generation",
    href: "/create/story",
    icon: Clapperboard,
    tone: "text-primary bg-primary/10",
  },
  {
    label: "Research a video",
    description: "Build a sourced plan",
    href: "/research",
    icon: SearchCheck,
    tone: "text-emerald-500 bg-emerald-500/10",
  },
  {
    label: "Use a reference",
    description: "Start from a previous result",
    href: "/library",
    icon: ImagePlus,
    tone: "text-violet-500 bg-violet-500/10",
  },
  {
    label: "Open Studio",
    description: "Export, duplicate, schedule",
    href: "/projects",
    icon: Film,
    tone: "text-blue-500 bg-blue-500/10",
  },
];

const PIPELINE_ITEMS = [
  {
    label: "Director Console",
    value: "Scene plan",
    href: "/create/story",
    icon: Wand2,
    tone: "text-primary bg-primary/10",
  },
  {
    label: "Asset Library",
    value: "References",
    href: "/library",
    icon: Library,
    tone: "text-emerald-500 bg-emerald-500/10",
  },
  {
    label: "Analytics",
    value: "Performance",
    href: "/analytics",
    icon: BarChart3,
    tone: "text-blue-500 bg-blue-500/10",
  },
  {
    label: "Schedule",
    value: "Publishing",
    href: "/schedule",
    icon: CalendarClock,
    tone: "text-amber-500 bg-amber-500/10",
  },
];

const STARTERS = [
  {
    label: "Story Video",
    description: "Cinematic narrative scene",
    href: "/create/story",
    icon: Film,
  },
  {
    label: "Product Video",
    description: "Product-focused showcase",
    href: "/create/product",
    icon: Plus,
  },
  {
    label: "Social Clip",
    description: "Short vertical concept",
    href: "/create/social",
    icon: Play,
  },
  {
    label: "Scene Editor",
    description: "Storyboard control",
    href: "/create/editor",
    icon: Clapperboard,
  },
];

function statusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
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
          .limit(8);

        if (data) setRecents(data);
      } catch {
        // Dashboard stays useful even if recents fail to load.
      } finally {
        setLoadingRecents(false);
      }
    }

    fetchRecents();
  }, []);

  const stats = useMemo(() => {
    const complete = recents.filter((job) => job.status === "done").length;
    const failed = recents.filter((job) => job.status === "failed").length;
    const active = recents.length - complete - failed;
    return [
      { label: "Recent", value: recents.length.toString(), hint: "projects" },
      { label: "Complete", value: complete.toString(), hint: "ready" },
      { label: "Active", value: active.toString(), hint: "running" },
      { label: "Failed", value: failed.toString(), hint: "needs review" },
    ];
  }, [recents]);

  const latest = recents[0];

  return (
    <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"
      >
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                <Sparkles className="h-3.5 w-3.5" />
                Command Center
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 lg:text-5xl">
                Direct the next video from one workspace
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600">
                Plan the scene, reuse assets, create a finished project, then package it for publishing.
              </p>
            </div>

            <Link
              href="/create/story"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800"
            >
              <Clapperboard className="h-4 w-4" />
              New director project
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {PRIMARY_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 transition-all hover:border-neutral-300 hover:bg-white hover:shadow-sm"
              >
                <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${action.tone}`}>
                  <action.icon className="h-5 w-5" />
                </span>
                <span className="block text-sm font-semibold text-neutral-950">{action.label}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-600">{action.description}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-950">Production pulse</h2>
              <p className="mt-1 text-xs text-neutral-500">Latest workspace activity</p>
            </div>
            <Clock className="h-4 w-4 text-neutral-400" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{item.label}</span>
                <span className="mt-1 block text-2xl font-semibold text-neutral-950">{item.value}</span>
                <span className="text-xs text-neutral-500">{item.hint}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
            <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Latest</span>
            {latest ? (
              <Link href={`/jobs/${latest.id}`} className="mt-1 block">
                <span className="line-clamp-2 text-sm font-semibold text-neutral-950">{latest.prompt}</span>
                <span className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                  {statusIcon(latest.status)}
                  {statusLabel(latest.status)} · {timeAgo(latest.created_at)}
                </span>
              </Link>
            ) : (
              <p className="mt-1 text-sm text-neutral-500">No project yet</p>
            )}
          </div>
        </section>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mt-8"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Workspace pipeline
          </h2>
          <Link href="/projects" className="text-sm font-semibold text-neutral-950 hover:underline">
            All projects
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-950">{item.label}</span>
                <span className="block truncate text-xs text-neutral-500">{item.value}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-950" />
            </Link>
          ))}
        </div>
      </motion.section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Start from
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {STARTERS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:border-neutral-300 hover:bg-white hover:shadow-md"
              >
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 transition-colors group-hover:bg-neutral-950 group-hover:text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="block text-sm font-semibold text-neutral-950">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-600">{item.description}</span>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Recent projects
            </h2>
            <Link href="/projects" className="text-sm font-semibold text-neutral-950 hover:underline">
              View all
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            {loadingRecents ? (
              <div className="flex items-center gap-2 px-4 py-5 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects
              </div>
            ) : recents.length > 0 ? (
              <div className="divide-y divide-neutral-200">
                {recents.slice(0, 6).map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
                  >
                    {statusIcon(job.status)}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-950">{job.prompt}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{statusLabel(job.status)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Clock className="h-3.5 w-3.5" />
                      {timeAgo(job.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-neutral-950">No projects yet</p>
                <Link href="/create/story" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-neutral-950">
                  Create the first one
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </motion.section>
      </div>
      </div>
    </div>
  );
}
