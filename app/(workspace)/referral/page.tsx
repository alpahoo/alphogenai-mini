"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  Users,
  Gift,
  Share2,
  Loader2,
  Link2,
} from "lucide-react";

interface ReferralData {
  code: string;
  referralUrl: string;
  totalReferred: number;
  bonusCredits: number;
}

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-sm text-muted-foreground">
          Failed to load referral data. Please try again later.
        </p>
      </div>
    );
  }

  const tweetText = encodeURIComponent(
    `I'm creating AI videos with AlphoGen — sign up with my link and we both get 5 bonus generations! ${data.referralUrl}`
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      {/* ── Header ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gift className="h-6 w-6 text-primary" />
          Refer a Friend
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your unique link and earn 5 bonus generations for every friend
          who signs up and creates a video.
        </p>
      </motion.div>

      {/* ── Referral link card ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-border/40 bg-card/60 p-6 mb-6"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Your referral link
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-border/40 bg-background px-4 py-2.5 min-w-0">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm text-foreground select-all">
              {data.referralUrl}
            </span>
          </div>
          <button
            onClick={() => copyToClipboard(data.referralUrl, setCopied)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-300" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* ── Stats cards ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {[
          {
            icon: Users,
            label: "Friends Referred",
            value: data.totalReferred,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
          },
          {
            icon: Gift,
            label: "Bonus Credits",
            value: data.bonusCredits,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="rounded-xl border border-border/40 bg-card/60 p-5"
          >
            <div
              className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}
            >
              <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ── How it works ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-xl border border-border/40 bg-card/60 p-6 mb-8"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          How it works
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Share your unique link",
              description:
                "Copy your referral link and send it to friends, colleagues, or your audience.",
            },
            {
              step: "2",
              title: "Friend signs up and creates a video",
              description:
                "Your friend creates an account using your link and generates their first video.",
            },
            {
              step: "3",
              title: "You both get 5 bonus generations",
              description:
                "Once they create a video, you each receive 5 bonus generation credits.",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {item.step}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Share buttons ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex flex-wrap gap-3"
      >
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-card/60 px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-card"
        >
          <span className="text-base leading-none">&#120143;</span>
          Share on X
        </a>
        <button
          onClick={() => copyToClipboard(data.referralUrl, setCopiedShare)}
          className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-card/60 px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-card"
        >
          {copiedShare ? (
            <>
              <Check className="h-4 w-4 text-green-400" />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              Copy Link
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}
