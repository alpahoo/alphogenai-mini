import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Layers,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About - AlphoGen",
  description:
    "AlphoGen is an AI video studio for directing cinematic, social, product, and creator-led video workflows.",
  openGraph: {
    title: "About - AlphoGen",
    description:
      "AlphoGen is an AI video studio for directing cinematic, social, product, and creator-led video workflows.",
    type: "website",
  },
};

const PRINCIPLES = [
  {
    icon: Clapperboard,
    title: "Direction before generation",
    body: "We turn a prompt into an editable plan first, so creators can shape scenes, duration, references, and intent before spending a generation.",
  },
  {
    icon: Layers,
    title: "Assets with memory",
    body: "Faces, references, saved looks, product images, and prior outputs should behave like a reusable production kit, not one-off uploads.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by curation",
    body: "Public showcases are selected explicitly. Private prompts, test outputs, and user assets never become marketing material by accident.",
  },
];

const WORKFLOWS = [
  "Cinematic story videos",
  "UGC product pitches",
  "Avatar presenters",
  "Reference-led variations",
  "Social exports",
  "Post-generation refinements",
];

export default function AboutPage() {
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
            Create your own
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-700">
              <Sparkles className="h-4 w-4 text-[#5f5bf6]" />
              About the studio
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight text-neutral-950 sm:text-7xl">
              A video studio for people who want to direct AI.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              AlphoGen is built around a simple idea: AI video should feel like
              directing a production, not filling out a technical form. The
              workspace brings planning, references, looks, generation, and
              post-production into one deliberate flow.
            </p>
          </div>

          <div className="rounded-[32px] bg-neutral-950 p-7 text-white shadow-2xl shadow-black/20">
            <div className="aspect-[4/3] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(186,255,59,0.22),transparent_24%),linear-gradient(135deg,#111,#343026_54%,#101010)]">
              <div className="flex h-full flex-col justify-between p-6">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                  <span>Director Console</span>
                  <span>Preview</span>
                </div>
                <div>
                  <p className="max-w-sm text-3xl font-semibold leading-tight">
                    Plan scenes, attach references, generate with intent.
                  </p>
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {["Plan", "Assets", "Studio"].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-white/70"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon;
            return (
              <article
                key={principle.title}
                className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-6 text-xl font-semibold">
                  {principle.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  {principle.body}
                </p>
              </article>
            );
          })}
        </section>

        <section className="mt-16 rounded-[32px] border border-black/10 bg-white p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                What it is becoming
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">
                One workspace for repeatable video production.
              </h2>
              <p className="mt-4 text-sm leading-7 text-neutral-600">
                The goal is not only better models. It is a system where a
                creator can define a look, bring in a product, keep a character
                consistent, generate a plan, and iterate without losing the
                creative thread.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {WORKFLOWS.map((workflow) => (
                <div
                  key={workflow}
                  className="flex items-center gap-3 rounded-2xl bg-[#f4f1ea] px-4 py-4 text-sm font-semibold"
                >
                  <Workflow className="h-4 w-4 text-[#5f5bf6]" />
                  {workflow}
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
