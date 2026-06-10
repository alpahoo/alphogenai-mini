"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/home`,
          },
        });
        if (signUpError) throw signUpError;
        setMagicLinkSent(true);
      } else {
        if (password) {
          const { error: signInError } =
            await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
          if (signInError) throw signInError;
          router.push("/home");
        } else {
          const { error: otpError } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
              emailRedirectTo: `${window.location.origin}/home`,
            },
          });
          if (otpError) throw otpError;
          setMagicLinkSent(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-8 px-5 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden min-h-[calc(100vh-3rem)] flex-col justify-between rounded-[32px] bg-neutral-950 p-8 text-white shadow-2xl shadow-black/20 lg:flex">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-5 w-5 text-[#baff3b]" />
            AlphoGen
          </Link>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              Production workspace
            </p>
            <h1 className="mt-5 max-w-2xl text-6xl font-semibold leading-[0.94] tracking-tight">
              Pick up where your video direction stopped.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/65">
              Your projects, references, saved looks, UGC briefs, and gallery
              drafts stay private inside the studio until you decide otherwise.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {["Director", "Assets", "Studio"].map((item) => (
              <div key={item} className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-semibold">{item}</p>
                <p className="mt-1 text-xs text-white/45">Ready</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center py-10 lg:min-h-0">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between">
              <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-5 w-5 text-[#5f5bf6]" />
                AlphoGen
              </Link>
              <Link
                href="/gallery"
                className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
              >
                Gallery
              </Link>
            </div>

            {magicLinkSent ? (
              <div className="rounded-[28px] border border-black/10 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100">
                  <Mail className="h-6 w-6" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold">Check your email</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  We sent a secure login link to <strong>{email}</strong>.
                </p>
              </div>
            ) : (
              <div className="rounded-[28px] border border-black/10 bg-white p-7 shadow-sm">
                <div className="mb-7">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#f4f1ea] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Private studio access
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight">
                    {mode === "login" ? "Welcome back" : "Create your studio"}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {mode === "login"
                      ? "Sign in with your password, or leave it empty to receive a secure magic link."
                      : "Create an account to save projects, references, and generation history."}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-12 w-full rounded-2xl border border-black/10 bg-[#f8f7f3] px-4 text-sm outline-none transition focus:border-neutral-950"
                      disabled={loading}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === "login"
                          ? "Password or magic link"
                          : "Create a password"
                      }
                      className="h-12 w-full rounded-2xl border border-black/10 bg-[#f8f7f3] px-4 text-sm outline-none transition focus:border-neutral-950"
                      disabled={loading}
                    />
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        {mode === "login" ? "Enter studio" : "Create account"}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError(null);
                  }}
                  className="mt-5 w-full text-center text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
                >
                  {mode === "login"
                    ? "New to AlphoGen? Create an account"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
