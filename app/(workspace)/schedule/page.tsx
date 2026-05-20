"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  RotateCcw,
  Pencil,
  CalendarDays,
  CalendarRange,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Sidebar } from "@/components/workspace/sidebar";
import { EditPostModal } from "@/components/schedule/edit-post-modal";
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

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Draggable post chip (calendar cell)
// ---------------------------------------------------------------------------
function DraggablePostChip({
  post,
  compact,
  onClick,
}: {
  post: ScheduledPost;
  compact?: boolean;
  onClick: () => void;
}) {
  const isDraggable = post.status === "scheduled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
    disabled: !isDraggable,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const statusClass =
    post.status === "published"
      ? "bg-green-500/20 text-green-400"
      : post.status === "failed"
        ? "bg-red-500/20 text-red-400"
        : post.status === "cancelled"
          ? "bg-muted/30 text-muted-foreground"
          : "bg-blue-500/20 text-blue-400";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded px-1.5 py-0.5 text-[9px] font-medium truncate cursor-pointer hover:brightness-125 transition-all flex items-center gap-0.5 ${statusClass} ${
        isDragging ? "opacity-30" : ""
      }`}
      onClick={onClick}
      title={`${post.title || "Untitled"} — ${post.platforms.join(", ")}`}
    >
      {isDraggable && (
        <span
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-2.5 w-2.5" />
        </span>
      )}
      <span className="truncate">
        {new Date(post.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {" "}
        {post.platforms.map((p) => p[0].toUpperCase()).join("")}
        {!compact && post.title ? ` · ${post.title}` : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Droppable day cell
// ---------------------------------------------------------------------------
function DroppableDayCell({
  dateKey,
  day,
  isToday,
  isCurrentMonth,
  posts,
  onPostClick,
}: {
  dateKey: string;
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  posts: ScheduledPost[];
  onPostClick: (post: ScheduledPost) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dateKey,
    data: { dateKey },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] border-b border-r border-border/20 p-1.5 transition-colors ${
        isToday ? "bg-primary/5" : ""
      } ${isOver ? "bg-primary/10 ring-1 ring-primary/30 ring-inset" : ""} ${
        !isCurrentMonth ? "opacity-40" : ""
      }`}
    >
      <span
        className={`text-[11px] font-medium inline-flex items-center justify-center ${
          isToday
            ? "bg-primary text-primary-foreground rounded-full w-5 h-5 text-[10px] font-bold"
            : "text-muted-foreground"
        }`}
      >
        {day}
      </span>
      <div className="mt-0.5 space-y-0.5">
        {posts.slice(0, 3).map((post) => (
          <DraggablePostChip
            key={post.id}
            post={post}
            compact
            onClick={() => onPostClick(post)}
          />
        ))}
        {posts.length > 3 && (
          <span className="text-[9px] text-muted-foreground">+{posts.length - 3} more</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week view droppable cell
// ---------------------------------------------------------------------------
function WeekDayCell({
  dateKey,
  day,
  dayName,
  isToday,
  posts,
  onPostClick,
}: {
  dateKey: string;
  day: number;
  dayName: string;
  isToday: boolean;
  posts: ScheduledPost[];
  onPostClick: (post: ScheduledPost) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dateKey,
    data: { dateKey },
  });

  const monthDay = new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[200px] border-r border-border/20 p-2 transition-colors ${
        isToday ? "bg-primary/5" : ""
      } ${isOver ? "bg-primary/10 ring-1 ring-primary/30 ring-inset" : ""}`}
    >
      <div className="mb-2 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {dayName}
        </span>
        <br />
        <span
          className={`text-sm font-medium inline-flex items-center justify-center ${
            isToday
              ? "bg-primary text-primary-foreground rounded-full w-7 h-7 font-bold"
              : "text-foreground"
          }`}
        >
          {day}
        </span>
        <br />
        <span className="text-[9px] text-muted-foreground">{monthDay}</span>
      </div>
      <div className="space-y-1">
        {posts.map((post) => (
          <DraggablePostChip
            key={post.id}
            post={post}
            onClick={() => onPostClick(post)}
          />
        ))}
        {posts.length === 0 && (
          <p className="text-[9px] text-muted-foreground/40 text-center mt-4">No posts</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("free");
  const [email, setEmail] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  // Calendar state
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  });

  // Edit modal
  const [editPost, setEditPost] = useState<ScheduledPost | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Drag state
  const [activeDragPost, setActiveDragPost] = useState<ScheduledPost | null>(null);

  // Track previous statuses for notifications
  const prevStatusesRef = useRef<Record<string, string>>({});

  // DnD sensors — require 5px drag distance to distinguish from click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
      if (data.posts) {
        const newPosts: ScheduledPost[] = data.posts;

        // Detect status changes for toast notifications
        const prevStatuses = prevStatusesRef.current;
        for (const post of newPosts) {
          const prev = prevStatuses[post.id];
          if (prev && prev !== post.status) {
            if (post.status === "published") {
              toast.success(`Published: ${post.title || "Untitled"}`, {
                description: `${post.platforms.join(", ")} — ${new Date().toLocaleTimeString()}`,
              });
            } else if (post.status === "failed" && prev === "publishing") {
              toast.error(`Failed: ${post.title || "Untitled"}`, {
                description: post.error_message || "Check the post for details",
              });
            } else if (post.status === "partially_published") {
              toast.warning(`Partially published: ${post.title || "Untitled"}`, {
                description: post.error_message || "Some platforms failed",
              });
            }
          }
        }

        // Update ref
        const newStatuses: Record<string, string> = {};
        for (const p of newPosts) newStatuses[p.id] = p.status;
        prevStatusesRef.current = newStatuses;

        setPosts(newPosts);
      }
    } catch (e) {
      console.error("Failed to fetch scheduled posts:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Auto-refresh every 30s to pick up status changes
  useEffect(() => {
    const interval = setInterval(fetchPosts, 30_000);
    return () => clearInterval(interval);
  }, [fetchPosts]);

  // Actions
  const handleCancel = async (postId: string) => {
    if (!confirm("Cancel this scheduled post?")) return;
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/scheduled-posts/${postId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Post cancelled");
      } else {
        toast.error(data.error || "Failed to cancel");
      }
      await fetchPosts();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishNow = async (postId: string) => {
    if (!confirm("Publish this post now?")) return;
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/scheduled-posts/${postId}/publish-now`, { method: "POST" });
      const data = await res.json();
      if (data.success || data.status === "published") {
        toast.success("Publishing started!");
      } else {
        toast.error(data.error || "Failed to publish");
      }
      await fetchPosts();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePostClick = (post: ScheduledPost) => {
    setEditPost(post);
    setEditOpen(true);
  };

  // Drag & drop handler
  const handleDragStart = (event: DragStartEvent) => {
    const post = event.active.data.current?.post as ScheduledPost;
    if (post) setActiveDragPost(post);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragPost(null);
    const { active, over } = event;
    if (!over) return;

    const post = active.data.current?.post as ScheduledPost;
    const targetDateKey = over.data.current?.dateKey as string;

    if (!post || !targetDateKey) return;

    // Keep original time, change the date
    const originalDate = new Date(post.scheduled_at);
    const [year, month, day] = targetDateKey.split("-").map(Number);
    const newDate = new Date(year, month - 1, day, originalDate.getHours(), originalDate.getMinutes());

    // Don't move to the past
    if (newDate.getTime() < Date.now() + 2 * 60_000) {
      toast.error("Cannot schedule in the past");
      return;
    }

    // Same date — no change
    const oldKey = new Date(post.scheduled_at).toISOString().split("T")[0];
    if (oldKey === targetDateKey) return;

    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, scheduled_at: newDate.toISOString() } : p
      )
    );

    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: newDate.toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Moved to ${newDate.toLocaleDateString()}`);
      } else {
        toast.error(data.error || "Failed to move");
        await fetchPosts(); // revert
      }
    } catch {
      toast.error("Network error");
      await fetchPosts(); // revert
    }
  };

  // Calendar helpers — month view
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Week view helpers
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const postsByDate: Record<string, ScheduledPost[]> = {};
  for (const post of posts) {
    const dateKey = new Date(post.scheduled_at).toISOString().split("T")[0];
    if (!postsByDate[dateKey]) postsByDate[dateKey] = [];
    postsByDate[dateKey].push(post);
  }

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };
  const goToToday = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    const day = now.getDay();
    setWeekStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - day));
  };

  const todayKey = new Date().toISOString().split("T")[0];

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
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
              {/* Calendar header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <button
                    onClick={viewMode === "month" ? prevMonth : prevWeek}
                    className="rounded-lg p-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-sm font-semibold min-w-[180px] text-center">
                    {viewMode === "month" ? monthLabel : weekLabel}
                  </h2>
                  <button
                    onClick={viewMode === "month" ? nextMonth : nextWeek}
                    className="rounded-lg p-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={goToToday}
                    className="rounded-lg border border-border/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    Today
                  </button>
                  <div className="flex rounded-lg border border-border/40 overflow-hidden">
                    <button
                      onClick={() => setViewMode("month")}
                      className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                        viewMode === "month"
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <CalendarDays className="h-3 w-3" />
                      Month
                    </button>
                    <button
                      onClick={() => setViewMode("week")}
                      className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                        viewMode === "week"
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <CalendarRange className="h-3 w-3" />
                      Week
                    </button>
                  </div>
                </div>
              </div>

              {/* Month view */}
              {viewMode === "month" && (
                <>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 border-b border-border/30">
                    {DAYS_OF_WEEK.map((d) => (
                      <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div className="grid grid-cols-7">
                    {/* Empty cells for days before month starts */}
                    {Array.from({ length: firstDayOfWeek }, (_, i) => {
                      // Show previous month's trailing days
                      const prevMonthDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();
                      const day = prevMonthDays - firstDayOfWeek + i + 1;
                      const prevM = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, day);
                      const dateKey = prevM.toISOString().split("T")[0];
                      return (
                        <DroppableDayCell
                          key={`prev-${i}`}
                          dateKey={dateKey}
                          day={day}
                          isToday={dateKey === todayKey}
                          isCurrentMonth={false}
                          posts={postsByDate[dateKey] || []}
                          onPostClick={handlePostClick}
                        />
                      );
                    })}

                    {/* Day cells */}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dateKey = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

                      return (
                        <DroppableDayCell
                          key={day}
                          dateKey={dateKey}
                          day={day}
                          isToday={dateKey === todayKey}
                          isCurrentMonth={true}
                          posts={postsByDate[dateKey] || []}
                          onPostClick={handlePostClick}
                        />
                      );
                    })}
                  </div>
                </>
              )}

              {/* Week view */}
              {viewMode === "week" && (
                <div className="flex border-b border-border/30">
                  {weekDates.map((date, i) => {
                    const dateKey = date.toISOString().split("T")[0];
                    return (
                      <WeekDayCell
                        key={dateKey}
                        dateKey={dateKey}
                        day={date.getDate()}
                        dayName={DAYS_OF_WEEK[i]}
                        isToday={dateKey === todayKey}
                        posts={postsByDate[dateKey] || []}
                        onPostClick={handlePostClick}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Drag overlay — ghost of the dragged post */}
            <DragOverlay>
              {activeDragPost && (
                <div className="rounded-lg bg-primary/20 text-primary border border-primary/30 px-3 py-1.5 text-xs font-medium shadow-lg">
                  {new Date(activeDragPost.scheduled_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  {activeDragPost.platforms.map((p) => p[0].toUpperCase()).join("")}
                  {activeDragPost.title ? ` · ${activeDragPost.title}` : ""}
                </div>
              )}
            </DragOverlay>
          </DndContext>

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

                        {/* Edit */}
                        {(post.status === "scheduled" || post.status === "failed") && (
                          <button
                            onClick={() => handlePostClick(post)}
                            className="rounded-lg border border-border/40 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            title={post.status === "failed" ? "Reschedule" : "Edit"}
                          >
                            {post.status === "failed" ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}

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

      {/* Edit / Reschedule modal */}
      <EditPostModal
        post={editPost}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchPosts}
      />
    </div>
  );
}
