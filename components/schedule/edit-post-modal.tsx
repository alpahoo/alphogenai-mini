"use client";

import { useState } from "react";
import {
  Loader2,
  CalendarClock,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ScheduledPost, SchedulePlatform } from "@/lib/scheduled-posts";

// ---------------------------------------------------------------------------
// Platform config — Postiz-inspired colored avatars
// ---------------------------------------------------------------------------
const PLATFORMS: {
  value: SchedulePlatform;
  label: string;
  accent: string;
  icon: string;
}[] = [
  { value: "youtube", label: "YouTube", accent: "#ef4444", icon: "YT" },
  { value: "tiktok", label: "TikTok", accent: "#22d3ee", icon: "TK" },
  { value: "instagram", label: "Instagram", accent: "#d946ef", icon: "IG" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface EditPostModalProps {
  post: ScheduledPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditPostModal({
  post,
  open,
  onOpenChange,
  onSaved,
}: EditPostModalProps) {
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [platforms, setPlatforms] = useState<SchedulePlatform[]>([]);
  const [privacyYoutube, setPrivacyYoutube] = useState("unlisted");
  const [privacyTiktok, setPrivacyTiktok] = useState("PUBLIC_TO_EVERYONE");

  // Sync form when post changes
  const [lastPostId, setLastPostId] = useState<string | null>(null);
  if (post && post.id !== lastPostId) {
    setLastPostId(post.id);
    setTitle(post.title || "");
    setDescription(post.description || "");
    const dt = new Date(post.scheduled_at);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledAt(local);
    setPlatforms([...post.platforms]);
    setPrivacyYoutube(post.privacy_youtube || "unlisted");
    setPrivacyTiktok(post.privacy_tiktok || "PUBLIC_TO_EVERYONE");
  }

  const isReschedule = post?.status === "failed";
  const canEdit = post?.status === "scheduled" || post?.status === "failed";

  const togglePlatform = (p: SchedulePlatform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleSave = async () => {
    if (!post || !canEdit) return;
    if (platforms.length === 0) {
      toast.error("Select at least one platform");
      return;
    }
    if (!scheduledAt) {
      toast.error("Pick a date and time");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || null,
          description: description || null,
          scheduled_at: new Date(scheduledAt).toISOString(),
          platforms,
          privacy_youtube: privacyYoutube,
          privacy_tiktok: privacyTiktok,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(isReschedule ? "Post rescheduled!" : "Post updated!");
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(data.error || "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (!post) return null;

  // Status info for read-only posts
  const isReadOnly = !canEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReschedule ? (
              <>
                <RotateCcw className="h-4 w-4 text-amber-400" />
                Reschedule Post
              </>
            ) : isReadOnly ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                Post Details
              </>
            ) : (
              <>
                <CalendarClock className="h-4 w-4 text-blue-400" />
                Edit Scheduled Post
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isReschedule
              ? "Pick a new date/time to retry this post."
              : isReadOnly
                ? `This post was ${post.status}.`
                : "Update the details of your scheduled post."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status bar for non-editable posts */}
          {isReadOnly && (
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
              {post.status === "published" && (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              )}
              {post.status === "cancelled" && (
                <XCircle className="h-4 w-4 text-muted-foreground" />
              )}
              {post.status === "publishing" && (
                <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
              )}
              <div>
                <p className="text-sm font-medium">{post.title || "Untitled"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(post.scheduled_at).toLocaleString()} ·{" "}
                  {post.platforms.map((p) => PLATFORMS.find((x) => x.value === p)?.label).join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Title */}
          {canEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title..."
                maxLength={200}
                className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          )}

          {/* Description */}
          {canEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Video description..."
                rows={3}
                className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
              />
            </div>
          )}

          {/* Date/Time */}
          {canEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          )}

          {/* Platforms — Postiz-style avatar circles */}
          {canEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Platforms
              </label>
              <div className="flex gap-3">
                {PLATFORMS.map((p) => {
                  const active = platforms.includes(p.value);
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => togglePlatform(p.value)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 ${
                        active
                          ? "border-white/20 bg-white/5 opacity-100"
                          : "border-border/30 bg-transparent opacity-40 hover:opacity-70"
                      }`}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
                        style={{
                          width: 28,
                          height: 28,
                          fontSize: 11,
                          backgroundColor: p.accent,
                        }}
                      >
                        {p.icon}
                      </span>
                      <span className="text-xs font-medium">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Privacy — YouTube */}
          {canEdit && platforms.includes("youtube") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                YouTube Privacy
              </label>
              <select
                value={privacyYoutube}
                onChange={(e) => setPrivacyYoutube(e.target.value)}
                className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          )}

          {/* Privacy — TikTok */}
          {canEdit && platforms.includes("tiktok") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                TikTok Privacy
              </label>
              <select
                value={privacyTiktok}
                onChange={(e) => setPrivacyTiktok(e.target.value)}
                className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              >
                <option value="PUBLIC_TO_EVERYONE">Public</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                <option value="SELF_ONLY">Only Me</option>
              </select>
            </div>
          )}

          {/* Error for failed posts */}
          {isReschedule && post.error_message && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                <p className="text-[11px] font-semibold text-red-400">
                  Previous error
                </p>
              </div>
              <p className="text-[11px] text-red-400/70 leading-relaxed">
                {post.error_message}
              </p>
            </div>
          )}

          {/* Publish results for read-only view */}
          {isReadOnly && post.publish_results && Object.keys(post.publish_results).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Results</p>
              {Object.entries(post.publish_results).map(([platform, result]) => {
                const meta = PLATFORMS.find((p) => p.value === platform);
                return (
                  <div
                    key={platform}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                      result.success
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-red-500/20 bg-red-500/5"
                    }`}
                  >
                    <span
                      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
                      style={{
                        width: 24,
                        height: 24,
                        fontSize: 9,
                        backgroundColor: meta?.accent || "#6366f1",
                      }}
                    >
                      {meta?.icon || "?"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{meta?.label || platform}</p>
                      {result.error && (
                        <p className="text-[10px] text-red-400 truncate">{result.error}</p>
                      )}
                    </div>
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {canEdit && (
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-border/40 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canEdit}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isReschedule ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isReschedule ? "Reschedule" : "Save Changes"}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
