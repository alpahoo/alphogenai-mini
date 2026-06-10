import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service - AlphoGen",
  description: "Terms of Service for the AlphoGen AI video studio.",
};

const TERMS = [
  {
    title: "1. Acceptance of terms",
    body: "By accessing or using AlphoGen, you agree to these Terms of Service. If you do not agree, do not use the service.",
  },
  {
    title: "2. Service description",
    body: "AlphoGen is an AI video creation workspace. Users can generate, edit, organize, and export video content from prompts, references, and creative assets.",
  },
  {
    title: "3. Acceptable use",
    body: "You agree not to generate unlawful content, non-consensual impersonation, infringing material, sexual content involving minors, or content promoting violence, hate, or harm.",
  },
  {
    title: "4. User content and rights",
    body: "You retain ownership of content you create, subject to applicable third-party model and platform terms. You grant AlphoGen the limited rights needed to process, store, display, and deliver your content within the service.",
  },
  {
    title: "5. Public showcase",
    body: "Generated media is private by default. Public gallery placement requires explicit curation and may use a rewritten public title or description rather than your raw prompt.",
  },
  {
    title: "6. Subscription and billing",
    body: "Paid plans are billed monthly or annually through our payment processor. Subscriptions renew unless cancelled before the renewal date. Refunds are handled case by case.",
  },
  {
    title: "7. Service availability",
    body: "We aim to provide a reliable service, but generation availability may vary based on maintenance, capacity, model availability, network conditions, or third-party service interruptions.",
  },
  {
    title: "8. Limitation of liability",
    body: "AlphoGen is provided as is. We are not liable for indirect damages, loss of revenue, or misuse of generated content by users.",
  },
  {
    title: "9. Termination",
    body: "We may suspend or terminate accounts that violate these terms. You may stop using the service or cancel your subscription at any time.",
  },
  {
    title: "10. Governing law",
    body: "These terms are governed by French law. Disputes are subject to the competent French courts.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-sm font-semibold">
            AlphoGen
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Plans
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[32px] bg-neutral-950 p-7 text-white shadow-2xl shadow-black/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <FileText className="h-5 w-5 text-[#baff3b]" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              Legal
            </p>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-tight">
              Terms of Service
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/65">
              Last updated: June 2026. These terms define how the AlphoGen
              workspace can be used safely.
            </p>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#f4f1ea] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              Creator responsibility
            </div>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              The studio is designed for lawful creative production. You are
              responsible for prompts, references, likeness rights, and how
              generated media is used.
            </p>
          </div>

          {TERMS.map((section) => (
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
              <h2 className="text-xl font-semibold">11. Contact</h2>
            </div>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              For questions, contact{" "}
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
