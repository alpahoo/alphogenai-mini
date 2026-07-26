import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy - AlphoGen",
  description:
    "How AlphoGen collects, uses, and protects your personal data.",
};

const SECTIONS = [
  {
    title: "1. Introduction",
    body: "AlphoGen respects your privacy and is committed to protecting your personal data. This policy explains how we collect, use, and safeguard information when you use our video creation service.",
  },
  {
    title: "2. Information we collect",
    body: "We collect account information, generation prompts, uploaded reference assets, usage data, billing metadata, and standard technical data used for security, analytics, and service reliability.",
  },
  {
    title: "3. How we use your data",
    body: "We use your data to deliver the service, create and store your videos, process subscriptions, improve product quality, prevent abuse, and maintain platform security.",
  },
  {
    title: "4. Prompts, assets, and outputs",
    body: "Your prompts, uploaded references, saved looks, generated media, and verified assets remain private to your account unless you explicitly choose to share them or an administrator deliberately publishes a curated gallery item.",
  },
  {
    title: "5. Service providers",
    body: "We rely on carefully selected infrastructure, payment, storage, authentication, and AI processing partners. These processors are used only to operate AlphoGen and are bound by contractual data-protection obligations.",
  },
  {
    title: "6. Data location and retention",
    body: "We retain account and generation history while your account remains active, unless deletion is requested or required by law. One-time video-presenter source and consent footage is deleted after publication. If you separately opt in to an AlphoGen-native reusable presenter, its private performance clip is retained for no more than one year and can be deleted earlier from your account.",
  },
  {
    title: "7. Your rights",
    body: "Depending on your jurisdiction, you may request access, correction, deletion, export, or restriction of your personal data. Contact us to exercise these rights.",
  },
];

export default function PrivacyPage() {
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
            Create
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[32px] bg-neutral-950 p-7 text-white shadow-2xl shadow-black/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Lock className="h-5 w-5 text-[#baff3b]" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              Legal
            </p>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/65">
              Last updated: July 2026. This page explains how private creative
              data is handled inside AlphoGen.
            </p>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#f4f1ea] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              Privacy-first gallery
            </div>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              AlphoGen does not automatically publish generated media to the
              public gallery. Showcase items are curated explicitly.
            </p>
          </div>

          {SECTIONS.map((section) => (
            <section
              key={section.title}
              className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                {section.body}
              </p>
            </section>
          ))}

          <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[#5f5bf6]" />
              <h2 className="text-xl font-semibold">8. Contact</h2>
            </div>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              For privacy questions, contact{" "}
              <a
                href="mailto:ai@alphogen.com"
                className="font-semibold text-neutral-950 underline-offset-4 hover:underline"
              >
                ai@alphogen.com
              </a>
              .
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
