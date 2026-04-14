"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Play, Wand2 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-2xl text-center"
      >
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          AI-Powered Video Generation
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
          Text to Video,{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Instantly
          </span>
        </h1>

        <p className="mb-10 text-lg text-muted-foreground">
          Describe any scene. Get a video with synchronized audio in seconds.
          Powered by open-source AI models on Modal.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
          >
            <Wand2 className="h-4 w-4" />
            Create a Video
          </Link>

          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 px-8 py-3.5 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:bg-card"
          >
            <Play className="h-4 w-4" />
            See Plans
          </Link>
        </div>
      </motion.div>

      {/* Pipeline steps */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="relative z-10 mt-20 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {[
          {
            step: "1",
            title: "Describe",
            description: "Type a prompt describing your video scene",
          },
          {
            step: "2",
            title: "Generate",
            description: "AI creates video + audio on GPU in seconds",
          },
          {
            step: "3",
            title: "Download",
            description: "Get your final video with synchronized audio",
          },
        ].map((item) => (
          <div
            key={item.step}
            className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm"
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
              {item.step}
            </div>
            <h3 className="mb-1 font-semibold">{item.title}</h3>
            <p className="text-sm text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
