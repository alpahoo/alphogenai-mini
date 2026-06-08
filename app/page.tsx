"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  Film,
  Images,
  Layers3,
  Sparkles,
  Wand2,
} from "lucide-react";

const qualityItems = [
  ["Character", "High"],
  ["Prompt", "Good"],
  ["Model", "Auto"],
  ["Social", "9:16 ready"],
];

const scenes = [
  "Establishing shot - cinematic street-level opening",
  "Reaction - same character, tighter framing",
  "Detail insert - mood, motion, and continuity",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
            <Image src="/app-icon.png" alt="AlphoGen" width={20} height={20} className="rounded-md" />
            AI video direction workspace
          </div>

          <h1 className="text-5xl font-bold tracking-normal text-foreground sm:text-6xl lg:text-7xl">
            Direct cinematic AI videos from one workspace
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Plan scenes, lock character references, generate polished video, then prepare social exports without juggling model dashboards.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/create/story"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              <Wand2 className="h-4 w-4" />
              Create with Director
            </Link>
            <Link
              href="/gallery"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Browse examples
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15 }}
          className="mx-auto mt-14 w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Director plan
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BadgeCheck className="h-4 w-4 text-emerald-500" />
              Ready to generate
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex flex-wrap gap-2">
                {qualityItems.map(([label, value]) => (
                  <span key={label} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="ml-2 font-semibold text-foreground">{value}</span>
                  </span>
                ))}
              </div>

              <div className="space-y-3">
                {scenes.map((scene, index) => (
                  <div key={scene} className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">
                          {index + 1}
                        </span>
                        Scene {index + 1}
                      </div>
                      <span className="text-xs text-muted-foreground">5s</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{scene}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid content-between gap-5 bg-muted/30 p-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Images className="h-4 w-4 text-blue-500" />
                  Assets
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["Face", "Style", "Frame"].map((label) => (
                    <div key={label} className="aspect-square rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground">
                      <div className="mb-2 h-8 w-8 rounded-md bg-primary/10" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clapperboard className="h-4 w-4 text-amber-500" />
                  Post-generation studio
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                    <span>TikTok / Reels</span>
                    <span className="text-xs text-muted-foreground">9:16</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                    <span>Instagram</span>
                    <span className="text-xs text-muted-foreground">1:1</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="border-t border-border bg-muted/20 px-6 py-14">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            { icon: Film, title: "Scene-first planning", body: "Turn one idea into editable shots before generation." },
            { icon: Layers3, title: "Consistent assets", body: "Keep faces, style, and references attached to the brief." },
            { icon: Clapperboard, title: "Social-ready output", body: "Prepare formats, thumbnails, captions, and publishing from the job page." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-card p-5">
              <item.icon className="mb-4 h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
