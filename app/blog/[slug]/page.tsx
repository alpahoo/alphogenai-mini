import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { POSTS, getPostBySlug, formatPostDate } from "@/lib/blog-posts";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post not found — AlphoGen" };

  return {
    title: `${post.title} — AlphoGen`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="relative overflow-hidden px-4 py-16 sm:py-24">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        {/* Header */}
        <header className="mb-10">
          <div className="mb-4 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-border/60 bg-card/60 px-2.5 py-1 font-medium text-foreground/80 backdrop-blur-sm">
              {post.category}
            </span>
            <span className="text-muted-foreground">
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              <span className="mx-2" aria-hidden>
                ·
              </span>
              {post.readTime}
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{post.excerpt}</p>
        </header>

        {/* Cover */}
        <div
          className={`relative mb-12 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-gradient-to-br ${post.gradient}`}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl font-bold tracking-tight text-foreground/90 mix-blend-overlay sm:text-8xl">
              {post.coverWord}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-6 text-foreground/90">
          {post.body.map((block, i) => {
            if (block.type === "h2") {
              return (
                <h2
                  key={i}
                  className="mt-10 text-2xl font-semibold tracking-tight"
                >
                  {block.text}
                </h2>
              );
            }
            if (block.type === "ul") {
              return (
                <ul
                  key={i}
                  className="ml-5 list-disc space-y-2 text-base leading-relaxed"
                >
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i} className="text-base leading-relaxed sm:text-lg">
                {block.text}
              </p>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-border/50 pt-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All posts
          </Link>
        </div>
      </div>
    </article>
  );
}
