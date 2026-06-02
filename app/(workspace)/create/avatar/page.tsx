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
  Volume2,
  ImagePlus,
  AlertTriangle,
  Play,
  Pause,
  Clapperboard,
  Clock,
} from "lucide-react";
import { useRef } from "react";
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
  previewUrl: string | null;
}

interface HeyGenAvatar {
  avatarId: string;
  name: string;
  gender: string;
  previewUrl: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CreateAvatarPage() {
  const router = useRouter();

  // Auth & plan
  const [plan, setPlan] = useState<JobPlan>("free");
  const [planLoaded, setPlanLoaded] = useState(false);

  // Existing avatars from HeyGen account
  const [existingAvatars, setExistingAvatars] = useState<HeyGenAvatar[]>([]);

  // Step 1: Avatar (photo)
  const [avatarId, setAvatarId] = useState("");
  const [avatarImagePreview, setAvatarImagePreview] = useState<string | null>(null);
  const [creatingAvatar, setCreatingAvatar] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);

  // Step 2: Voice
  const [voices, setVoices] = useState<HeyGenVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voiceId, setVoiceId] = useState("");
  const [voiceSearchQuery, setVoiceSearchQuery] = useState("");
  const [cloningVoice, setCloningVoice] = useState(false);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  // Voice preview playback
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play/pause a voice preview sample
  const togglePreview = (voice: HeyGenVoice) => {
    if (!voice.previewUrl) return;
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // If clicking the same voice that's playing → just stop
    if (playingVoiceId === voice.voiceId) {
      setPlayingVoiceId(null);
      return;
    }
    // Play the new one
    const audio = new Audio(voice.previewUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voice.voiceId);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => setPlayingVoiceId(null);
    audio.play().catch(() => setPlayingVoiceId(null));
  };

  // Mode: presenter (Avatar IV talking head) vs cinematic (Avatar Shots / Seedance 2)
  const [mode, setMode] = useState<"presenter" | "cinematic">("presenter");

  // Step 3: Script & options
  const [scriptText, setScriptText] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");

  // Cinematic mode fields
  const [scenePrompt, setScenePrompt] = useState("");
  const [cinematicDuration, setCinematicDuration] = useState<5 | 10 | 15>(10);

  // Reusable Looks (saved cinematic shots → lipsync new scripts onto them)
  interface CinematicLook {
    id: string;
    name: string;
    video_url: string;
    duration_sec: number | null;
  }
  const [looks, setLooks] = useState<CinematicLook[]>([]);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  // Lip-sync quality: "speed" (cheaper, faster) or "precision" (best sync)
  const [lipsyncMode, setLipsyncMode] = useState<"speed" | "precision">("speed");

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

    // Fetch HeyGen avatars + voices
    fetch("/api/heygen")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => {
        if (Array.isArray(data.voices)) setVoices(data.voices);
        if (Array.isArray(data.avatars)) setExistingAvatars(data.avatars);
      })
      .catch(() => { /* silent */ })
      .finally(() => setVoicesLoading(false));

    // Fetch saved cinematic Looks
    fetch("/api/looks")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (Array.isArray(d.looks)) setLooks(d.looks); })
      .catch(() => { /* silent */ });

    // Stop any preview audio when leaving the page
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
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

    // Validation depends on mode. Reusing a Look needs no avatar (the Look
    // is the visual) — only a voice + script.
    const reusingLook = mode === "cinematic" && Boolean(selectedLookId);
    if (!avatarId && !reusingLook) {
      setError("Please select or upload an avatar.");
      return;
    }
    if (mode === "presenter") {
      if (!voiceId || !scriptText.trim()) {
        setError("Please select a voice and write your script.");
        return;
      }
    } else if (selectedLookId) {
      // Reusing a saved Look → only need a voice + script
      if (!scriptText.trim() || !voiceId) {
        setError("Reusing a Look needs a script and a voice.");
        return;
      }
    } else {
      // cinematic (fresh shot)
      if (!scenePrompt.trim()) {
        setError("Please describe your cinematic shot.");
        return;
      }
      // Dialogue → lip-synced in your voice, so a voice is required.
      if (scriptText.trim() && !voiceId) {
        setError("Pick a voice — your dialogue is lip-synced in your voice. Or clear it for a silent cinematic shot.");
        return;
      }
    }
    setError(null);
    setLoading(true);

    try {
      const requestBody =
        mode === "presenter"
          ? {
              prompt: scriptText.trim(),
              preferred_engine: "heygen_avatar_iv",
              avatar_id: avatarId,
              voice_id: voiceId,
              aspect_ratio: aspectRatio,
              audio_mode: "none",
              target_duration_seconds: 60,
            }
          : reusingLook
            ? {
                // Reuse a saved Look → lipsync-only (skips Seedance)
                prompt: scriptText.trim(),
                preferred_engine: "heygen_avatar_shots",
                look_id: selectedLookId,
                voice_id: voiceId,
                script_text: scriptText.trim(),
                lipsync_mode: lipsyncMode,
                audio_mode: "none",
              }
            : {
                prompt: scenePrompt.trim(),
                preferred_engine: "heygen_avatar_shots",
                avatar_id: avatarId,
                voice_id: voiceId || undefined,
                scene_prompt: scenePrompt.trim(),
                script_text: scriptText.trim() || undefined,
                lipsync_mode: lipsyncMode,
                aspect_ratio: aspectRatio,
                audio_mode: "none",
                target_duration_seconds: cinematicDuration,
              };

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

  // Cinematic estimate: dialogue auto-split into ~33-word shots (~13s each).
  // Silent shot = 1 shot at the chosen duration. Measured cost ≈ $0.12 per
  // ~15s shot (Seedance 2 launch pricing, ~$0.008/s).
  const cinematicShots = scriptText.trim()
    ? Math.max(1, Math.ceil(wordCount / 33))
    : 1;
  const cinematicSeconds = scriptText.trim()
    ? cinematicShots * 13
    : cinematicDuration;
  // With dialogue: N Seedance shots (~$0.10 each) + ONE lipsync over the whole
  // video (precision ~$0.067/s, speed ~$0.033/s). Silent: just the shots.
  const cinematicCost = scriptText.trim()
    ? (cinematicShots * 0.1 + cinematicSeconds * (lipsyncMode === "precision" ? 0.067 : 0.033)).toFixed(2)
    : (cinematicShots * 0.12).toFixed(2);

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

          {/* ── Mode toggle: Presenter vs Cinematic ─────────────────── */}
          <div className="mt-6 inline-flex rounded-xl border border-border/50 bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setMode("presenter")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                mode === "presenter"
                  ? "bg-cyan-500/15 text-cyan-400 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold">Presenter</div>
                <div className="text-[10px] opacity-70">Avatar IV · talking head</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("cinematic")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                mode === "cinematic"
                  ? "bg-cyan-500/15 text-cyan-400 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clapperboard className="h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold">Cinematic</div>
                <div className="text-[10px] opacity-70">Seedance 2 · lip-sync</div>
              </div>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-8">
            {/* ── Reuse a saved Look (cinematic) ───────────────────── */}
            {mode === "cinematic" && looks.length > 0 && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.03] p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-cyan-500" />
                    Reuse a saved Look
                    <span className="text-xs text-muted-foreground/50 font-normal">(optional — cheaper & faster)</span>
                  </h2>
                  {selectedLookId && (
                    <button
                      type="button"
                      onClick={() => setSelectedLookId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Apply a new script to a shot you already love — only the lip-sync
                  is re-generated. No avatar or shot description needed.
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {looks.map((lk) => (
                    <button
                      key={lk.id}
                      type="button"
                      onClick={() =>
                        setSelectedLookId(selectedLookId === lk.id ? null : lk.id)
                      }
                      className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                        selectedLookId === lk.id
                          ? "border-cyan-500 ring-2 ring-cyan-500/20"
                          : "border-border/30 hover:border-border"
                      }`}
                      title={lk.name}
                    >
                      <video
                        src={lk.video_url}
                        className="w-full aspect-video object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        onMouseOver={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                        onMouseOut={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                      />
                      {selectedLookId === lk.id && (
                        <div className="absolute top-1 right-1 bg-cyan-500 rounded-full p-0.5">
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {selectedLookId && (
                  <p className="mt-3 text-xs text-cyan-400/80">
                    Using this Look — skip the avatar & shot steps below. Just pick
                    a voice and write your script (keep it ~same length as the clip).
                  </p>
                )}
              </div>
            )}

            {/* ── STEP 1: Avatar Photo (hidden when reusing a Look) ── */}
            {!(mode === "cinematic" && selectedLookId) && (
            <div className="rounded-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${(avatarReady || avatarId) ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"}`}>
                  {(avatarReady || avatarId) ? <CheckCircle2 className="h-4 w-4" /> : "1"}
                </div>
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-cyan-500" />
                    Choose your avatar
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Select an existing avatar or upload a new photo.
                  </p>
                </div>
              </div>

              {/* Existing avatars from HeyGen account */}
              {existingAvatars.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Your avatars
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
                    {existingAvatars.map((a) => (
                      <button
                        key={a.avatarId}
                        type="button"
                        onClick={() => {
                          setAvatarId(a.avatarId);
                          setAvatarReady(true);
                          setAvatarImagePreview(a.previewUrl);
                        }}
                        className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                          avatarId === a.avatarId
                            ? "border-cyan-500 ring-2 ring-cyan-500/20"
                            : "border-border/30 hover:border-border"
                        }`}
                      >
                        {a.previewUrl ? (
                          <img
                            src={a.previewUrl}
                            alt={a.name}
                            className="w-full aspect-square object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-square bg-muted/30 flex items-center justify-center">
                            <User className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
                          <p className="text-[9px] text-white truncate text-center">{a.name}</p>
                        </div>
                        {avatarId === a.avatarId && (
                          <div className="absolute top-1 right-1 bg-cyan-500 rounded-full p-0.5">
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload new photo */}
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                {existingAvatars.length > 0 ? "Or upload a new photo" : "Upload your photo"}
              </p>

              {avatarImagePreview && !existingAvatars.some(a => a.avatarId === avatarId) ? (
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
            )}

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
                      <div
                        key={v.voiceId}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                          voiceId === v.voiceId
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-border/30 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        {v.previewUrl && (
                          <button
                            type="button"
                            onClick={() => togglePreview(v)}
                            className="shrink-0 rounded-full p-1 hover:bg-cyan-500/20 transition-colors"
                            title="Preview voice"
                          >
                            {playingVoiceId === v.voiceId ? (
                              <Pause className="h-3.5 w-3.5 text-cyan-400" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setVoiceId(v.voiceId)}
                          className="flex flex-1 items-center gap-3 text-left min-w-0"
                        >
                          <Mic className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium truncate">{v.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{v.language}</span>
                        </button>
                      </div>
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
                    {voicesLoading
                      ? "Loading voices..."
                      : voices.length === 0
                        ? "No voices available"
                        : "No voices match your search"}
                  </p>
                ) : (
                  stockVoices.slice(0, 30).map((v) => (
                    <div
                      key={v.voiceId}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                        voiceId === v.voiceId
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-border/30 hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      {v.previewUrl ? (
                        <button
                          type="button"
                          onClick={() => togglePreview(v)}
                          className="shrink-0 rounded-full p-1 hover:bg-cyan-500/20 transition-colors"
                          title="Preview voice"
                        >
                          {playingVoiceId === v.voiceId ? (
                            <Pause className="h-3.5 w-3.5 text-cyan-400" />
                          ) : (
                            <Play className="h-3.5 w-3.5 text-muted-foreground/70" />
                          )}
                        </button>
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      )}
                      <button
                        type="button"
                        onClick={() => setVoiceId(v.voiceId)}
                        className="flex flex-1 items-center gap-3 text-left min-w-0"
                      >
                        <span className="font-medium truncate">{v.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {v.language} {v.gender ? `· ${v.gender}` : ""}
                        </span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── STEP 3: Cinematic scene description (hidden when reusing a Look) ── */}
            {mode === "cinematic" && !selectedLookId && (
              <div className="rounded-xl border border-border/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${scenePrompt.trim().length > 10 ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"}`}>
                    {scenePrompt.trim().length > 10 ? <CheckCircle2 className="h-4 w-4" /> : "3"}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <Clapperboard className="h-4 w-4 text-cyan-500" />
                      Describe your shot
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Direct the scene: a few words are enough — AI auto-enhances
                      it into a rich cinematic shot (lighting, depth of field, grading).
                    </p>
                  </div>
                </div>

                <textarea
                  value={scenePrompt}
                  onChange={(e) => setScenePrompt(e.target.value)}
                  placeholder="She walks up to the stage and confidently presents the opening remarks, camera slowly pushing in, warm studio lighting..."
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-xl border border-border bg-card p-4 text-base text-foreground shadow-sm placeholder:text-muted-foreground/40 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
                  disabled={loading}
                />

                {/* Duration selector — only used for SILENT shots (no dialogue).
                    With dialogue, length auto-matches the speech (multi-shot). */}
                {!scriptText.trim() && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Duration <span className="text-xs text-muted-foreground/50 font-normal">(silent shot)</span>
                    </p>
                    <div className="flex gap-2">
                      {([5, 10, 15] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setCinematicDuration(d)}
                          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                            cinematicDuration === d
                              ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                              : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                          }`}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {scriptText.trim() && (
                  <p className="mt-3 text-xs text-cyan-400/80 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Duration auto-matches your dialogue — long scripts are split
                    into multiple cinematic shots and stitched together.
                  </p>
                )}
              </div>
            )}

            {/* ── STEP: Script ─────────────────────────────────────── */}
            {/* Presenter: required script. Cinematic: optional dialogue for lip-sync. */}
            <div className="rounded-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  mode === "cinematic"
                    ? "bg-primary/10 text-primary"
                    : scriptText.trim().length > 10 ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"
                }`}>
                  {mode === "presenter" && scriptText.trim().length > 10 ? <CheckCircle2 className="h-4 w-4" /> : mode === "cinematic" ? "4" : "3"}
                </div>
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-500" />
                    {mode === "cinematic" ? "Dialogue" : "Write your script"}
                    {mode === "cinematic" && (
                      <span className="text-xs text-muted-foreground/50 font-normal">(optional — for lip-sync)</span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {mode === "cinematic"
                      ? "What the avatar says, lip-synced. Leave empty for a silent cinematic shot."
                      : "The text your avatar will speak. ~150 words per minute."}
                  </p>
                </div>
              </div>

              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder={
                  mode === "cinematic"
                    ? "Success is about clarity, speed, and execution."
                    : "Hello, I'm excited to introduce myself for this role. I have 5 years of experience in..."
                }
                rows={mode === "cinematic" ? 3 : 6}
                maxLength={5000}
                className="w-full rounded-xl border border-border bg-card p-4 text-base text-foreground shadow-sm placeholder:text-muted-foreground/40 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
                disabled={loading}
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground/50">
                <span>{wordCount} words{mode === "presenter" ? ` · ~${estimatedDuration}s` : ""}</span>
                <span>{scriptText.length}/5000</span>
              </div>

              {/* Lipsync info + quality toggle — cinematic with dialogue */}
              {mode === "cinematic" && scriptText.trim() && (
                <>
                  <p className="mt-3 text-xs text-cyan-400/80 flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5" />
                    Your exact words will be lip-synced in your voice over the
                    cinematic shot.
                  </p>
                  <div className="mt-3 rounded-lg border border-border/40 bg-muted/10 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                      Lip-sync quality
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLipsyncMode("speed")}
                        className={`rounded-lg border px-3 py-2 text-left transition-all ${
                          lipsyncMode === "speed"
                            ? "border-cyan-500/50 bg-cyan-500/10"
                            : "border-border/40 hover:border-border"
                        }`}
                      >
                        <div className={`text-sm font-semibold ${lipsyncMode === "speed" ? "text-cyan-400" : "text-foreground"}`}>
                          Fast ★
                        </div>
                        <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                          ~2x cheaper, great sync. Recommended.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLipsyncMode("precision")}
                        className={`rounded-lg border px-3 py-2 text-left transition-all ${
                          lipsyncMode === "precision"
                            ? "border-cyan-500/50 bg-cyan-500/10"
                            : "border-border/40 hover:border-border"
                        }`}
                      >
                        <div className={`text-sm font-semibold ${lipsyncMode === "precision" ? "text-cyan-400" : "text-foreground"}`}>
                          Precision
                        </div>
                        <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                          Highest sync accuracy. Costs more.
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
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
              disabled={
                loading ||
                (mode === "presenter"
                  ? !avatarId || !voiceId || !scriptText.trim()
                  : selectedLookId
                    ? !voiceId || !scriptText.trim()
                    : !avatarId || !scenePrompt.trim())
              }
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
                  <Clapperboard className="h-4 w-4 text-cyan-500" />
                  Mode
                </span>
                <span className="font-semibold text-foreground">
                  {mode === "presenter" ? "Presenter" : "Cinematic"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-cyan-500" />
                  Duration
                </span>
                <span className="font-semibold text-foreground">
                  ~{mode === "presenter" ? estimatedDuration : cinematicSeconds}s
                </span>
              </div>
              {mode === "cinematic" && cinematicShots > 1 && (
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-cyan-500" />
                    Shots
                  </span>
                  <span className="font-semibold text-foreground">{cinematicShots}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-purple-500" />
                  Est. cost
                </span>
                <span className="font-semibold text-foreground">
                  ~${mode === "presenter" ? estimatedCost : cinematicCost}
                </span>
              </div>

              <div className="pt-2 border-t border-border/30">
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${avatarId ? "bg-green-400" : "bg-zinc-600"}`} />
                  <span className="text-xs">{avatarId ? "Avatar ready" : "Choose an avatar"}</span>
                </div>
                {mode === "presenter" ? (
                  <>
                    <div className="flex items-start gap-2 mt-1.5">
                      <div className={`mt-0.5 h-2 w-2 rounded-full ${voiceId ? "bg-green-400" : "bg-zinc-600"}`} />
                      <span className="text-xs">{voiceId ? "Voice selected" : "Select a voice"}</span>
                    </div>
                    <div className="flex items-start gap-2 mt-1.5">
                      <div className={`mt-0.5 h-2 w-2 rounded-full ${scriptText.trim().length > 10 ? "bg-green-400" : "bg-zinc-600"}`} />
                      <span className="text-xs">{scriptText.trim().length > 10 ? "Script ready" : "Write your script"}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 mt-1.5">
                      <div className={`mt-0.5 h-2 w-2 rounded-full ${scenePrompt.trim().length > 10 ? "bg-green-400" : "bg-zinc-600"}`} />
                      <span className="text-xs">{scenePrompt.trim().length > 10 ? "Shot described" : "Describe your shot"}</span>
                    </div>
                    <div className="flex items-start gap-2 mt-1.5">
                      <div className={`mt-0.5 h-2 w-2 rounded-full ${scriptText.trim() ? "bg-green-400" : "bg-zinc-600/50"}`} />
                      <span className="text-xs">{scriptText.trim() ? "Lip-sync dialogue set" : "Dialogue (optional)"}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
