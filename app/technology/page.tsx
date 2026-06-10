import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Cpu,
  Database,
  Film,
  Layers,
  Lock,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Technology - AlphoGen",
  description:
    "AlphoGen combines model orchestration, planning, assets, and safety gates into a production-grade AI video workspace.",
  openGraph: {
    title: "Technology - AlphoGen",
    description:
      "AlphoGen combines model orchestration, planning, assets, and safety gates into a production-grade AI video workspace.",
    type: "website",
  },
};

const ARCHITECTURE = [
  {
    icon: Workflow,
    title: "Director-first planning",
    body: "The workspace turns an idea into editable scenes, durations, reference roles, and readiness signals before generation.",
  },
  {
    icon: Layers,
    title: "Model orchestration",
    body: "A private routing layer chooses the right generation capability for each workflow while keeping provider details out of the product surface.",
  },
  {
    icon: ShieldCheck,
    title: "Safety and ownership gates",
    body: "Prompt policy, plan limits, asset ownership, reference validation, and quota checks run before any expensive generation begins.",
  },
];

const PIPELINE = [
  {
    step: "01",
    title: "Brief",
    body: "Prompt, platform, references, creator identity, product images, and saved looks are collected as structured intent.",
  },
  {
    step: "02",
    title: "Plan",
    body: "AI Director builds a scene plan with readiness, cost, duration, and compatibility feedback that can be edited.",
  },
  {
    step: "03",
    title: "Generate",
    body: "The backend validates the final payload, applies the right gates, then dispatches scenes through the generation pipeline.",
  },
  {
    step: "04",
    title: "Refine",
    body: "The job studio supports scene review, social exports, references, duplication, and future saved-look reuse.",
  },
];

const CAPABILITIES = [
  "Multi-scene story planning",
  "Reference image roles",
  "Verified identity assets",
  "UGC product planning",
  "Saved-look foundations",
  "Social export pack",
  "Curated public gallery",
  "Agent-ready MCP design",
];

export default function TechnologyPage() {
  return (
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-sm font-semibold">
            AlphoGen
          </Link>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Open studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-700">
              <Cpu className="h-4 w-4 text-[#5f5bf6]" />
              Technology
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight text-neutral-950 sm:text-7xl">
              The system behind directed AI video.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              AlphoGen is built as an orchestration layer for creators: planning,
              assets, validation, generation, and post-production working as one
              pipeline.
            </p>
          </div>

          <div className="rounded-[32px] bg-neutral-950 p-6 text-white shadow-2xl shadow-black/20">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Scenes", value: "10" },
                { label: "Duration", value: "120s" },
                { label: "Flow", value: "Studio" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                    {metric.label}
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/10 p-5">
              <div className="flex items-center gap-3">
                <Film className="h-5 w-5 text-[#baff3b]" />
                <p className="text-sm font-semibold text-white/80">
                  One brief becomes a structured production plan.
                </p>
              </div>
              <div className="mt-5 grid gap-2">
                {["Prompt policy", "Reference ownership", "Plan and quota", "Scene dispatch"].map(
                  (item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-2xl bg-black/20 px-4 py-3 text-sm text-white/70"
                    >
                      <Check className="h-4 w-4 text-[#baff3b]" />
                      {item}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          {ARCHITECTURE.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-6 text-xl font-semibold">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  {item.body}
                </p>
              </article>
            );
          })}
        </section>

        <section className="mt-16 rounded-[32px] bg-neutral-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                Pipeline
              </p>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight">
                Built to preserve intent from idea to output.
              </h2>
            </div>
            <Sparkles className="hidden h-10 w-10 text-[#baff3b] sm:block" />
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {PIPELINE.map((step) => (
              <article key={step.step} className="rounded-[24px] bg-white/10 p-5">
                <p className="text-sm font-semibold text-[#baff3b]">
                  {step.step}
                </p>
                <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/65">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[28px] border border-black/10 bg-white p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight">
              Private internals, clear creative controls.
            </h2>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              Users see capabilities, readiness, cost, and model names that make
              product sense. Provider routing, credentials, and operational
              details remain behind the API boundary.
            </p>
          </div>
          <div className="rounded-[28px] border border-black/10 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Capabilities
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.map((capability) => (
                <div
                  key={capability}
                  className="flex items-center gap-3 rounded-2xl bg-[#f4f1ea] px-4 py-4 text-sm font-semibold"
                >
                  <Server className="h-4 w-4 text-[#5f5bf6]" />
                  {capability}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-16 rounded-[32px] border border-black/10 bg-white p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <Database className="h-8 w-8" />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                Ready for agent workflows.
              </h2>
            </div>
            <p className="text-sm leading-7 text-neutral-600">
              The same pure helpers used by the product can power future MCP
              tools for validation, plan creation, UGC planning, job lookup, and
              safe execution through the internal API. The goal is one contract,
              shared by humans and agents.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
