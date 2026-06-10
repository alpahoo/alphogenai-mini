import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { POSTS, formatPostDate } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog - AlphoGen",
  description:
    "Product notes, architecture essays, and studio updates from AlphoGen.",
  openGraph: {
    title: "Blog - AlphoGen",
    description:
      "Product notes, architecture essays, and studio updates from AlphoGen.",
    type: "website",
  },
};

export default function BlogIndexPage() {
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

      <section className="mx-auto max-w-7xl px-5 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-700">
              <BookOpen className="h-4 w-4 text-[#5f5bf6]" />
              Notes from the studio
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.96] tracking-tight sm:text-7xl">
              Product thinking behind directed AI video.
            </h1>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-neutral-600">
            Architecture notes, workflow decisions, and product essays from the
            AlphoGen studio.
          </p>
        </div>

        <section className="mt-12 grid gap-5 md:grid-cols-2">
          {POSTS.map((post, index) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className={`group overflow-hidden rounded-[32px] border border-black/10 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
                index === 0 ? "bg-neutral-950 text-white" : "bg-white text-neutral-950"
              }`}
            >
              <div
                className={`flex aspect-[16/9] items-end justify-between p-6 ${
                  index === 0
                    ? "bg-[radial-gradient(circle_at_20%_20%,rgba(186,255,59,0.22),transparent_24%),linear-gradient(135deg,#111,#343026_54%,#101010)]"
                    : "bg-[#ebe7dc]"
                }`}
              >
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-950">
                  {post.category}
                </span>
                <span
                  className={`text-6xl font-semibold tracking-tight ${
                    index === 0 ? "text-white/20" : "text-neutral-950/10"
                  }`}
                >
                  {post.coverWord}
                </span>
              </div>
              <div className="p-6">
                <div
                  className={`mb-4 flex items-center gap-2 text-xs ${
                    index === 0 ? "text-white/45" : "text-neutral-500"
                  }`}
                >
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                  <span aria-hidden>·</span>
                  <span>{post.readTime}</span>
                </div>
                <h2 className="text-2xl font-semibold leading-tight tracking-tight">
                  {post.title}
                </h2>
                <p
                  className={`mt-4 line-clamp-3 text-sm leading-7 ${
                    index === 0 ? "text-white/65" : "text-neutral-600"
                  }`}
                >
                  {post.excerpt}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                  Read note
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-12 rounded-[28px] border border-black/10 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-[#5f5bf6]" />
                More notes are coming
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                We publish when a product decision is worth documenting.
              </p>
            </div>
            <a
              href="mailto:ai@alphogen.com"
              className="text-sm font-semibold underline-offset-4 hover:underline"
            >
              ai@alphogen.com
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}
