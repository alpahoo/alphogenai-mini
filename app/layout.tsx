import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const TITLE = "AlphoGen — AI Video Generation Studio";
const DESCRIPTION =
  "AI-powered video generation for creators, marketers, and content teams. Turn text and images into broadcast-quality video in seconds.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · AlphoGen",
  },
  description: DESCRIPTION,
  keywords: [
    "AI video",
    "text to video",
    "image to video",
    "video generation",
    "generative AI",
    "AI video studio",
    "Seedance",
    "Wan 2.6",
  ],
  applicationName: "AlphoGen",
  authors: [{ name: "AlphoGen" }],
  creator: "AlphoGen",
  publisher: "AlphoGen",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "AlphoGen",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@alphogenai",
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    // TikTok domain verification
    "tiktok-domain-verification": "hq3rJetYb0yoqEc9U9eYuRTV3ZDGQCaY",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <SiteShell>{children}</SiteShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
