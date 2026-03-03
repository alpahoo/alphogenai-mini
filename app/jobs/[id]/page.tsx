"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import type { Job, JobStage } from "@/lib/types";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/types";

const POLL_INTERVAL = 5000;

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${params.id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch job");
      }

      setJob(data.job);
      setLoading(false);
      return data.job.status;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setLoading(false);
      return "error";
    }
  }, [params.id]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startPolling = async () => {
      const status = await fetchJob();
      if (status === "done" || status === "failed" || status === "error") {
        return;
      }

      interval = setInterval(async () => {
        const s = await fetchJob();
        if (s === "done" || s === "failed" || s === "error") {
          if (interval) clearInterval(interval);
        }
      }, POLL_INTERVAL);
    };

    startPolling();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchJob]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentStageIndex = job?.current_stage
    ? STAGE_ORDER.indexOf(job.current_stage as JobStage)
    : 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-xl font-bold">Error</h2>
          <p className="mb-6 text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/generate")}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!job) return null;

  const isActive = job.status === "pending" || job.status === "in_progress";
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const videoUrl = job.output_url_final || job.video_url;

  return (
    <div className="min-h-screen px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">
        <Link
          href="/generate"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          New generation
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Prompt card */}
          <div className="mb-6 rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">Prompt</p>
            <p className="mt-1 font-medium">{job.prompt}</p>
          </div>

          {/* Progress */}
          {isActive && (
            <div className="mb-6 rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-semibold">
                  {job.current_stage
                    ? STAGE_LABELS[job.current_stage as JobStage] ||
                      "Processing..."
                    : "In queue..."}
                </span>
              </div>

              {/* Stage progress bar */}
              <div className="flex gap-1.5">
                {STAGE_ORDER.map((stage, i) => (
                  <div
                    key={stage}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= currentStageIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>
                  Step {Math.max(currentStageIndex + 1, 1)} of{" "}
                  {STAGE_ORDER.length}
                </span>
                <span>Polling every 5s</span>
              </div>
            </div>
          )}

          {/* Failed */}
          {isFailed && (
            <div className="mb-6 rounded-2xl border border-destructive/50 bg-destructive/10 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">
                    Generation failed
                  </p>
                  {job.error_message && (
                    <p className="mt-1 text-sm text-destructive/80">
                      {job.error_message}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => router.push("/generate")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Wand2 className="h-4 w-4" />
                Try Again
              </button>
            </div>
          )}

          {/* Done — Video player */}
          {isDone && videoUrl && (
            <div className="mb-6 rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span className="font-semibold text-green-500">Complete</span>
              </div>

              <video
                controls
                autoPlay
                className="w-full rounded-xl"
                src={videoUrl}
              >
                Your browser does not support video playback.
              </video>

              <div className="mt-4 flex gap-3">
                <a
                  href={videoUrl}
                  download
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
                <button
                  onClick={() => copyLink(videoUrl)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>ID: {job.id.slice(0, 8)}...</span>
              <span>
                Created:{" "}
                {new Date(job.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              {job.current_stage && <span>Stage: {job.current_stage}</span>}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
