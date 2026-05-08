import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — AlphoGen",
  description:
    "How AlphoGen collects, uses, and protects your personal data. GDPR-compliant.",
};

export default function PrivacyPage() {
  return (
    <div className="relative overflow-hidden px-4 py-16 sm:py-24">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Hero */}
        <section className="mb-14 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Legal
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: May 2026
          </p>
        </section>

        <div className="space-y-10 text-foreground/90">
          <section>
            <h2 className="mb-3 text-xl font-semibold">1. Introduction</h2>
            <p className="leading-relaxed text-foreground/85">
              AlphoGen (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;)
              respects your privacy and is committed to protecting your
              personal data. This privacy policy explains how we collect, use,
              and safeguard your information when you use our service at{" "}
              <a
                href="https://alphogen.com"
                className="text-primary underline-offset-4 hover:underline"
              >
                alphogen.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              2. Information we collect
            </h2>
            <p className="leading-relaxed text-foreground/85">
              We collect: (a) account information (email, password) when you
              sign up; (b) generation prompts and uploaded reference images
              for the purpose of producing AI-generated videos; (c) usage and
              billing data; (d) standard technical data (IP, browser, device)
              for security and analytics.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              3. How we use your data
            </h2>
            <p className="leading-relaxed text-foreground/85">
              Your data is used to deliver the service, process payments,
              improve product quality, and ensure platform security.
              Generation prompts and outputs are processed through third-party
              AI model providers (Alibaba Cloud Bailian) under contractual
              data protection terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              4. Data location and retention
            </h2>
            <p className="leading-relaxed text-foreground/85">
              Personal data is stored in the European Union (Alibaba Cloud
              Frankfurt region) for GDPR compliance. Generation history is
              retained for the duration of your account, with options to
              delete on demand.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              5. Third-party processors
            </h2>
            <p className="leading-relaxed text-foreground/85">
              We use Modal (GPU compute), Supabase (database and auth),
              Cloudflare R2 (storage), Alibaba Cloud (AI inference), and
              Stripe (payments). All processors are contractually bound to
              GDPR-equivalent data protection.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">6. Your rights</h2>
            <p className="leading-relaxed text-foreground/85">
              Under GDPR, you have the right to access, correct, delete,
              export, or restrict processing of your personal data. Contact
              us at{" "}
              <a
                href="mailto:ai@alphogen.com"
                className="text-primary underline-offset-4 hover:underline"
              >
                ai@alphogen.com
              </a>{" "}
              to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">7. Contact</h2>
            <p className="leading-relaxed text-foreground/85">
              For privacy questions, contact{" "}
              <a
                href="mailto:ai@alphogen.com"
                className="text-primary underline-offset-4 hover:underline"
              >
                ai@alphogen.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
