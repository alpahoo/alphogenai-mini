"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Wand2,
  User,
  Mic,
  FileText,
  Upload,
  CheckCircle2,
  Crown,
  Monitor,
  Smartphone,
  Hand,
  Volume2,
  ImagePlus,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { JobPlan } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface HeyGenVoice {
  voiceId: string;
  name: string;
  language: string;
  gender: string;
  isCloned: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CreateAvatarPage() {
  const router = useRouter();

  // Auth & plan
  const [plan, setPlan] = useState<JobPlan>("free");
  const [planLoaded, setPlanLoaded] = useState(false);

  // Step 1: Avatar (photo)
  const [avatarId, setAvatarId] = useState("");
  const [avatarImagePreview, setAvatarImagePreview] = useState<string | null>(null);
  const [creatingAvatar, setCreatingAvatar] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);

  // Step 2: Voice
  const [voices, setVoices] = useState<HeyGenVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceSearchQuery, setVoiceSearchQuery] = useState("");
  const [cloningVoice, setCloningVoice] = useState(false);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);

  // Step 3: Script & options
  const [scriptText, setScriptText] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");

  // Submit
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch plan & voices on mount ───────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", user.id)
            .single();
          if (profile?.plan === "pro" || profile?.plan === "premium") {
            setPlan(profile.plan as JobPlan);
          }
        }
      } catch { /* default free */ }
      finally { setPlanLoaded(true); }
    }
    init();

    // Fetch HeyGen voices
    fetch("/api/heygen")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => {
        if (Array.isArray(data.voices)) setVoices(data.voices);
      })
      .catch(() => { /* silent */ });
  }, []);

  // ── Upload avatar photo ────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Image too large (max 10MB)");
      return;
    }

    setAvatarImagePreview(URL.createObjectURL(file));
    setCreatingAvatar(true);
    setError(null);

    try {
      // Upload to R2 first
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Image upload failed");
      const uploadData = await uploadRes.json();
      const imageUrl = uploadData.url;

      // Create HeyGen photo avatar
      const res = await fetch("/api/heygen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_avatar",
          image_url: imageUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar creation failed");

      setAvatarId(data.avatar_id);
      setAvatarReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Avatar creation failed");
      setAvatarImagePreview(null);
    } finally {
      setCreatingAvatar(false);
    }
  };

  // ── Upload voice sample ────────────────────────────────────────────────
  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setError("Audio too large (max 25MB)");
      return;
    }

    setCloningVoice(true);
    setError(null);

    try {
      // Upload audio to R2
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Audio upload failed");
      const uploadData = await uploadRes.json();

      // Clone voice via HeyGen
      const res = await fetch("/api/heygen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone_voice",
          audio_url: uploadData.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Voice cloning failed");

      setClonedVoiceId(data.voice_id);
      setVoiceId(data.voice_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice cloning failed");
    } finally {
      setCloningVoice(false);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avatarId || !voiceId || !scriptText.trim()) {
      setError("Please complete all steps: upload photo, select voice, and write your script.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scriptText.trim(),
          preferred_engine: "heygen_avatar_iv",
          avatar_id: avatarId,
          voice_id: voiceId,
          motion_prompt: motionPrompt.trim() || undefined,
          aspect_ratio: aspectRatio,
          audio_mode: "none", // Avatar handles its own audio
          target_duration_seconds: 60, // HeyGen determines from script
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server error. Please retry.");
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create avatar video");

      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  // Estimated duration from script (~150 words per minute)
  const wordCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.max(5, Math.ceil((wordCount / 150) * 60));
  const estimatedCost = ((estimatedDuration / 60) * 3).toFixed(2);

  // Filtered voices for search
  const filteredVoices = voices.filter(
    (v) =>
      !voiceSearchQuery ||
      v.name.toLowerCase().includes(voiceSearchQuery.toLowerCase()) ||
      v.language.toLowerCase().includes(voiceSearchQuery.toLowerCase())
  );
  const clonedVoices = filteredVoices.filter((v) => v.isCloned);
  const stockVoices = filteredVoices.filter((v) => !v.isCloned);

  // ── Plan gate ──────────────────────────────────────────────────────────
  if (planLoaded && plan !== "premium") {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-purple-500/10">
            <Crown className="h-10 w-10 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Premium Feature</h1>
          <p className="text-muted-foreground mb-6">
            Avatar IV creates a digital twin from your photo that speaks with your cloned voice.
            This feature is available on the Premium plan.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-8 py-3 text-base font-semibold text-white shadow-lg transition-all hover:brightness-110"
          >
            <Crown className="h-5 w-5" />
            Upgrade to Premium
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Form                                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <Link
          href="/create"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Avatar Video</h1>
              <p className="mt-0.5 text-base text-muted-foreground">
                Create a talking avatar from your photo and voice.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-8">
            {/* ── STEP 1: Avatar Photo ─────────────────────────────── */}
            <div className="rounded-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${avatarReady ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"}`}>
                  {avatarReady ? <CheckCircle2 className="h-4 w-4" /> : "1"}
                </div>
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-cyan-500" />
                    Upload your photo
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Clear portrait photo, face visible. JPG/PNG, max 10MB.
                  </p>
                </div>
              </div>

              {avatarImagePreview ? (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img
                      src={avatarImagePreview}
                      alt="Avatar"
                      className="h-32 w-32 rounded-xl border border-border/40 object-cover shadow-sm"
                    />
                    {creatingAvatar && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    {avatarReady ? (
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Avatar created successfully
                      </div>
                    ) : creatingAvatar ? (
                      <p className="text-sm text-muted-foreground">Creating avatar...</p>
                    ) : null}
                    {avatarReady && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ID: {avatarId.slice(0, 12)}...
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex h-32 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border/50 bg-card/50 text-sm text-muted-foreground transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={loading}
                  />
                  <span className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground/40" />
                    <span>Drop your portrait photo or click to upload</span>
                  </span>
                </label>
              )}
            </div>

            {/* ── STEP 2: Voice Selection ──────────────────────────── */}
            <div className="rounded-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${voiceId ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"}`}>
                  {voiceId ? <CheckCircle2 className="h-4 w-4" /> : "2"}
                </div>
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Mic className="h-4 w-4 text-cyan-500" />
                    Choose a voice
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Clone your voice or select a stock voice.
                  </p>
                </div>
              </div>

              {/* Clone voice upload */}
              <div className="mb-4">
                <label className="flex items-center gap-3 rounded-lg border border-dashed border-border/50 bg-card/50 px-4 py-3 cursor-pointer transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5">
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/mp3,audio/x-wav"
                    onChange={handleVoiceUpload}
                    className="hidden"
                    disabled={loading || cloningVoice}
                  />
                  {cloningVoice ? (
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                  ) : clonedVoiceId ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-muted-foreground/50" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {clonedVoiceId
                        ? "Voice cloned successfully"
                        : cloningVoice
                          ? "Cloning voice..."
                          : "Upload a voice sample to clone"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MP3 or WAV, 30s-5min recommended
                    </p>
                  </div>
                </label>
              </div>

              {/* Voice search */}
              <input
                type="text"
                value={voiceSearchQuery}
                onChange={(e) => setVoiceSearchQuery(e.target.value)}
                placeholder="Search voices by name or language..."
                className="w-full mb-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
              />

              {/* Cloned voices first */}
              {clonedVoices.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Your voices
                  </p>
                  <div className="grid gap-1.5 max-h-32 overflow-y-auto">
                    {clonedVoices.map((v) => (
                      <button
                        key={v.voiceId}
                        type="button"
                        onClick={() => setVoiceId(v.voiceId)}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                          voiceId === v.voiceId
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-border/30 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <Mic className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium truncate">{v.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{v.language}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock voices */}
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Stock voices
              </p>
              <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                {stockVoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 py-4 text-center">
                    {voices.length === 0 ? "Loading voices..." : "No voices match your search"}
                  </p>
                ) : (
                  stockVoices.slice(0, 20).map((v) => (
                    <button
                      key={v.voiceId}
                      type="button"
                      onClick={() => setVoiceId(v.voiceId)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                        voiceId === v.voiceId
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-border/30 hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      <span className="font-medium truncate">{v.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {v.language} {v.gender ? `· ${v.gender}` : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── STEP 3: Script ───────────────────────────────────── */}
            <div className="rounded-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${scriptText.trim().length > 10 ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"}`}>
                  {scriptText.trim().length > 10 ? <CheckCircle2 className="h-4 w-4" /> : "3"}
                </div>
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-500" />
                    Write your script
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    The text your avatar will speak. ~150 words per minute.
                  </p>
                </div>
              </div>

              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="Hello, I'm excited to introduce myself for this role. I have 5 years of experience in..."
                rows={6}
                maxLength={5000}
                className="w-full rounded-xl border border-border bg-card p-4 text-base text-foreground shadow-sm placeholder:text-muted-foreground/40 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
                disabled={loading}
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground/50">
                <span>{wordCount} words · ~{estimatedDuration}s</span>
                <span>{scriptText.length}/5000</span>
              </div>
            </div>

            {/* ── Options ──────────────────────────────────────────── */}
            <div className="rounded-xl border border-border/50 p-6 space-y-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Options
              </h3>

              {/* Format */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-500" />
                  Format
                </p>
                <div className="flex gap-2">
                  {[
                    { value: "16:9" as const, icon: Monitor, label: "Landscape", desc: "16:9" },
                    { value: "9:16" as const, icon: Smartphone, label: "Portrait", desc: "9:16" },
                  ].map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setAspectRatio(f.value)}
                      className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        aspectRatio === f.value
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <f.icon className="h-4 w-4" />
                      {f.label}
                      <span className="text-xs text-muted-foreground/60">{f.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Motion prompt */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Hand className="h-4 w-4 text-purple-500" />
                  Motion prompt
                  <span className="text-xs text-muted-foreground/50 font-normal">(optional)</span>
                </p>
                <input
                  type="text"
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value)}
                  placeholder="e.g. confident posture, open hand gestures, warm smile..."
                  maxLength={300}
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                />
                <p className="text-xs text-muted-foreground/50 mt-1.5">
                  Control gestures and body language in natural language.
                </p>
              </div>
            </div>

            {/* ── Error ────────────────────────────────────────────── */}
            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* ── Generate CTA ─────────────────────────────────────── */}
            <button
              type="submit"
              disabled={loading || !avatarId || !voiceId || !scriptText.trim()}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-4 text-base font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:brightness-110 hover:shadow-lg hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating avatar video...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  Generate Avatar Video
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Preview / Info                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex w-80 flex-col border-l border-border/40 bg-muted/20 p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col h-full"
        >
          {/* Avatar preview */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {avatarImagePreview ? (
              <div className="w-full max-w-[200px]">
                <img
                  src={avatarImagePreview}
                  alt="Avatar preview"
                  className="w-full rounded-2xl border border-border/40 shadow-lg"
                />
                {avatarReady && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Avatar ready
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full aspect-square max-w-[200px] rounded-2xl border border-dashed border-border/50 bg-card/50 flex flex-col items-center justify-center gap-3">
                <User className="h-12 w-12 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/40 text-center px-4">
                  Upload a photo to preview your avatar
                </p>
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="mt-6 rounded-xl border border-border/40 bg-card p-5 space-y-3 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estimation
            </h3>

            <div className="space-y-2.5 text-sm text-muted-foreground">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-500" />
                  Words
                </span>
                <span className="font-semibold text-foreground">{wordCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-cyan-500" />
                  Duration
                </span>
                <span className="font-semibold text-foreground">~{estimatedDuration}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-purple-500" />
                  Est. cost
                </span>
                <span className="font-semibold text-foreground">~${estimatedCost}</span>
              </div>

              <div className="pt-2 border-t border-border/30">
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${avatarReady ? "bg-green-400" : "bg-zinc-600"}`} />
                  <span className="text-xs">{avatarReady ? "Photo avatar ready" : "Upload photo"}</span>
                </div>
                <div className="flex items-start gap-2 mt-1.5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${voiceId ? "bg-green-400" : "bg-zinc-600"}`} />
                  <span className="text-xs">{voiceId ? "Voice selected" : "Select a voice"}</span>
                </div>
                <div className="flex items-start gap-2 mt-1.5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${scriptText.trim().length > 10 ? "bg-green-400" : "bg-zinc-600"}`} />
                  <span className="text-xs">{scriptText.trim().length > 10 ? "Script ready" : "Write your script"}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
