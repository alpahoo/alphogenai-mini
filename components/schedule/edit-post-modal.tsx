"use client";

import { useState } from "react";
import { Loader2, CalendarClock, Save, RotateCcw } from "lucide-react";
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
// Platform config
// ---------------------------------------------------------------------------
const PLATFORMS: { value: SchedulePlatform; label: string; color: string }[] = [
  { value: "youtube", label: "YouTube", color: "bg-red-500/10 text-red-400 border-red-500/30" },
  { value: "tiktok", label: "TikTok", color: "bg-white/5 text-white/70 border-white/20" },
  { value: "instagram", label: "Instagram", color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
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

export function EditPostModal({ post, open, onOpenChange, onSaved }: EditPostModalProps) {
  const [saving, setSaving] = useState(false);

  // Form state — initialized when post changes
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
    // Convert ISO to datetime-local format
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
              : "Update the details of your scheduled post."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Video title..."
              maxLength={200}
              className="w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Video description..."
              rows={2}
              className="w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Date/Time */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Platforms */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Platforms
            </label>
            <div className="flex gap-2">
              {PLATFORMS.map((p) => {
                const active = platforms.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePlatform(p.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? p.color
                        : "border-border/30 text-muted-foreground/50 hover:border-border/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Privacy — YouTube */}
          {platforms.includes("youtube") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                YouTube Privacy
              </label>
              <select
                value={privacyYoutube}
                onChange={(e) => setPrivacyYoutube(e.target.value)}
                className="w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          )}

          {/* Privacy — TikTok */}
          {platforms.includes("tiktok") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                TikTok Privacy
              </label>
              <select
                value={privacyTiktok}
                onChange={(e) => setPrivacyTiktok(e.target.value)}
                className="w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="PUBLIC_TO_EVERYONE">Public</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                <option value="SELF_ONLY">Only Me</option>
              </select>
            </div>
          )}

          {/* Error message for failed posts */}
          {isReschedule && post.error_message && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="text-[11px] font-medium text-red-400 mb-0.5">Previous error:</p>
              <p className="text-[11px] text-red-400/80">{post.error_message}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
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
      </DialogContent>
    </Dialog>
  );
}
