"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Film, Image, Music, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface VideoAsset {
  id: string;
  prompt: string;
  output_url_final: string;
  created_at: string;
  target_duration_seconds: number | null;
  social_exports: Record<string, string> | null;
}

export default function LibraryPage() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loading, setLoading] = useState(true);

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
          .limit(30);

        if (data) setVideos(data as VideoAsset[]);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your generated assets.
        </p>
      </motion.div>

      {/* ── Videos ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Videos
        </h2>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-video animate-pulse rounded-xl bg-muted/30"
              />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 py-16">
            <Film className="h-8 w-8 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground/50 mb-3">
              No videos yet
            </p>
            <Link
              href="/create"
              className="text-xs font-medium text-primary hover:underline"
            >
              Create your first video
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v, i) => {
              const thumbnail = v.social_exports?.thumbnail ?? null;
              return (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                >
                  <Link
                    href={`/jobs/${v.id}`}
                    className="group block rounded-xl border border-border/40 bg-card/60 overflow-hidden transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <div className="relative aspect-video bg-muted/30 overflow-hidden">
                      {thumbnail ? (
                        /* Use generated thumbnail if available */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnail}
                          alt={v.prompt}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        /* Show actual video (preload=metadata loads first frame) */
                        <video
                          src={v.output_url_final}
                          className="h-full w-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                        />
                      )}

                      {/* Hover play overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                          <Play className="h-5 w-5 text-white fill-white" />
                        </div>
                      </div>

                      {v.target_duration_seconds && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {v.target_duration_seconds}s
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-xs text-muted-foreground">
                        {v.prompt}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Images (empty) ─────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
          Images
        </h2>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/30 py-10">
          <Image className="h-6 w-6 text-muted-foreground/15 mb-2" />
          <p className="text-xs text-muted-foreground/40">No images yet</p>
        </div>
      </section>

      {/* ── Music (empty) ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
          Music
        </h2>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/30 py-10">
          <Music className="h-6 w-6 text-muted-foreground/15 mb-2" />
          <p className="text-xs text-muted-foreground/40">No music yet</p>
        </div>
      </section>
    </div>
  );
}
