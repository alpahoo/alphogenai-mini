"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
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
  List,
  Plus,
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
import { EditPostModal } from "@/components/schedule/edit-post-modal";
import type { ScheduledPost, SchedulePlatform } from "@/lib/scheduled-posts";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/scheduled-posts";

// ---------------------------------------------------------------------------
// Platform config — Postiz-inspired color coding
// ---------------------------------------------------------------------------

const PLATFORM_META: Record<
  SchedulePlatform,
  { label: string; color: string; bg: string; accent: string; icon: string }
> = {
  youtube: {
    label: "YouTube",
    color: "text-red-400",
    bg: "bg-red-500/10",
    accent: "#ef4444",
    icon: "YT",
  },
  tiktok: {
    label: "TikTok",
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    accent: "#22d3ee",
    icon: "TK",
  },
  instagram: {
    label: "Instagram",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    accent: "#d946ef",
    icon: "IG",
  },
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Platform avatar circle — Postiz-style 24px circle with accent color
// ---------------------------------------------------------------------------
function PlatformAvatar({ platform, size = 20 }: { platform: SchedulePlatform; size?: number }) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: meta.accent,
      }}
    >
      {meta.icon}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Postiz-style calendar post card (memoized for perf)
// ---------------------------------------------------------------------------
const CalendarPostCard = memo(function CalendarPostCard({
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

  const isPast =
    post.status === "published" ||
    post.status === "partially_published" ||
    post.status === "cancelled";
  const isFailed = post.status === "failed";

  // Postiz: first platform color as accent bar
  const accentColor = PLATFORM_META[post.platforms[0]]?.accent || "#6366f1";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all hover:ring-1 hover:ring-white/10 ${
        isDragging ? "opacity-0" : ""
      } ${isPast ? "grayscale opacity-60" : ""} ${
        isFailed ? "ring-2 ring-red-500/60" : ""
      }`}
      onClick={onClick}
      title={`${post.title || "Untitled"} — ${post.platforms.map((p) => PLATFORM_META[p].label).join(", ")}`}
    >
      {/* Postiz-style colored accent bar */}
      <div className="h-[3px]" style={{ backgroundColor: accentColor }} />

      <div className="bg-card/80 border border-t-0 border-border/30 px-1.5 py-1 flex items-center gap-1">
        {/* Drag handle */}
        {isDraggable && (
          <span
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 transition-opacity shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        )}

        {/* Platform avatars */}
        <div className="flex -space-x-1 shrink-0">
          {post.platforms.slice(0, 3).map((p) => (
            <PlatformAvatar key={p} platform={p} size={compact ? 16 : 18} />
          ))}
        </div>

        {/* Time + title */}
        <div className="min-w-0 flex-1 ml-0.5">
          <span className="text-[9px] text-muted-foreground block leading-tight">
            {new Date(post.scheduled_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {!compact && post.title && (
            <span className="text-[10px] font-medium truncate block leading-tight">
              {post.title}
            </span>
          )}
        </div>

        {/* Status dot */}
        {isFailed && <XCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />}
        {post.status === "publishing" && (
          <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin shrink-0" />
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Droppable day cell — Postiz-style with proper grid cells
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
      className={`min-h-[90px] border-b border-r border-border/20 p-1.5 transition-colors ${
        isToday ? "bg-primary/5" : ""
      } ${isOver ? "bg-primary/10 ring-1 ring-primary/30 ring-inset" : ""} ${
        !isCurrentMonth ? "opacity-30" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[11px] font-medium inline-flex items-center justify-center ${
            isToday
              ? "bg-primary text-primary-foreground rounded-full w-5 h-5 text-[10px] font-bold"
              : "text-muted-foreground"
          }`}
        >
          {day}
        </span>
        {posts.length > 0 && (
          <span className="text-[8px] text-muted-foreground/50 font-medium">
            {posts.length}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {posts.slice(0, 3).map((post) => (
          <CalendarPostCard
            key={post.id}
            post={post}
            compact
            onClick={() => onPostClick(post)}
          />
        ))}
        {posts.length > 3 && (
          <button className="w-full text-[9px] text-primary/60 hover:text-primary font-medium text-center py-0.5 transition-colors">
            +{posts.length - 3} more
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week view cell — taller, more detail
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

  const monthDay = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[280px] border-r border-border/20 transition-colors ${
        isToday ? "bg-primary/5" : ""
      } ${isOver ? "bg-primary/10 ring-1 ring-primary/30 ring-inset" : ""}`}
    >
      {/* Day header */}
      <div className={`px-3 py-2 border-b border-border/20 text-center ${isToday ? "bg-primary/10" : "bg-muted/20"}`}>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
          {dayName}
        </span>
        <span
          className={`text-lg font-semibold inline-flex items-center justify-center ${
            isToday
              ? "bg-primary text-primary-foreground rounded-full w-8 h-8 font-bold"
              : "text-foreground"
          }`}
        >
          {day}
        </span>
        <span className="text-[9px] text-muted-foreground block">{monthDay}</span>
      </div>

      {/* Posts */}
      <div className="p-1.5 space-y-1">
        {posts.map((post) => (
          <CalendarPostCard
            key={post.id}
            post={post}
            onClick={() => onPostClick(post)}
          />
        ))}
        {posts.length === 0 && (
          <p className="text-[9px] text-muted-foreground/30 text-center mt-8 italic">
            No posts
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post list card — Postiz-style with platform avatars and accent bar
// ---------------------------------------------------------------------------
const PostListCard = memo(function PostListCard({
  post,
  actionLoading,
  onEdit,
  onPublishNow,
  onCancel,
}: {
  post: ScheduledPost;
  actionLoading: string | null;
  onEdit: () => void;
  onPublishNow: () => void;
  onCancel: () => void;
}) {
  const isPast =
    post.status === "published" ||
    post.status === "partially_published" ||
    post.status === "cancelled";
  const accentColor = PLATFORM_META[post.platforms[0]]?.accent || "#6366f1";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`rounded-xl overflow-hidden transition-all ${
        isPast ? "grayscale opacity-60" : ""
      } ${post.status === "failed" ? "ring-2 ring-red-500/40" : ""}`}
    >
      {/* Accent bar */}
      <div className="h-[3px]" style={{ backgroundColor: accentColor }} />

      <div className="border border-t-0 border-border/40 bg-card/60 p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: platform avatars + info */}
          <div className="flex gap-3 flex-1 min-w-0">
            {/* Platform avatar stack */}
            <div className="flex flex-col items-center gap-1 pt-0.5">
              {post.platforms.map((p) => (
                <PlatformAvatar key={p} platform={p} size={28} />
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold flex items-center gap-1 ${STATUS_COLORS[post.status]}`}>
                  {post.status === "published" && <CheckCircle2 className="h-3 w-3" />}
                  {post.status === "failed" && <XCircle className="h-3 w-3" />}
                  {post.status === "scheduled" && <Clock className="h-3 w-3" />}
                  {post.status === "publishing" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {STATUS_LABELS[post.status]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(post.scheduled_at).toLocaleString()}
                </span>
              </div>

              <p className="text-sm font-medium truncate mb-1.5">
                {post.title || "Untitled post"}
              </p>

              {/* Platform result badges */}
              <div className="flex flex-wrap gap-1.5">
                {post.platforms.map((p) => {
                  const meta = PLATFORM_META[p];
                  const result = post.publish_results?.[p];
                  return (
                    <span
                      key={p}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border ${
                        result?.success
                          ? "border-green-500/30 bg-green-500/10 text-green-400"
                          : result?.error
                            ? "border-red-500/30 bg-red-500/10 text-red-400"
                            : `border-border/30 ${meta.bg} ${meta.color}`
                      }`}
                    >
                      {result?.success && <CheckCircle2 className="h-2.5 w-2.5" />}
                      {result?.error && <XCircle className="h-2.5 w-2.5" />}
                      {meta.label}
                      {result?.url && (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:brightness-125"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </span>
                  );
                })}
              </div>

              {/* Error */}
              {post.error_message && (
                <p className="mt-2 text-[10px] text-red-400 flex items-start gap-1 bg-red-500/5 rounded-lg px-2 py-1.5 border border-red-500/10">
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{post.error_message}</span>
                </p>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href={`/jobs/${post.job_id}`}
              className="rounded-lg border border-border/40 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              title="View video"
            >
              <Film className="h-3.5 w-3.5" />
            </Link>

            {(post.status === "scheduled" || post.status === "failed") && (
              <button
                onClick={onEdit}
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

            {(post.status === "scheduled" || post.status === "failed") && (
              <button
                onClick={onPublishNow}
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

            {(post.status === "scheduled" || post.status === "failed") && (
              <button
                onClick={onCancel}
                disabled={actionLoading === post.id}
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-destructive hover:brightness-125 disabled:opacity-50 transition-colors"
                title="Cancel"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // View mode — Postiz: month | week | list
  const [viewMode, setViewMode] = useState<"month" | "week" | "list">("month");

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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Post list filter
  const [listFilter, setListFilter] = useState<"all" | "scheduled" | "published" | "failed">("all");

  // Fetch posts

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
                description: `${post.platforms.map((p) => PLATFORM_META[p].label).join(", ")}`,
              });
            } else if (post.status === "failed" && prev === "publishing") {
              toast.error(`Failed: ${post.title || "Untitled"}`, {
                description: post.error_message || "Check the post for details",
              });
            } else if (post.status === "partially_published") {
              toast.warning(`Partial: ${post.title || "Untitled"}`, {
                description: post.error_message || "Some platforms failed",
              });
            }
          }
        }

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

  // Auto-refresh every 30s
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
      if (data.success) toast.success("Post cancelled");
      else toast.error(data.error || "Failed to cancel");
      await fetchPosts();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishNow = async (postId: string) => {
    if (!confirm("Publish this post now?")) return;
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/scheduled-posts/${postId}/publish-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success || data.status === "published") toast.success("Publishing started!");
      else toast.error(data.error || "Failed to publish");
      await fetchPosts();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePostClick = (post: ScheduledPost) => {
    setEditPost(post);
    setEditOpen(true);
  };

  // Drag handlers
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

    const originalDate = new Date(post.scheduled_at);
    const [year, month, day] = targetDateKey.split("-").map(Number);
    const newDate = new Date(
      year,
      month - 1,
      day,
      originalDate.getHours(),
      originalDate.getMinutes()
    );

    if (newDate.getTime() < Date.now() + 2 * 60_000) {
      toast.error("Cannot schedule in the past");
      return;
    }

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
        toast.success(
          `Moved to ${newDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
        );
      } else {
        toast.error(data.error || "Failed to move");
        await fetchPosts();
      }
    } catch {
      toast.error("Network error");
      await fetchPosts();
    }
  };

  // Calendar helpers
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0
  ).getDate();
  const firstDayOfWeek = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth(),
    1
  ).getDay();
  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

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

  const prevMonth = () =>
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
    );
  const nextMonth = () =>
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
    );
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
    setWeekStart(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    );
  };

  const todayKey = new Date().toISOString().split("T")[0];

  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const publishedPosts = posts.filter(
    (p) => p.status === "published" || p.status === "partially_published"
  );
  const failedPosts = posts.filter((p) => p.status === "failed");

  // Filtered posts for list view
  const filteredPosts =
    listFilter === "all"
      ? posts
      : listFilter === "scheduled"
        ? scheduledPosts
        : listFilter === "published"
          ? publishedPosts
          : failedPosts;

  return (
    <>
      <main className="min-h-screen overflow-y-auto bg-[#f5f3ee] px-6 py-8 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-7xl space-y-6"
        >
          {/* Header */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Publishing calendar
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Schedule</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                  Plan and schedule video publications across platforms.
                </p>
              </div>

              {/* Stats chips */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: "#3b82f6" }}
                  >
                    {scheduledPosts.length}
                  </span>
                  <span className="text-[11px] font-medium text-neutral-500">Queued</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: "#22c55e" }}
                  >
                    {publishedPosts.length}
                  </span>
                  <span className="text-[11px] font-medium text-neutral-500">Published</span>
                </div>
                {failedPosts.length > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: "#ef4444" }}
                    >
                      {failedPosts.length}
                    </span>
                    <span className="text-[11px] font-medium text-red-600">Failed</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Calendar + list view */}
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-5 py-3">
                {/* Left: nav arrows + label */}
                <div className="flex items-center gap-1.5">
                  {viewMode !== "list" && (
                    <>
                      <button
                        onClick={viewMode === "month" ? prevMonth : prevWeek}
                        className="rounded-lg p-1.5 transition-colors hover:bg-neutral-200"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <h2 className="text-sm font-semibold min-w-[200px] text-center">
                        {viewMode === "month" ? monthLabel : weekLabel}
                      </h2>
                      <button
                        onClick={viewMode === "month" ? nextMonth : nextWeek}
                        className="rounded-lg p-1.5 transition-colors hover:bg-neutral-200"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {viewMode === "list" && (
                    <h2 className="text-sm font-semibold">All Posts</h2>
                  )}
                </div>

                {/* Right: Today + view mode toggle */}
                <div className="flex items-center gap-2">
                  {viewMode !== "list" && (
                    <button
                      onClick={goToToday}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                    >
                      Today
                    </button>
                  )}

                  {/* Postiz-style view toggle */}
                  <div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white">
                    {(
                      [
                        { mode: "month" as const, icon: CalendarDays, label: "Month" },
                        { mode: "week" as const, icon: CalendarRange, label: "Week" },
                        { mode: "list" as const, icon: List, label: "List" },
                      ] as const
                    ).map(({ mode, icon: Icon, label }) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                          viewMode === mode
                            ? "bg-neutral-950 text-white"
                            : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Month view */}
              {viewMode === "month" && (
                <>
                  <div className="grid grid-cols-7 border-b border-border/30 bg-muted/10">
                    {DAYS_OF_WEEK.map((d) => (
                      <div
                        key={d}
                        className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7">
                    {Array.from({ length: firstDayOfWeek }, (_, i) => {
                      const prevMonthDays = new Date(
                        viewMonth.getFullYear(),
                        viewMonth.getMonth(),
                        0
                      ).getDate();
                      const day = prevMonthDays - firstDayOfWeek + i + 1;
                      const prevM = new Date(
                        viewMonth.getFullYear(),
                        viewMonth.getMonth() - 1,
                        day
                      );
                      const dateKey = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, "0")}-${String(prevM.getDate()).padStart(2, "0")}`;
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
                <div className="flex">
                  {weekDates.map((date, i) => {
                    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

              {/* List view — Postiz-style */}
              {viewMode === "list" && (
                <div className="p-4">
                  {/* Filter tabs */}
                  <div className="flex gap-1 mb-4 border-b border-border/30 pb-3">
                    {(
                      [
                        { key: "all" as const, label: "All", count: posts.length },
                        { key: "scheduled" as const, label: "Scheduled", count: scheduledPosts.length },
                        { key: "published" as const, label: "Published", count: publishedPosts.length },
                        { key: "failed" as const, label: "Failed", count: failedPosts.length },
                      ] as const
                    ).map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setListFilter(key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          listFilter === key
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                      >
                        {label}
                        <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
                      </button>
                    ))}
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                    </div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="py-16 text-center">
                      <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground/15 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {listFilter === "all"
                          ? "No scheduled posts yet"
                          : `No ${listFilter} posts`}
                      </p>
                      <p className="text-xs text-muted-foreground/50 mt-1">
                        Go to a completed video and use the Schedule section to plan publications.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <AnimatePresence>
                        {filteredPosts.map((post) => (
                          <PostListCard
                            key={post.id}
                            post={post}
                            actionLoading={actionLoading}
                            onEdit={() => handlePostClick(post)}
                            onPublishNow={() => handlePublishNow(post.id)}
                            onCancel={() => handleCancel(post.id)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drag overlay */}
            <DragOverlay>
              {activeDragPost && (
                <div className="rounded-lg overflow-hidden shadow-2xl shadow-black/50 border border-primary/30">
                  <div
                    className="h-[3px]"
                    style={{
                      backgroundColor:
                        PLATFORM_META[activeDragPost.platforms[0]]?.accent || "#6366f1",
                    }}
                  />
                  <div className="bg-card px-3 py-2 flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {activeDragPost.platforms.map((p) => (
                        <PlatformAvatar key={p} platform={p} size={18} />
                      ))}
                    </div>
                    <span className="text-xs font-medium">
                      {new Date(activeDragPost.scheduled_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {activeDragPost.title ? ` · ${activeDragPost.title}` : ""}
                    </span>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Post list below calendar (month/week views only) */}
          {viewMode !== "list" && (
            <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Upcoming Posts
                </h3>
                <Link
                  href="/projects"
                    className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                >
                  <Plus className="h-3 w-3" />
                  Schedule Video
                </Link>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                </div>
              ) : scheduledPosts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 py-10 text-center">
                  <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/15 mb-2" />
                  <p className="text-sm text-muted-foreground">No upcoming posts</p>
                </div>
              ) : (
                <AnimatePresence>
                  {scheduledPosts.slice(0, 5).map((post) => (
                    <PostListCard
                      key={post.id}
                      post={post}
                      actionLoading={actionLoading}
                      onEdit={() => handlePostClick(post)}
                      onPublishNow={() => handlePublishNow(post.id)}
                      onCancel={() => handleCancel(post.id)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Edit / Reschedule modal */}
      <EditPostModal
        post={editPost}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchPosts}
      />
    </>
  );
}
