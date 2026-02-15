"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wand2, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

const EXAMPLE_PROMPTS = [
  "A rocket launching into a starry night sky with smoke trails",
  "Ocean waves crashing on a tropical beach at sunset",
  "A futuristic city with flying cars and neon lights",
  "Northern lights dancing over a snowy mountain landscape",
];

export default function GeneratePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Prompt must be at least 3 characters");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create job");
      }

      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            Generate a Video
          </h1>
          <p className="mb-8 text-muted-foreground">
            Describe the scene you want. AI will generate video with
            synchronized audio.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Prompt textarea — glassmorphism card */}
            <div className="rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
              <label
                htmlFor="prompt"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                Your prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A rocket launching into a starry night sky..."
                className="h-32 w-full resize-none rounded-xl border border-border bg-background/50 p-4 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={loading}
              />

              {/* Example prompts */}
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    disabled={loading}
                    className="rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    {example.length > 40
                      ? example.slice(0, 40) + "..."
                      : example}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating job...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate Video
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
