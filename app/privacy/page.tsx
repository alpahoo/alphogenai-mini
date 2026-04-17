import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — AlphoGenAI",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: April 17, 2026
        </p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
            <p>
              AlphoGenAI (&quot;the Service&quot;) is operated by AlphoGen. This Privacy Policy
              explains how we collect, use, and protect your personal information when you
              use our AI video generation platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Data We Collect</h2>

            <h3 className="text-sm font-semibold text-foreground mt-4">Account Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Email address (for authentication)</li>
              <li>Subscription plan and billing status (managed via Stripe)</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-4">Usage Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Text prompts submitted for video generation</li>
              <li>Reference images/videos uploaded (stored temporarily)</li>
              <li>Generated video files (stored in Cloudflare R2)</li>
              <li>Generation metadata (engine used, cost, duration, timestamps)</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-4">Social Media Connections</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>OAuth tokens for YouTube, TikTok, and Instagram (encrypted at rest with AES-256-GCM)</li>
              <li>Channel/account names and IDs</li>
              <li>We do NOT access your followers, messages, or private content</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-4">Technical Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Error reports via Sentry (anonymized stack traces)</li>
              <li>No cookies beyond essential authentication session cookies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Generate videos based on your prompts</li>
              <li>Manage your subscription and billing</li>
              <li>Publish videos to your connected social media accounts (only when you click &quot;Publish&quot;)</li>
              <li>Send email notifications when your video is ready (you can opt out)</li>
              <li>Monitor and fix errors in the Service</li>
              <li>Improve the Service based on aggregate usage patterns</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Data Storage & Security</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Database</strong>: Supabase (PostgreSQL, hosted in US/EU)</li>
              <li><strong>Videos</strong>: Cloudflare R2 (globally distributed)</li>
              <li><strong>Payments</strong>: Stripe (PCI-DSS compliant — we never store card numbers)</li>
              <li><strong>OAuth tokens</strong>: Encrypted with AES-256-GCM before storage</li>
              <li><strong>API keys</strong>: Encrypted at rest in our database</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Supabase</strong> — Authentication and database</li>
              <li><strong>Stripe</strong> — Payment processing</li>
              <li><strong>Modal</strong> — GPU compute for video generation</li>
              <li><strong>Cloudflare R2</strong> — Video and image storage</li>
              <li><strong>Sentry</strong> — Error monitoring (anonymized)</li>
              <li><strong>Resend</strong> — Transactional emails</li>
              <li><strong>Kie.ai / EvoLink.ai</strong> — AI video generation APIs</li>
              <li><strong>Google / YouTube</strong> — Video publishing (OAuth)</li>
              <li><strong>TikTok</strong> — Video publishing (OAuth)</li>
              <li><strong>Meta / Instagram</strong> — Video publishing (OAuth)</li>
            </ul>
            <p>
              Each service has its own privacy policy. We encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Data Sharing</h2>
            <p>We do NOT sell your personal data. We share data only:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>With third-party services listed above (for service operation)</li>
              <li>When required by law</li>
              <li>With your explicit consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access</strong> your personal data</li>
              <li><strong>Delete</strong> your account and all associated data</li>
              <li><strong>Export</strong> your generated videos</li>
              <li><strong>Disconnect</strong> social media accounts at any time</li>
              <li><strong>Opt out</strong> of email notifications</li>
            </ul>
            <p>
              To exercise these rights, contact us at{" "}
              <a href="mailto:contact@alphogen.com" className="text-primary hover:underline">
                contact@alphogen.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Generated videos: retained until you delete them or your account</li>
              <li>Reference uploads: deleted after 24 hours if not associated with a job</li>
              <li>OAuth tokens: deleted when you disconnect the platform</li>
              <li>Account data: deleted within 30 days of account deletion request</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Children</h2>
            <p>
              The Service is not intended for users under 18 years of age. We do not
              knowingly collect data from minors.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              significant changes via email or in-app notification.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">11. Contact</h2>
            <p>
              For privacy-related questions, contact us at{" "}
              <a href="mailto:contact@alphogen.com" className="text-primary hover:underline">
                contact@alphogen.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
