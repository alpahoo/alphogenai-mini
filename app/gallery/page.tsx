import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import type { Metadata } from "next";
import { getEngineDisplayName } from "@/lib/types";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Browse AI-generated videos made with AlphoGen. Get inspired and create your own.",
};

// Revalidate every 5 minutes
export const revalidate = 300;

interface GalleryVideo {
  id: string;
  prompt: string;
  engine_used: string | null;
  target_duration_seconds: number;
  output_url_final: string;
  social_exports: Record<string, string> | null;
  created_at: string;
}

export default async function GalleryPage() {
  const supabase = createServiceClient();

  const { data: videos } = await supabase
    .from("jobs")
    .select(
      "id, prompt, engine_used, target_duration_seconds, output_url_final, social_exports, created_at",
    )
    .eq("status", "done")
    .not("output_url_final", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);

  const items = (videos ?? []) as GalleryVideo[];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-3">
        <Link href="/" className="text-sm font-bold tracking-tight">
          AlphoGen
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
        >
          Create your own
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Gallery</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            AI-generated videos made with AlphoGen
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-20">
            No videos yet. Be the first to create one!
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v) => {
              const thumbnail = v.social_exports?.thumbnail ?? null;
              return (
                <Link
                  key={v.id}
                  href={`/v/${v.id}`}
                  className="group block overflow-hidden rounded-xl border border-border/40 bg-card/60 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="relative aspect-video bg-muted/30 overflow-hidden">
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnail}
                        alt={v.prompt}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <video
                        src={v.output_url_final}
                        className="h-full w-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                      />
                    )}
                    <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {v.target_duration_seconds}s
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="truncate text-xs font-medium">{v.prompt}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{getEngineDisplayName(v.engine_used)}</span>
                      <span>
                        {new Date(v.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
