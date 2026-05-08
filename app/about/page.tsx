import type { Metadata } from "next";
import { Sparkles, Cpu, Layers, Workflow } from "lucide-react";

export const metadata: Metadata = {
  title: "About — AlphoGen",
  description:
    "AlphoGen is an AI-first studio building creative tools for video generation.",
  openGraph: {
    title: "About — AlphoGen",
    description:
      "AlphoGen is an AI-first studio building creative tools for video generation.",
    type: "website",
  },
};

const TECHNOLOGY = [
  {
    icon: Layers,
    title: "Multi-Engine AI",
    description:
      "We orchestrate the best open and proprietary video models (Wan 2.6, Wan 2.7, Happy Horse 1.0, and more) behind a single API, automatically routing each generation to the optimal engine based on user tier, scene complexity, and quality requirements.",
  },
  {
    icon: Cpu,
    title: "GPU-Native Infrastructure",
    description:
      "Powered by Modal for elastic GPU compute, Supabase for data, and Cloudflare R2 for global delivery. Built to scale from one video to one million.",
  },
  {
    icon: Workflow,
    title: "Creator-First Workspace",
    description:
      "A studio-grade interface for multi-scene composition, image-to-video, reference-driven generation, and audio sync — designed for production workflows, not prompts in a box.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden px-4 py-16 sm:py-24">
      {/* Background gradient orbs — same language as homepage */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* Hero — matches homepage pattern: badge → headline → subhead */}
        <section className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            About AlphoGen
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Building the future of{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              AI video creation
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            AlphoGen is an AI-first studio building creative tools that let
            anyone produce broadcast-quality video without a camera, crew, or
            budget.
          </p>
        </section>

        {/* Mission */}
        <section className="mt-20">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary">
            Our mission
          </h2>
          <p className="text-lg leading-relaxed text-foreground/90">
            We combine state-of-the-art generative video models within a
            unified workspace designed for creators, marketers, and content
            teams. Our goal: collapse the gap between idea and output — from
            days to seconds. We believe creative production should be limited
            only by imagination, not by budget, equipment, or technical skill.
          </p>
        </section>

        {/* What we build */}
        <section className="mt-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-primary">
            What we build
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TECHNOLOGY.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex flex-col rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm"
                >
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="mb-2 font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Stage */}
        <section className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Currently in private beta. Public launch Q2 2026.
          </p>
        </section>
      </div>
    </div>
  );
}
