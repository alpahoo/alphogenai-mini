"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ArrowLeft, Loader2, Sparkles, Zap, Crown } from "lucide-react";
import Link from "next/link";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    icon: Zap,
    iconColor: "text-muted-foreground",
    description: "Perfect to test ideas and generate quick clips.",
    features: [
      "1 video per day",
      "5-second clips",
      "1 scene per video",
      "Wan 2.2 I2V engine",
    ],
    cta: "Get Started",
    ctaAction: "navigate" as const,
    highlight: false,
    badge: null,
  },
  {
    name: "Pro",
    price: "$19",
    icon: Sparkles,
    iconColor: "text-primary",
    description: "Create multi-scene videos with more depth and control.",
    features: [
      "Unlimited generations",
      "Up to 15s videos",
      "Up to 3 scenes per video",
      "Seedance 2.0 + Wan engines",
      "Audio sync",
      "Priority generation",
    ],
    cta: "Upgrade to Pro",
    ctaAction: "checkout" as const,
    ctaPlan: "pro",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Premium",
    price: "$49",
    icon: Crown,
    iconColor: "text-yellow-400",
    description: "Maximum power. Unlimited everything for professionals.",
    features: [
      "Everything in Pro",
      "Up to 120s videos",
      "Up to 10 scenes per video",
      "All engines unlocked",
      "Audio sync",
      "Priority support",
      "Early access to new models",
    ],
    cta: "Go Premium",
    ctaAction: "checkout" as const,
    ctaPlan: "premium",
    highlight: false,
    badge: "Best value",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (plan: string) => {
    setLoading(plan);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-16 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
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
            Turn ideas into cinematic AI videos
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

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * (i + 1) }}
              className={`rounded-2xl ${
                plan.highlight
                  ? "border-2 border-primary"
                  : "border border-border/50"
              } bg-card/80 backdrop-blur-sm p-8 flex flex-col relative`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      plan.highlight
                        ? "bg-primary text-primary-foreground"
                        : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                    }`}
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <plan.icon className={`h-5 w-5 ${plan.iconColor}`} />
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground ml-1">/month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        plan.highlight ? "text-primary" : plan.name === "Premium" ? "text-yellow-400" : "text-muted-foreground"
                      }`}
                    />
                    <span className={plan.name === "Free" ? "text-muted-foreground" : ""}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.ctaAction === "navigate" ? (
                <button
                  onClick={() => router.push("/create")}
                  className="w-full rounded-xl border border-border bg-background py-3 text-sm font-semibold transition-colors hover:bg-accent"
                >
                  {plan.cta}
                </button>
              ) : (
                <button
                  onClick={() => handleCheckout(plan.ctaPlan!)}
                  disabled={loading === plan.ctaPlan}
                  className={`w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:brightness-110"
                      : "bg-gradient-to-r from-yellow-500 to-amber-500 text-black hover:brightness-110"
                  }`}
                >
                  {loading === plan.ctaPlan ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    plan.cta
                  )}
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
