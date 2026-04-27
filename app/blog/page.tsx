import type { Metadata } from "next";
import Link from "next/link";
import { POSTS, formatPostDate } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog — AlphoGen",
  description:
    "Updates, architecture deep dives, and behind-the-scenes from the team building AlphoGen.",
  openGraph: {
    title: "Blog — AlphoGen",
    description:
      "Updates, architecture deep dives, and behind-the-scenes from the team building AlphoGen.",
    type: "website",
  },
};

export default function BlogIndexPage() {
  return (
    <div className="relative overflow-hidden px-4 py-16 sm:py-24">
      {/* Background gradient orbs — same language as homepage / about */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Hero */}
        <section className="text-center">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">
            Blog
          </h2>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Notes from the studio
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Engineering updates, architecture deep dives, and behind-the-scenes
            from the team building AlphoGen.
          </p>
        </section>

        {/* Posts grid */}
        <section className="mt-16">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm transition-all hover:border-border hover:bg-card/60"
              >
                {/* Cover */}
                <div
                  className={`relative aspect-[16/10] w-full bg-gradient-to-br ${post.gradient}`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl font-bold tracking-tight text-foreground/90 mix-blend-overlay sm:text-6xl">
                      {post.coverWord}
                    </span>
                  </div>
                  <div className="absolute left-4 top-4">
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                      {post.category}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="mb-2 text-lg font-semibold leading-snug transition-colors group-hover:text-primary">
                    {post.title}
                  </h3>
                  <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">
                    {post.excerpt}
                  </p>
                  <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                    <span aria-hidden>·</span>
                    <span>{post.readTime}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <section className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            More articles coming as we ship. Want to be notified?{" "}
            <a
              href="mailto:contact@alphogen.com"
              className="text-foreground underline-offset-4 hover:underline"
            >
              contact@alphogen.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
