"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Crown,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    description: "Explore the studio and test fast short-form ideas.",
    eyebrow: "Start",
    icon: Zap,
    features: [
      "1 video per day",
      "5-second clips",
      "Single-scene generation",
      "Starter model access",
    ],
    cta: "Start creating",
    ctaAction: "navigate" as const,
  },
  {
    name: "Pro",
    price: "$19",
    description: "Build polished multi-scene clips with stronger direction.",
    eyebrow: "Most chosen",
    icon: Clapperboard,
    featured: true,
    features: [
      "Unlimited generations",
      "Up to 15 seconds",
      "Up to 3 scenes",
      "Director Console",
      "Reference-based creation",
      "Priority generation",
    ],
    cta: "Upgrade to Pro",
    ctaAction: "checkout" as const,
    ctaPlan: "pro",
  },
  {
    name: "Premium",
    price: "$49",
    description: "Run longer productions with the full creative stack.",
    eyebrow: "Studio",
    icon: Crown,
    features: [
      "Everything in Pro",
      "Up to 120 seconds",
      "Up to 10 scenes",
      "Premium model access",
      "Saved looks and references",
      "Early feature access",
    ],
    cta: "Go Premium",
    ctaAction: "checkout" as const,
    ctaPlan: "premium",
  },
];

const COMPARISON = [
  "Director planning and editable scenes",
  "Reference images and verified faces",
  "Post-generation studio tools",
  "Curated social exports",
  "Provider-neutral public workspace",
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
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to AlphoGen
          </Link>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Create
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-700">
              <Sparkles className="h-4 w-4 text-[#5f5bf6]" />
              Creative production plans
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.96] tracking-tight text-neutral-950 sm:text-6xl">
              Choose the studio scale you need.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-600">
              Start with quick ideas, then unlock longer scenes, stronger
              direction, references, and post-generation tools as your workflow
              grows.
            </p>
          </div>
          <div className="rounded-[28px] bg-neutral-950 p-6 text-white shadow-2xl shadow-black/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
                  Included
                </p>
                <h2 className="text-2xl font-semibold">Built for safe output</h2>
              </div>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {COMPARISON.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl bg-white/10 p-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#baff3b]" />
                  <span className="text-sm leading-6 text-white/80">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isLoading = loading === plan.ctaPlan;
            return (
              <article
                key={plan.name}
                className={`flex min-h-[520px] flex-col rounded-[28px] border p-6 shadow-sm ${
                  plan.featured
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-black/10 bg-white text-neutral-950"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                        plan.featured ? "text-white/50" : "text-neutral-500"
                      }`}
                    >
                      {plan.eyebrow}
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold">{plan.name}</h2>
                  </div>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      plan.featured ? "bg-white/10" : "bg-neutral-100"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                <p
                  className={`mt-5 min-h-[60px] text-sm leading-7 ${
                    plan.featured ? "text-white/70" : "text-neutral-600"
                  }`}
                >
                  {plan.description}
                </p>

                <div className="mt-8">
                  <span className="text-5xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  <span
                    className={`ml-2 text-sm ${
                      plan.featured ? "text-white/50" : "text-neutral-500"
                    }`}
                  >
                    /month
                  </span>
                </div>

                <ul className="mt-8 flex-1 space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          plan.featured ? "text-[#baff3b]" : "text-neutral-950"
                        }`}
                      />
                      <span
                        className={
                          plan.featured ? "text-white/80" : "text-neutral-700"
                        }
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {plan.ctaAction === "navigate" ? (
                  <button
                    onClick={() => router.push("/create")}
                    className="mt-8 inline-flex h-12 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100"
                  >
                    {plan.cta}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.ctaPlan!)}
                    disabled={isLoading}
                    className={`mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      plan.featured
                        ? "bg-[#baff3b] text-neutral-950 hover:bg-[#d4ff68]"
                        : "bg-neutral-950 text-white hover:bg-neutral-800"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting
                      </>
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
