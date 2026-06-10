import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
  if (!post) return { title: "Post not found - AlphoGen" };

  return {
    title: `${post.title} - AlphoGen`,
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
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
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

      <article className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <header>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-neutral-700">
              {post.category}
            </span>
            <span className="text-neutral-500">
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              <span className="mx-2" aria-hidden>
                ·
              </span>
              {post.readTime}
            </span>
          </div>
          <h1 className="text-5xl font-semibold leading-[0.98] tracking-tight sm:text-7xl">
            {post.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-600">
            {post.excerpt}
          </p>
        </header>

        <div className="my-12 flex aspect-[16/9] items-end justify-between overflow-hidden rounded-[32px] bg-neutral-950 p-7 text-white shadow-2xl shadow-black/20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              AlphoGen note
            </p>
            <p className="mt-4 max-w-sm text-3xl font-semibold leading-tight">
              {post.coverWord}
            </p>
          </div>
          <span className="text-7xl font-semibold tracking-tight text-white/10">
            {post.coverWord}
          </span>
        </div>

        <div className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm sm:p-10">
          <div className="space-y-7">
            {post.body.map((block, i) => {
              if (block.type === "h2") {
                return (
                  <h2
                    key={i}
                    className="pt-5 text-3xl font-semibold tracking-tight"
                  >
                    {block.text}
                  </h2>
                );
              }
              if (block.type === "ul") {
                return (
                  <ul
                    key={i}
                    className="ml-5 list-disc space-y-2 text-base leading-8 text-neutral-700"
                  >
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={i} className="text-base leading-8 text-neutral-700">
                  {block.text}
                </p>
              );
            })}
          </div>
        </div>
      </article>
    </main>
  );
}
