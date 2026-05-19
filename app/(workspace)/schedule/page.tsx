"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  Loader2,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
} from "lucide-react";
import Link from "next/link";
import { Sidebar } from "@/components/workspace/sidebar";
import { createClient } from "@/lib/supabase/client";
import type { ScheduledPost, SchedulePlatform } from "@/lib/scheduled-posts";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/scheduled-posts";

// ---------------------------------------------------------------------------
// Platform icons / labels
// ---------------------------------------------------------------------------

const PLATFORM_META: Record<SchedulePlatform, { label: string; color: string; bg: string }> = {
  youtube: { label: "YouTube", color: "text-red-400", bg: "bg-red-500/10" },
  tiktok: { label: "TikTok", color: "text-white/70", bg: "bg-white/5" },
  instagram: { label: "Instagram", color: "text-purple-400", bg: "bg-purple-500/10" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("free");
  const [email, setEmail] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Calendar state
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Fetch user + posts
  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user?.email) setEmail(user.email);
      const { data: profile } = await sb
        .from("profiles")
        .select("plan")
        .eq("id", user?.id ?? "")
        .single();
      if (profile?.plan) setPlan(profile.plan);
    }
    init();
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduled-posts");
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (e) {
      console.error("Failed to fetch scheduled posts:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Actions
  const handleCancel = async (postId: string) => {
    if (!confirm("Cancel this scheduled post?")) return;
    setActionLoading(postId);
    try {
      await fetch(`/api/scheduled-posts/${postId}`, { method: "DELETE" });
      await fetchPosts();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishNow = async (postId: string) => {
    if (!confirm("Publish this post now?")) return;
    setActionLoading(postId);
    try {
      await fetch(`/api/scheduled-posts/${postId}/publish-now`, { method: "POST" });
      await fetchPosts();
    } finally {
      setActionLoading(null);
    }
  };

  // Calendar helpers
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const postsByDate: Record<string, ScheduledPost[]> = {};
  for (const post of posts) {
    const dateKey = new Date(post.scheduled_at).toISOString().split("T")[0];
    if (!postsByDate[dateKey]) postsByDate[dateKey] = [];
    postsByDate[dateKey].push(post);
  }

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const publishedPosts = posts.filter((p) => p.status === "published" || p.status === "partially_published");
  const failedPosts = posts.filter((p) => p.status === "failed");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar plan={plan} email={email} />

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto space-y-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                  <CalendarClock className="h-5 w-5 text-blue-400" />
                </div>
                <h1 className="text-2xl font-bold">Scheduled Posts</h1>
              </div>
              <p className="text-sm text-muted-foreground ml-[52px]">
                Plan and schedule your video publications across platforms.
              </p>
            </div>
            {/* Stats */}
            <div className="flex gap-4 text-center">
              <div className="rounded-xl border border-border/40 bg-card/60 px-4 py-2">
                <p className="text-lg font-bold text-blue-400">{scheduledPosts.length}</p>
                <p className="text-[10px] text-muted-foreground">Scheduled</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 px-4 py-2">
                <p className="text-lg font-bold text-green-400">{publishedPosts.length}</p>
                <p className="text-[10px] text-muted-foreground">Published</p>
              </div>
              {failedPosts.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-card/60 px-4 py-2">
                  <p className="text-lg font-bold text-red-400">{failedPosts.length}</p>
                  <p className="text-[10px] text-muted-foreground">Failed</p>
                </div>
              )}
            </div>
          </div>

          {/* Calendar */}
          <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
            {/* Calendar header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
              <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-muted/40 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-sm font-semibold">{monthLabel}</h2>
              <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-muted/40 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border/30">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: firstDayOfWeek }, (_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border/20 bg-muted/5" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateKey = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayPosts = postsByDate[dateKey] || [];
                const isToday = dateKey === new Date().toISOString().split("T")[0];

                return (
                  <div
                    key={day}
                    className={`min-h-[80px] border-b border-r border-border/20 p-1.5 ${isToday ? "bg-primary/5" : ""}`}
                  >
                    <span className={`text-[11px] font-medium ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayPosts.slice(0, 3).map((post) => (
                        <div
                          key={post.id}
                          className={`rounded px-1 py-0.5 text-[9px] font-medium truncate cursor-pointer hover:brightness-125 ${
                            post.status === "published"
                              ? "bg-green-500/20 text-green-400"
                              : post.status === "failed"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-blue-500/20 text-blue-400"
                          }`}
                          title={`${post.title || "Untitled"} — ${post.platforms.join(", ")}`}
                        >
                          {new Date(post.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" "}
                          {post.platforms.map((p) => p[0].toUpperCase()).join("")}
                        </div>
                      ))}
                      {dayPosts.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{dayPosts.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Post list */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              All Scheduled Posts
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/40 bg-card/30 py-12 text-center">
                <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No scheduled posts yet</p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Go to a completed video and use the Schedule section to plan publications.
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {posts.map((post) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-border/40 bg-card/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-xs font-semibold ${STATUS_COLORS[post.status]}`}>
                            {post.status === "published" && <CheckCircle2 className="inline h-3 w-3 mr-0.5" />}
                            {post.status === "failed" && <XCircle className="inline h-3 w-3 mr-0.5" />}
                            {post.status === "scheduled" && <Clock className="inline h-3 w-3 mr-0.5" />}
                            {post.status === "publishing" && <Loader2 className="inline h-3 w-3 mr-0.5 animate-spin" />}
                            {STATUS_LABELS[post.status]}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(post.scheduled_at).toLocaleString()}
                          </span>
                        </div>

                        <p className="text-sm font-medium truncate">
                          {post.title || "Untitled post"}
                        </p>

                        {/* Platforms */}
                        <div className="flex gap-1.5 mt-2">
                          {post.platforms.map((p) => {
                            const meta = PLATFORM_META[p];
                            const result = post.publish_results?.[p];
                            return (
                              <span
                                key={p}
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${meta.bg} ${
                                  result?.success ? "text-green-400" : result?.error ? "text-red-400" : meta.color
                                }`}
                              >
                                {result?.success && <CheckCircle2 className="h-2.5 w-2.5" />}
                                {result?.error && <XCircle className="h-2.5 w-2.5" />}
                                {meta.label}
                                {result?.url && (
                                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="hover:brightness-125">
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </span>
                            );
                          })}
                        </div>

                        {/* Error */}
                        {post.error_message && (
                          <p className="mt-1.5 text-[10px] text-red-400 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                            {post.error_message}
                          </p>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* View job */}
                        <Link
                          href={`/jobs/${post.job_id}`}
                          className="rounded-lg border border-border/40 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                          title="View video"
                        >
                          <Film className="h-3.5 w-3.5" />
                        </Link>

                        {/* Publish now */}
                        {(post.status === "scheduled" || post.status === "failed") && (
                          <button
                            onClick={() => handlePublishNow(post.id)}
                            disabled={actionLoading === post.id}
                            className="rounded-lg border border-green-500/30 bg-green-500/10 p-2 text-green-400 hover:brightness-125 disabled:opacity-50 transition-colors"
                            title="Publish now"
                          >
                            {actionLoading === post.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}

                        {/* Cancel */}
                        {(post.status === "scheduled" || post.status === "failed") && (
                          <button
                            onClick={() => handleCancel(post.id)}
                            disabled={actionLoading === post.id}
                            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-destructive hover:brightness-125 disabled:opacity-50 transition-colors"
                            title="Cancel"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
