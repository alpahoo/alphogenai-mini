import type { Metadata } from "next";
import Link from "next/link";
import {
  Sparkles,
  Cpu,
  ShieldCheck,
  Layers,
  Wand2,
  Workflow,
  Server,
  Cloud,
  Database,
  HardDrive,
  Code2,
  CreditCard,
  Check,
  Lock,
  Globe2,
  ScrollText,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Technology — AlphoGen",
  description:
    "AlphoGen orchestrates the world's most advanced generative video AI — Wan 2.6/2.7, Happy Horse 1.0 — within a unified production platform.",
  openGraph: {
    title: "Technology — AlphoGen",
    description:
      "AlphoGen orchestrates the world's most advanced generative video AI — Wan 2.6/2.7, Happy Horse 1.0 — within a unified production platform.",
    type: "website",
  },
};

const ARCHITECTURE_CARDS = [
  {
    icon: Layers,
    title: "Engine Registry",
    body: "A pluggable engine registry routes each generation request to the optimal model based on user tier, prompt complexity, scene type, and quality requirements. New models integrate in days, not months.",
  },
  {
    icon: ShieldCheck,
    title: "Defense-in-Depth Validation",
    body: "Every generation passes through a multi-layer validation pipeline — TypeScript at the edge, Python at the orchestrator, and Modal at the inference layer — ensuring consistent output quality and fail-fast safety.",
  },
  {
    icon: Cpu,
    title: "Elastic GPU Compute",
    body: "Built on Modal for serverless GPU inference. Auto-scales from zero to thousands of concurrent jobs based on demand. Zero idle cost, sub-second cold starts on warm pools.",
  },
];

const MODEL_CARDS = [
  {
    name: "Wan 2.6",
    tag: "Production",
    tagClass: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
    body: "Alibaba's flagship generative video model. 720p and 1080p output, image-to-video, multi-scene generation, and strong prompt adherence. Our default workhorse for fast, high-quality clips.",
  },
  {
    name: "Wan 2.7",
    tag: "Production",
    tagClass: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
    body: "Optimized for longer-form content (>5s). Higher motion coherence and improved temporal consistency for narrative video sequences.",
  },
  {
    name: "Happy Horse 1.0",
    tag: "Premium",
    tagClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
    body: "The #1-ranked AI video model on Artificial Analysis Video Arena. 15B parameters, native joint audio-video generation, 1080p output, multilingual lip-sync. Used in our premium tier for production-grade output.",
  },
  {
    name: "Multi-LLM Prompt Layer",
    tag: "Enhancement",
    tagClass: "border-purple-500/40 bg-purple-500/10 text-purple-300",
    body: "Qwen and Claude models power our prompt enhancement pipeline, expanding short user prompts into detailed cinematographic descriptions for higher-quality generations.",
  },
];

const STACK = [
  {
    icon: Server,
    name: "Modal",
    line: "Serverless GPU inference and Python orchestration",
  },
  {
    icon: Cloud,
    name: "Alibaba Cloud Bailian",
    line: "Frontier video model API access (Frankfurt region, GDPR-compliant)",
  },
  {
    icon: Database,
    name: "Supabase",
    line: "Authentication, database, and storage",
  },
  {
    icon: HardDrive,
    name: "Cloudflare R2",
    line: "Global video delivery and asset storage",
  },
  {
    icon: Code2,
    name: "Next.js",
    line: "App Router, server components, edge-optimized frontend",
  },
  {
    icon: CreditCard,
    name: "Stripe",
    line: "Subscription billing and metered usage",
  },
];

const CAPABILITIES = [
  "Text-to-video generation across multiple model engines",
  "Image-to-video with reference-driven character consistency",
  "Multi-scene composition with narrative continuity",
  "Native synchronized audio generation (dialogue, ambient, Foley)",
  "Multilingual lip-sync in 7+ languages",
  "720p and 1080p HD output",
  "Async REST API with webhook callbacks",
  "Tiered model selection (Standard / Pro / Studio)",
  "Prompt enhancement via integrated LLM pipeline",
  "Project history, regeneration, and creative iteration",
];

const COMPLIANCE = [
  {
    icon: Globe2,
    title: "GDPR Compliant",
    body: "European data residency via Alibaba Cloud Frankfurt region. Full compliance with EU data protection regulations.",
  },
  {
    icon: Lock,
    title: "Content Safety",
    body: "Multi-layer content moderation. Generation is restricted to lawful, non-infringing creative content. No deepfakes, no public figure impersonation, no harmful material.",
  },
  {
    icon: ScrollText,
    title: "Commercial Rights",
    body: "Users retain full commercial rights to videos generated through AlphoGen, in accordance with our model providers' terms of service.",
  },
];

const ROADMAP = [
  "Q2 2026 — Private beta launch",
  "Q3 2026 — Public release + Pro tier",
  "Q4 2026 — Studio tier + Enterprise API",
];

export default function TechnologyPage() {
  return (
    <div className="relative overflow-hidden px-4 py-16 sm:py-24">
      {/* Background gradient orbs — same language as homepage */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* ── Section 1: Hero ─────────────────────────────────────── */}
        <section className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Technology
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Engineered for{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              cinematic AI video
            </span>{" "}
            at scale
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg text-muted-foreground">
            AlphoGen orchestrates the world&apos;s most advanced generative
            video models within a unified, production-ready creative platform —
            built for performance, scalability, and creative freedom.
          </p>
        </section>

        {/* ── Section 2: Architecture overview ────────────────────── */}
        <section className="mt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              A multi-engine AI orchestration platform
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              We don&apos;t bet on a single model. We orchestrate the best of
              generative video AI behind a unified API.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {ARCHITECTURE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="flex flex-col rounded-2xl border border-border/50 bg-card/50 p-7 backdrop-blur-sm"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {card.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: AI Models ────────────────────────────────── */}
        <section className="mt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Powered by frontier video AI
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {MODEL_CARDS.map((m) => (
              <div
                key={m.name}
                className="rounded-2xl border border-border/50 bg-card/50 p-7 backdrop-blur-sm transition-colors hover:border-border"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold">{m.name}</h3>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${m.tagClass}`}
                  >
                    {m.tag}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 4: Infrastructure stack ─────────────────────── */}
        <section className="mt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Production-grade infrastructure
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Built on best-in-class platforms for global reliability,
              security, and performance.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {STACK.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.name}
                  className="flex flex-col rounded-xl border border-border/50 bg-card/50 p-5 backdrop-blur-sm"
                >
                  <Icon className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="text-sm font-semibold">{s.name}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {s.line}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 5: Capabilities ─────────────────────────────── */}
        <section className="mt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              What AlphoGen can do
            </h2>
          </div>
          <ul className="mx-auto grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <li
                key={c}
                className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/30 px-4 py-3 backdrop-blur-sm"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm text-foreground/90">{c}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Section 6: Compliance ───────────────────────────────── */}
        <section className="mt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built responsibly
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {COMPLIANCE.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  className="flex flex-col rounded-2xl border border-border/50 bg-card/50 p-7 backdrop-blur-sm"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{c.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {c.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 7: Roadmap ──────────────────────────────────── */}
        <section className="mt-24">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Roadmap
            </h2>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            {ROADMAP.map((r) => (
              <div
                key={r}
                className="rounded-full border border-border/60 bg-card/60 px-5 py-2.5 text-sm text-foreground/90 backdrop-blur-sm"
              >
                {r}
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 8: Bottom CTA ───────────────────────────────── */}
        <section className="mt-24 rounded-3xl border border-border/50 bg-card/40 p-10 text-center backdrop-blur-sm sm:p-14">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to create?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Join the private beta or explore our model library.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
            >
              <Wand2 className="h-4 w-4" />
              Start Creating
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:bg-card"
            >
              <Workflow className="h-4 w-4" />
              View Pricing
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
