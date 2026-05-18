import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEngineDisplayName } from "@/lib/types";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

async function getPublicJob(id: string) {
  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, prompt, status, engine_used, target_duration_seconds, output_url_final, video_url, social_exports, created_at",
    )
    .eq("id", id)
    .eq("status", "done")
    .single();

  return job;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const job = await getPublicJob(id);

  if (!job) {
    return { title: "Video not found" };
  }

  const title = job.prompt.length > 60 ? job.prompt.slice(0, 57) + "..." : job.prompt;
  const description = `AI-generated video: "${job.prompt}" — Made with AlphoGen`;
  const videoUrl = job.output_url_final || job.video_url;
  const thumbnail = (job.social_exports as Record<string, string>)?.thumbnail;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      url: `/v/${id}`,
      ...(videoUrl
        ? {
            videos: [{ url: videoUrl, type: "video/mp4" }],
          }
        : {}),
      ...(thumbnail ? { images: [{ url: thumbnail }] } : {}),
    },
    twitter: {
      card: "player",
      title,
      description,
      ...(videoUrl
        ? {
            players: [
              {
                playerUrl: videoUrl,
                streamUrl: videoUrl,
                width: 1280,
                height: 720,
              },
            ],
          }
        : {}),
    },
  };
}

export default async function PublicVideoPage({ params }: Props) {
  const { id } = await params;
  const job = await getPublicJob(id);

  if (!job) notFound();

  const videoUrl = job.output_url_final || job.video_url;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-3">
        <Link href="/" className="text-sm font-bold tracking-tight">
          AlphoGen
        </Link>
        <Link
          href="/create"
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
        >
          Create your own
        </Link>
      </header>

      {/* Video */}
      <main className="mx-auto max-w-3xl px-4 py-10">
        {videoUrl && (
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/60">
            <video
              controls
              autoPlay
              playsInline
              className="w-full"
              src={videoUrl}
            >
              Your browser does not support video playback.
            </video>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <h1 className="text-lg font-semibold leading-snug">{job.prompt}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{getEngineDisplayName(job.engine_used)}</span>
            <span>{job.target_duration_seconds}s</span>
            <span>
              {new Date(job.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <p className="text-sm font-medium mb-3">
            Create your own AI videos for free
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            Get started free
          </Link>
        </div>
      </main>
    </div>
  );
}
