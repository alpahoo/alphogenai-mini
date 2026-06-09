"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Library,
  Music,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface VideoAsset {
  id: string;
  prompt: string;
  output_url_final: string;
  created_at: string;
  target_duration_seconds: number | null;
  social_exports: Record<string, string> | null;
}

interface SavedLook {
  id: string;
  name: string;
  video_url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  created_at: string;
}

type FilterKey = "all" | "reference" | "social";

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
          .select("id, prompt, output_url_final, created_at, target_duration_seconds, social_exports")
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

  const filteredVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((asset) => {
      const matchesQuery = !q || asset.prompt.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        filter === "reference" ||
        (filter === "social" && hasSocialPack(asset));
      return matchesQuery && matchesFilter;
    });
  }, [videos, query, filter]);

  const stats = useMemo(
    () => [
      { label: "Videos", value: videos.length.toString() },
      { label: "Saved Looks", value: looks.length.toString() },
      { label: "Reference-ready", value: videos.length.toString() },
      { label: "Social packs", value: videos.filter(hasSocialPack).length.toString() },
    ],
    [videos, looks],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase text-primary">
              <Library className="h-3.5 w-3.5" />
              Asset Studio
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Library</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Reuse finished videos as references, reopen the studio, download masters, or prepare social cuts.
            </p>
          </div>

          <Link
            href="/create/story"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" />
            Create new asset
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <span className="text-[11px] uppercase text-muted-foreground/60">{item.label}</span>
              <span className="mt-1 block text-2xl font-bold text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Clapperboard className="h-3.5 w-3.5" />
              Saved Looks
            </div>
            <h2 className="mt-1 text-lg font-bold text-foreground">Reusable shots</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Keep a shot you already like, then apply a fresh script and voice without rebuilding the visual from scratch.
            </p>
          </div>
          <Link
            href="/create/avatar"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5"
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
          <div className="mt-5 rounded-xl border border-dashed border-border/50 bg-background px-5 py-6">
            <p className="text-sm font-semibold text-foreground">No saved looks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Save a completed cinematic avatar shot as a Look, then it will appear here for fast reuse.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {looks.map((look) => (
              <article
                key={look.id}
                className="overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
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
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110"
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
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All videos" },
              { id: "reference", label: "Use as reference" },
              { id: "social", label: "Social-ready" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id as FilterKey)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  filter === item.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
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
          <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card py-16">
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
              return (
                <motion.article
                  key={asset.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.025, 0.2) }}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
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
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Reference
                      </Link>
                      <Link
                        href={`/jobs/${asset.id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5"
                      >
                        <Film className="h-3.5 w-3.5" />
                        Studio
                      </Link>
                      <a
                        href={asset.output_url_final}
                        download
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Master
                      </a>
                      <Link
                        href={`/jobs/${asset.id}#social`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5"
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
        <section className="rounded-2xl border border-dashed border-border/40 bg-card/50 p-6">
          <ImageIcon className="mb-3 h-6 w-6 text-muted-foreground/30" />
          <h2 className="text-sm font-bold text-foreground">Images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated stills and saved references will appear here as the image pipeline expands.
          </p>
        </section>

        <section className="rounded-2xl border border-dashed border-border/40 bg-card/50 p-6">
          <Music className="mb-3 h-6 w-6 text-muted-foreground/30" />
          <h2 className="text-sm font-bold text-foreground">Music</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Voice-over and soundtrack assets stay attached to their projects for now.
          </p>
        </section>
      </div>
    </div>
  );
}
