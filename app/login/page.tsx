"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Loader2, Mail } from "lucide-react";
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
        // Try password login first
        if (password) {
          const { error: signInError } =
            await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
          if (signInError) throw signInError;
          router.push("/home");
        } else {
          // Magic link
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
    <div className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">
              AlphoGenAI
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered video creation platform
          </p>
        </div>

        {magicLinkSent ? (
          <div className="rounded-2xl border border-border/50 bg-card/80 p-8 text-center backdrop-blur-sm">
            <Mail className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h2 className="text-lg font-semibold mb-1">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a login link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card/80 p-8 backdrop-blur-sm">
            <h2 className="mb-6 text-lg font-semibold text-center">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 w-full rounded-lg border border-border bg-background/50 px-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Password{" "}
                  {mode === "login" && (
                    <span className="text-muted-foreground/50">
                      (optional — leave empty for magic link)
                    </span>
                  )}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "login" ? "Enter password or leave empty" : "Create a password"
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background/50 px-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "login" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === "login"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
