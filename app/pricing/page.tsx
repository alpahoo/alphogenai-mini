"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ArrowLeft, Loader2, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

const FREE_FEATURES = [
  "1 video per day",
  "5-second clips",
  "1 scene per video",
  "720p resolution",
];

const PRO_FEATURES = [
  "Unlimited generations",
  "15-second videos",
  "Up to 3 scenes per video",
  "Priority generation",
  "720p resolution",
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-16 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
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
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Turn ideas into cinematic AI videos in minutes
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade when you need longer, more powerful videos.
          </p>
        </motion.div>

        {error && (
          <div className="mb-6 mx-auto max-w-md rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-8 flex flex-col"
          >
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Free</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Perfect to test ideas and generate quick clips.
              </p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-muted-foreground ml-1">/month</span>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => router.push("/generate")}
              className="w-full rounded-xl border border-border bg-background py-3 text-sm font-semibold transition-colors hover:bg-accent"
            >
              Get Started
            </button>
          </motion.div>

          {/* Pro Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-2xl border-2 border-primary bg-card/80 backdrop-blur-sm p-8 flex flex-col relative"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Most popular
              </span>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Pro</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Create multi-scene videos with more depth, control, and impact.
              </p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold">$19</span>
              <span className="text-muted-foreground ml-1">/month</span>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                "Upgrade to Pro"
              )}
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
