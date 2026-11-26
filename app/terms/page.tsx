import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service - AlphoGen",
  description: "Terms of Service for the AlphoGen AI video studio.",
};

type TermsSection = {
  title: string;
  body: string;
  items?: string[];
  after?: string[];
  links?: { label: string; href: string }[];
};

// LTX-2.x Community License, section 3.1: Attachment A must be an enforceable
// provision of the terms that govern the service. Items 1 to 20 restate it.
const LTX_RESTRICTIONS = [
  "in any way that violates any applicable national, federal, state, local or international law or regulation;",
  "to exploit or harm, or attempt to exploit or harm, minors in any way;",
  "to knowingly generate or disseminate verifiably false information or content with the intent to deceive, defraud or otherwise unlawfully harm others;",
  "to generate or disseminate personally identifiable information that can be used to harm an individual;",
  "to generate or disseminate content and place it in any context (for example a bot posting messages) without expressly and intelligibly disclaiming that it is machine-generated;",
  "to defame others or to unlawfully harass others;",
  "to impersonate or attempt to impersonate others (for example deepfakes) without their consent;",
  "for fully automated decision-making that adversely impacts an individual's legal rights or otherwise creates or modifies a binding, enforceable obligation;",
  "for any use intended to, or which has the effect of, discriminating against or harming individuals or groups based on online or offline social behavior or known or predicted personal or personality characteristics;",
  "to exploit any of the vulnerabilities of a specific group of persons based on their age, social, physical or mental characteristics, in order to materially distort the behavior of a person of that group in a manner that causes or is likely to cause that person or another person physical or psychological harm;",
  "for any use intended to, or which has the effect of, discriminating against individuals or groups based on legally protected characteristics or categories;",
  "to provide medical advice or to interpret medical results;",
  "to generate or disseminate information to be used for the administration of justice, law enforcement, immigration or asylum processes, such as predicting that an individual will commit fraud or a crime;",
  "to generate or disseminate malware (including ransomware) or any other content intended to harm electronic systems;",
  "to engage in, promote, incite or facilitate discrimination or other unlawful or harmful conduct in the provision of employment, employment benefits, credit, housing or other essential goods and services;",
  "to engage in, promote, incite or facilitate the harassment, abuse, threatening or bullying of individuals or groups of individuals;",
  "for military, warfare, nuclear industries or applications, weapons development, or any use in connection with activities that may cause death, personal injury or severe physical or environmental damage;",
  "for commercial purposes, to train, improve or fine-tune any other machine learning model, artificial intelligence system or competing model;",
  "to circumvent, disable or interfere with any technical limitation, safety feature, content filter, watermark, content provenance or latent disclosure functionality, or use restriction implemented in LTX-2.x;",
  "in any product, service or application that directly competes with the commercial products or services of Lightricks, or is designed to replace or substitute them, without a separate commercial license from Lightricks.",
];

const TERMS: TermsSection[] = [
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
    title: "4. Third-party AI models and use restrictions",
    body: "Some AlphoGen features, including Parallax Shorts, run AI models provided by third parties. LTX-2.x models (such as LTX-2.5) are provided by Lightricks Ltd. under the LTX-2.x Community License. When you use a feature powered by LTX-2.x, or any output it generates, you agree to the use restrictions of Attachment A of that license and to the Lightricks Acceptable Use Policy, which are incorporated into these terms by reference, in the version in effect at the time of your use. In particular, you agree not to use LTX-2.x, its derivatives or their outputs:",
    items: LTX_RESTRICTIONS,
    after: [
      "Videos generated with AlphoGen are AI-generated. When you publish or share them, you must clearly disclose that they are machine-generated, as required by these terms and by applicable law, including the EU AI Act. You may not remove, alter, suppress or circumvent any watermark, content credential, metadata or other provenance signal attached to an output.",
      "You are responsible for making sure that anyone you share outputs with is aware of these restrictions. A breach may lead to suspension or termination under section 10. Where these terms and the LTX-2.x Community License differ on these restrictions, the license prevails.",
    ],
    links: [
      { label: "LTX-2.x Community License", href: "/legal/ltx-2-community-license.txt" },
      {
        label: "Lightricks Acceptable Use Policy",
        href: "https://static.lightricks.com/legal/ltx-acceptable-use-policy.pdf",
      },
    ],
  },
  {
    title: "5. User content and rights",
    body: "You retain ownership of content you create, subject to applicable third-party model and platform terms. You grant AlphoGen the limited rights needed to process, store, display, and deliver your content within the service.",
  },
  {
    title: "6. Public showcase",
    body: "Generated media is private by default. Public gallery placement requires explicit curation and may use a rewritten public title or description rather than your raw prompt.",
  },
  {
    title: "7. Subscription and billing",
    body: "Paid plans are billed monthly or annually through our payment processor. Subscriptions renew unless cancelled before the renewal date. Refunds are handled case by case.",
  },
  {
    title: "8. Service availability",
    body: "We aim to provide a reliable service, but generation availability may vary based on maintenance, capacity, model availability, network conditions, or third-party service interruptions.",
  },
  {
    title: "9. Limitation of liability",
    body: "AlphoGen is provided as is. We are not liable for indirect damages, loss of revenue, or misuse of generated content by users.",
  },
  {
    title: "10. Termination",
    body: "We may suspend or terminate accounts that violate these terms. You may stop using the service or cancel your subscription at any time.",
  },
  {
    title: "11. Governing law",
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
              Last updated: November 2026. These terms define how the AlphoGen
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
              {section.items && (
                <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-sm leading-7 text-neutral-600">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              )}
              {section.after?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-neutral-600">
                  {paragraph}
                </p>
              ))}
              {section.links && (
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-neutral-950 underline underline-offset-4"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[#5f5bf6]" />
              <h2 className="text-xl font-semibold">12. Contact</h2>
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
