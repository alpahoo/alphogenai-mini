"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Download,
  Edit2,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Library,
  Music,
  Play,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isJobFavorite } from "@/lib/job-favorite";

interface VideoAsset {
  id: string;
  prompt: string;
  output_url_final: string;
  created_at: string;
  target_duration_seconds: number | null;
  social_exports: Record<string, string> | null;
  app_state: Record<string, unknown> | null;
}

interface SavedLook {
  id: string;
  name: string;
  video_url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  created_at: string;
}

type FilterKey = "all" | "favorites" | "reference" | "social";

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

function hasSocialPack(asset: VideoAsset) {
  const exports = asset.social_exports ?? {};
  return Boolean(exports.tiktok || exports.instagram || exports.youtube || exports.thumbnail);
}

export default function LibraryPage() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [looks, setLooks] = useState<SavedLook[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [lookToDelete, setLookToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("jobs")
          .select("id, prompt, output_url_final, created_at, target_duration_seconds, social_exports, app_state")
          .eq("user_id", user.id)
          .eq("status", "done")
          .not("output_url_final", "is", null)
          .order("created_at", { ascending: false })
          .limit(48);

        if (data) setVideos(data as VideoAsset[]);

        const looksRes = await fetch("/api/looks");
        if (looksRes.ok) {
          const looksData = await looksRes.json();
          if (Array.isArray(looksData.looks)) setLooks(looksData.looks as SavedLook[]);
        }
      } catch {
        // Keep the asset studio usable even when the library query fails.
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleStartRename = (look: SavedLook) => {
    setSelectedLookId(look.id);
    setNewName(look.name);
    setRenameModalOpen(true);
  };

  const handleSaveRename = async () => {
    if (!selectedLookId || !newName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/looks/${selectedLookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to rename look");
      }
      setLooks((prev) =>
        prev.map((l) => (l.id === selectedLookId ? { ...l, name: newName.trim() } : l))
      );
      setRenameModalOpen(false);
      setSelectedLookId(null);
      setNewName("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      console.error("Rename failed:", msg);
      alert(`Failed to rename: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartDelete = (lookId: string) => {
    setLookToDelete(lookId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!lookToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/looks/${lookToDelete}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete look");
      }
      setLooks((prev) => prev.filter((l) => l.id !== lookToDelete));
      setDeleteConfirmOpen(false);
      setLookToDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      console.error("Delete failed:", msg);
      alert(`Failed to delete: ${msg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((asset) => {
      const matchesQuery = !q || asset.prompt.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "favorites" && isJobFavorite(asset.app_state)) ||
        filter === "reference" ||
        (filter === "social" && hasSocialPack(asset));
      return matchesQuery && matchesFilter;
    });
  }, [videos, query, filter]);

  const stats = useMemo(
    () => [
      { label: "Videos", value: videos.length.toString() },
      { label: "Favorites", value: videos.filter((asset) => isJobFavorite(asset.app_state)).length.toString() },
      { label: "Saved Looks", value: looks.length.toString() },
      { label: "Reference-ready", value: videos.length.toString() },
    ],
    [videos, looks],
  );

  return (
    <div className="min-h-screen bg-[#f5f3ee] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              <Library className="h-3.5 w-3.5" />
              Asset Studio
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Library</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Reuse finished videos as references, reopen the studio, download masters, or prepare social cuts.
            </p>
          </div>

          <Link
            href="/create/story"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800"
          >
            <Sparkles className="h-4 w-4" />
            Create new asset
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{item.label}</span>
              <span className="mt-1 block text-2xl font-semibold text-neutral-950">{item.value}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
              <Clapperboard className="h-3.5 w-3.5" />
              Saved Looks
            </div>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">Reusable shots</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">
              Keep a shot you already like, then apply a fresh script and voice without rebuilding the visual from scratch.
            </p>
          </div>
          <Link
            href="/create/avatar"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            Open avatar studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-video animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        ) : looks.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-5 py-6">
            <p className="text-sm font-semibold text-neutral-950">No saved looks yet</p>
            <p className="mt-1 text-sm text-neutral-600">
              Save a completed cinematic avatar shot as a Look, then it will appear here for fast reuse.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {looks.map((look) => (
              <article
                key={look.id}
                className="group overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
              >
                <div className="relative aspect-video overflow-hidden bg-muted/30">
                  {look.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={look.thumbnail_url} alt={look.name} className="h-full w-full object-cover" />
                  ) : (
                    <video
                      src={look.video_url}
                      className="h-full w-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                    />
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-cyan-500/90 px-2 py-1 text-[10px] font-bold text-white">
                    Look
                  </span>
                  {look.duration_sec && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {look.duration_sec}s
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-end justify-center gap-2 bg-black/0 transition-all group-hover:bg-black/40 p-3">
                    <button
                      onClick={() => handleStartRename(look)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleStartDelete(look.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300/50 bg-red-500/20 backdrop-blur-sm px-2.5 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">
                      {look.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(look.created_at)}</p>
                  </div>
                  <Link
                    href={`/create/avatar?look_id=${look.id}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-neutral-800"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Create with look
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative lg:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search generated assets..."
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-950 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All videos" },
              { id: "favorites", label: "Favorites" },
              { id: "reference", label: "Use as reference" },
              { id: "social", label: "Social-ready" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id as FilterKey)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  filter === item.id
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-950"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted/30" />
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white py-16">
            <Film className="mb-3 h-8 w-8 text-muted-foreground/25" />
            <p className="text-sm font-semibold text-foreground">
              {videos.length === 0 ? "No finished videos yet" : "No assets match this view"}
            </p>
            <Link href="/create/story" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Create with Director
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filteredVideos.map((asset, i) => {
              const thumbnail = asset.social_exports?.thumbnail ?? null;
              const favorite = isJobFavorite(asset.app_state);
              return (
                <motion.article
                  key={asset.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.025, 0.2) }}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                >
                  <Link href={`/jobs/${asset.id}`} className="group block">
                    <div className="relative aspect-video overflow-hidden bg-muted/30">
                      {thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbnail} alt={asset.prompt} className="h-full w-full object-cover" />
                      ) : (
                        <video
                          src={asset.output_url_final}
                          className="h-full w-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                        />
                      )}

                      <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                          <Play className="h-5 w-5 fill-white text-white" />
                        </div>
                      </div>

                      <div className="absolute left-2 top-2 flex gap-1.5">
                        <span className="rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                          Video
                        </span>
                        {favorite && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1 text-[10px] font-semibold text-neutral-950">
                            <Star className="h-3 w-3 fill-current" />
                            Favorite
                          </span>
                        )}
                        {hasSocialPack(asset) && (
                          <span className="rounded-full bg-emerald-500/85 px-2 py-1 text-[10px] font-semibold text-white">
                            Social pack
                          </span>
                        )}
                      </div>

                      {asset.target_duration_seconds && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {asset.target_duration_seconds}s
                        </span>
                      )}
                    </div>
                  </Link>

                  <div className="space-y-3 p-3">
                    <div>
                      <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">
                        {asset.prompt}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        {timeAgo(asset.created_at)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/create/story?reference_job_id=${asset.id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Reference
                      </Link>
                      <Link
                        href={`/jobs/${asset.id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
                      >
                        <Film className="h-3.5 w-3.5" />
                        Studio
                      </Link>
                      <a
                        href={asset.output_url_final}
                        download
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Master
                      </a>
                      <Link
                        href={`/jobs/${asset.id}#social`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Social
                      </Link>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6">
          <ImageIcon className="mb-3 h-6 w-6 text-muted-foreground/30" />
          <h2 className="text-sm font-bold text-foreground">Images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated stills and saved references will appear here as the image pipeline expands.
          </p>
        </section>

        <section className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6">
          <Music className="mb-3 h-6 w-6 text-muted-foreground/30" />
          <h2 className="text-sm font-bold text-foreground">Music</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Voice-over and soundtrack assets stay attached to their projects for now.
          </p>
        </section>
      </div>

      {renameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-6 shadow-lg sm:w-96">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-950">Rename Look</h3>
              <button
                onClick={() => setRenameModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Look name</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.slice(0, 100))}
                  maxLength={100}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-950 outline-none focus:border-neutral-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) handleSaveRename();
                    if (e.key === "Escape") setRenameModalOpen(false);
                  }}
                  autoFocus
                />
                <p className="mt-1 text-xs text-muted-foreground">{newName.length}/100</p>
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setRenameModalOpen(false)}
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                disabled={!newName.trim() || isSaving}
                className="flex-1 rounded-lg bg-neutral-950 px-3 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-6 shadow-lg sm:w-96">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-950">Delete Look</h3>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-neutral-600">
              This will permanently delete the Look. You can still reference the original job.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
