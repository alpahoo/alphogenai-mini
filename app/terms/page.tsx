import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — AlphoGen",
  description:
    "Terms of Service for AlphoGen — AI-powered video generation platform.",
};

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: May 2026
          </p>
        </section>

        <div className="space-y-10 text-foreground/90">
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              1. Acceptance of terms
            </h2>
            <p className="leading-relaxed text-foreground/85">
              By accessing or using AlphoGen, you agree to these Terms of
              Service. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              2. Service description
            </h2>
            <p className="leading-relaxed text-foreground/85">
              AlphoGen is an AI-powered video generation platform. Users can
              generate video content from text prompts, images, and reference
              materials using third-party AI models orchestrated by our
              platform.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">3. Acceptable use</h2>
            <p className="leading-relaxed text-foreground/85">
              You agree NOT to use AlphoGen to generate: (a) content that
              violates applicable laws; (b) deepfakes or impersonations of
              real people without consent; (c) content infringing intellectual
              property of third parties; (d) sexually explicit content
              involving minors; (e) content promoting violence, hate, or harm.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              4. User content and rights
            </h2>
            <p className="leading-relaxed text-foreground/85">
              You retain ownership of content you create using AlphoGen,
              subject to model provider terms. You grant AlphoGen a limited
              license to process and store your content for service delivery.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              5. Subscription and billing
            </h2>
            <p className="leading-relaxed text-foreground/85">
              Paid plans are billed monthly or annually via Stripe.
              Subscriptions auto-renew unless cancelled before the renewal
              date. Refunds are handled on a case-by-case basis.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              6. Service availability
            </h2>
            <p className="leading-relaxed text-foreground/85">
              We aim for 99.9% uptime but do not guarantee uninterrupted
              service. We rely on third-party providers (Alibaba Cloud, Modal)
              whose availability may affect ours.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              7. Limitation of liability
            </h2>
            <p className="leading-relaxed text-foreground/85">
              AlphoGen is provided &quot;as is&quot;. We are not liable for
              indirect damages, loss of revenue, or content misuse by users.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">8. Termination</h2>
            <p className="leading-relaxed text-foreground/85">
              We may suspend or terminate accounts violating these terms. You
              may cancel your subscription at any time via your account
              settings.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">9. Governing law</h2>
            <p className="leading-relaxed text-foreground/85">
              These terms are governed by French law. Disputes are subject to
              French courts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">10. Contact</h2>
            <p className="leading-relaxed text-foreground/85">
              For questions, contact{" "}
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
