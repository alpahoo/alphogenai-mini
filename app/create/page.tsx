"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Film, ShoppingBag, Share2 } from "lucide-react";
import Link from "next/link";
import { WorkflowCard } from "@/components/create/workflow-card";

const WORKFLOWS = [
  {
    id: "story",
    title: "Story Video",
    description: "Turn a narrative prompt into a cinematic AI-generated scene.",
    icon: Film,
  },
  {
    id: "product",
    title: "Product Video",
    description:
      "Create a short, eye-catching product showcase from a text description.",
    icon: ShoppingBag,
  },
  {
    id: "social",
    title: "Social Clip",
    description: "Generate a punchy, shareable clip optimized for social media.",
    icon: Share2,
  },
] as const;

export default function CreatePage() {
  return (
    <div className="min-h-screen px-4 py-16 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What do you want to create?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Choose a workflow to get started.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-3">
          {WORKFLOWS.map((wf, i) => (
            <motion.div
              key={wf.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
            >
              <WorkflowCard
                title={wf.title}
                description={wf.description}
                icon={wf.icon}
                href={`/create/${wf.id}`}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
