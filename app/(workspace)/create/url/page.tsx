"use client";

// Guided URL entry.
// Product pages use the validated Product Ad pipeline and open the standard job
// result. Tutorial/news links keep the advanced Research handoff.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  Film,
  GraduationCap,
  Image as ImageIcon,
  Link2,
  Loader2,
  Newspaper,
  PlayCircle,
  Search,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Upload,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type UrlMode = "product" | "tutorial" | "news";

type ProductAdAvatar = {
  id: number;
  name: string;
  gender: string;
  thumbUrl: string | null;
  type: 0 | 1;
  kind: "public" | "custom" | "photo";
  aspectRatio: ProductAdFormat | null;
};

type ProductAdVoice = {
  id: string;
  name: string;
  language: string;
  gender: string;
  previewUrl: string | null;
};

type UserPresenter = {
  id: string;
  name: string;
  imageUrl: string | null;
  avatarId: number | null;
  status: "uploaded" | "processing" | "ready" | "failed";
  error: string | null;
  createdAt: string;
};

type ProductAdFormat = "portrait" | "square" | "landscape";
type ProductAdStyle = "Discovery" | "Storytime";
type ProductAdLength = "15" | "30" | "60";

const PRODUCT_AD_FORMATS: { value: ProductAdFormat; label: string; ratio: string }[] = [
  { value: "portrait", label: "Vertical", ratio: "9:16" },
  { value: "square", label: "Square", ratio: "1:1" },
  { value: "landscape", label: "Landscape", ratio: "16:9" },
];

const PRODUCT_AD_STYLES: { value: ProductAdStyle; label: string; description: string }[] = [
  { value: "Discovery", label: "Product discovery", description: "Hook, benefits, call to action" },
  { value: "Storytime", label: "Story-led", description: "A more personal narrative" },
];

// Simple intent choice. Each maps to a Research mode + a sensible auto-topic so the
// user only has to paste a URL. Duration defaults to 30s (kept off the first screen).
const MODES: Record<UrlMode, { label: string; desc: string; Icon: LucideIcon; topic: string; duration: number }> = {
  product: {
    label: "Product",
    desc: "Page → promo",
    Icon: ShoppingBag,
    topic:
      "Create a short product video from this page: a strong hook, the key benefits, and a clear call to action.",
    duration: 30,
  },
  tutorial: {
    label: "Tutorial",
    desc: "Docs → how-to",
    Icon: GraduationCap,
    topic:
      "Turn this page into a short tutorial: a quick intro, the key steps, limits, and a final action.",
    duration: 60,
  },
  news: {
    label: "News",
    desc: "Article → recap",
    Icon: Newspaper,
    topic:
      "Summarize this page as a short news explainer: what changed, why it matters, and what's next.",
    duration: 30,
  },
};

// Example sources — clicking one fills the URL field and picks a fitting intent.
const EXAMPLES: { label: string; hint: string; url: string; mode: UrlMode; visual: string }[] = [
  {
    label: "Product page",
    hint: "A landing/product page",
    url: "https://www.apple.com/airpods-pro/",
    mode: "product",
    visual: "linear-gradient(135deg, #eafff4, #fff 55%, #f7d8ff)",
  },
  {
    label: "Article",
    hint: "A blog post or news article",
    url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
    mode: "news",
    visual: "linear-gradient(135deg, #fff7db, #f9fbff 55%, #83e8ff)",
  },
  {
    label: "Docs page",
    hint: "Documentation or a guide",
    url: "https://nextjs.org/docs/app/getting-started",
    mode: "tutorial",
    visual: "linear-gradient(135deg, #f5f7ff, #fff 55%, #cdf4ff)",
  },
];

// Guided loading steps shown while the plan is being created. These mirror what
// the Research API does behind the scenes (one POST /api/research/jobs, then the
// plan opens) — purely informative so the wait feels guided, not a blank spinner.
const RESEARCH_LOADING_STEPS: { label: string; Icon: LucideIcon }[] = [
  { label: "Analyze URL", Icon: Search },
  { label: "Collect media", Icon: ImageIcon },
  { label: "Write script", Icon: FileText },
  { label: "Open plan", Icon: PlayCircle },
];

const PRODUCT_LOADING_STEPS: { label: string; Icon: LucideIcon }[] = [
  { label: "Analyze product", Icon: Search },
  { label: "Build ad", Icon: Sparkles },
  { label: "Start video render", Icon: Film },
  { label: "Open result", Icon: PlayCircle },
];

// Meaningful example thumbnail (a tiny page mock per source type) over the soft
// tint — replaces the abstract gradient so each example reads as what it is.
function ExampleThumb({ mode, visual }: { mode: UrlMode; visual: string }) {
  return (
    <div className="relative h-20 w-full" style={{ background: visual }}>
      <svg viewBox="0 0 200 80" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {mode === "product" && (
          <g transform="translate(36 10)">
            <rect x="0" y="0" width="128" height="60" rx="7" fill="#fff" stroke="#9ed8b8" strokeWidth="2" />
            <rect x="10" y="10" width="44" height="40" rx="5" fill="#d8f5e6" />
            <rect x="24" y="22" width="16" height="16" rx="4" fill="#8fdcb4" />
            <rect x="64" y="12" width="52" height="7" rx="3.5" fill="#a9d8c1" />
            <rect x="64" y="25" width="52" height="5" rx="2.5" fill="#d6ece1" />
            <rect x="64" y="40" width="34" height="10" rx="5" fill="#34c98a" />
          </g>
        )}
        {mode === "news" && (
          <g transform="translate(36 10)">
            <rect x="0" y="0" width="128" height="60" rx="7" fill="#fff" stroke="#9cc7ea" strokeWidth="2" />
            <rect x="12" y="10" width="80" height="8" rx="4" fill="#8fb8e0" />
            <rect x="12" y="24" width="104" height="5" rx="2.5" fill="#cfe0f2" />
            <rect x="12" y="34" width="104" height="5" rx="2.5" fill="#cfe0f2" />
            <rect x="12" y="44" width="72" height="5" rx="2.5" fill="#cfe0f2" />
          </g>
        )}
        {mode === "tutorial" && (
          <g transform="translate(36 10)">
            <rect x="0" y="0" width="128" height="60" rx="7" fill="#fff" stroke="#a8cdea" strokeWidth="2" />
            <rect x="0" y="0" width="38" height="60" rx="7" fill="#eef4fb" />
            <rect x="8" y="12" width="22" height="5" rx="2.5" fill="#bcd4ee" />
            <rect x="8" y="22" width="22" height="5" rx="2.5" fill="#d6e3f2" />
            <rect x="8" y="32" width="22" height="5" rx="2.5" fill="#d6e3f2" />
            <rect x="50" y="12" width="66" height="6" rx="3" fill="#9fc2e8" />
            <rect x="50" y="26" width="66" height="5" rx="2.5" fill="#cfe0f2" />
            <rect x="50" y="36" width="50" height="5" rx="2.5" fill="#cfe0f2" />
          </g>
        )}
      </svg>
    </div>
  );
}

function isValidHttpUrl(value: string) {
  return /^https?:\/\/\S+\.\S+/.test(value.trim());
}

const PRESENTER_UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;

async function preparePresenterImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a JPG, PNG, or WEBP portrait.");
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("This image format could not be read. Use JPG, PNG, or WEBP.");
  }
  try {
    if (bitmap.width < 512 || bitmap.height < 512) {
      throw new Error("Use a clear portrait of at least 512 x 512 pixels.");
    }

    // Product Ad presenter avatars are portrait assets. Normalizing in the
    // browser keeps the request below Vercel's body limit and gives the
    // animation provider a predictable 9:16 JPEG.
    const width = 1080;
    const height = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this portrait.");
    context.fillStyle = "#f5f5f5";
    context.fillRect(0, 0, width, height);
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob || blob.size > PRESENTER_UPLOAD_MAX_BYTES) {
      throw new Error("This portrait is still too large after preparation. Try a smaller image.");
    }
    return new File([blob], "presenter.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export default function UrlToVideo() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<UrlMode>("product");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = mode === "product" ? PRODUCT_LOADING_STEPS : RESEARCH_LOADING_STEPS;

  // Product Ad customization — presenter (avatar) + format + tone + length.
  const [avatars, setAvatars] = useState<ProductAdAvatar[]>([]);
  const [userPresenters, setUserPresenters] = useState<UserPresenter[]>([]);
  const [voices, setVoices] = useState<ProductAdVoice[]>([]);
  const [avatarId, setAvatarId] = useState<number | null>(null);
  const [avatarType, setAvatarType] = useState<0 | 1>(0);
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);
  const [paFormat, setPaFormat] = useState<ProductAdFormat>("portrait");
  const [paStyle, setPaStyle] = useState<ProductAdStyle>("Discovery");
  const [paLength, setPaLength] = useState<ProductAdLength>("30");
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [presenterName, setPresenterName] = useState("");
  const [presenterFile, setPresenterFile] = useState<File | null>(null);
  const [presenterPreview, setPresenterPreview] = useState<string | null>(null);
  const [presenterConsent, setPresenterConsent] = useState(false);
  const [presenterCreating, setPresenterCreating] = useState(false);
  const [retryingPresenterId, setRetryingPresenterId] = useState<string | null>(null);
  const [presenterError, setPresenterError] = useState<string | null>(null);

  // Load the presenter catalog once so the user can change who presents the ad.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const headers = { Authorization: "Bearer " + session.access_token };
        const [resourcesResult, presentersResult] = await Promise.allSettled([
          fetch("/api/admin/experiments/url-to-video?action=resources", { headers }),
          fetch("/api/presenters", { headers }),
        ]);
        const resourcesResponse =
          resourcesResult.status === "fulfilled" ? resourcesResult.value : null;
        const presentersResponse =
          presentersResult.status === "fulfilled" ? presentersResult.value : null;
        const json = resourcesResponse?.ok ? await resourcesResponse.json() : {};
        const presenterJson = presentersResponse?.ok ? await presentersResponse.json() : {};
        const avatarList = Array.isArray(json.avatars) ? json.avatars : [];
        const voiceList = Array.isArray(json.voices) ? json.voices : [];
        const presenterList = Array.isArray(presenterJson.presenters)
          ? presenterJson.presenters
          : [];
        if (!cancelled) {
          setAvatars(avatarList);
          setVoices(voiceList);
          setUserPresenters(presenterList);
        }
      } catch {
        /* presenter picker is optional — fall back to the default presenter */
      } finally {
        if (!cancelled) setResourcesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    return () => voicePreviewRef.current?.pause();
  }, []);

  function selectAvatar(avatar: ProductAdAvatar | null) {
    setPresenterId(null);
    setAvatarId(avatar?.id ?? null);
    setAvatarType(avatar?.type ?? 0);
    if (avatar?.aspectRatio) setPaFormat(avatar.aspectRatio);
    setError(null);
  }

  function selectUserPresenter(presenter: UserPresenter) {
    if (presenter.status !== "ready" || !presenter.avatarId) return;
    setPresenterId(presenter.id);
    setAvatarId(presenter.avatarId);
    setAvatarType(1);
    setPaFormat("portrait");
    setError(null);
  }

  function selectProductFormat(format: ProductAdFormat) {
    setPaFormat(format);
    const selectedAvatar = avatars.find(
      (avatar) => avatar.id === avatarId && avatar.type === avatarType,
    );
    if (presenterId || (selectedAvatar && selectedAvatar.aspectRatio !== format)) {
      // A user presenter is portrait, and provider avatars can also be tied to
      // one aspect ratio. Automatic always selects a compatible default.
      setPresenterId(null);
      setAvatarId(null);
      setAvatarType(0);
    }
    setError(null);
  }

  function upsertUserPresenter(presenter: UserPresenter) {
    setUserPresenters((current) => [
      presenter,
      ...current.filter((item) => item.id !== presenter.id),
    ]);
  }

  useEffect(() => {
    if (!presenterFile) {
      setPresenterPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(presenterFile);
    setPresenterPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [presenterFile]);

  async function waitForPresenter(id: string, token: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const response = await fetch("/api/presenters/" + id + "/status", {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not check presenter status.");
      const presenter = json.presenter as UserPresenter;
      upsertUserPresenter(presenter);
      if (presenter.status === "ready") return presenter;
      if (presenter.status === "failed") {
        throw new Error(presenter.error || "Presenter creation failed.");
      }
    }
    throw new Error("Presenter creation is taking longer than expected. You can return later.");
  }

  function finishPresenter(presenter: UserPresenter) {
    upsertUserPresenter(presenter);
    selectUserPresenter(presenter);
    setPresenterOpen(false);
    setPresenterName("");
    setPresenterFile(null);
    setPresenterConsent(false);
  }

  async function createMyPresenter() {
    if (!presenterFile || !presenterName.trim() || !presenterConsent) return;
    setPresenterCreating(true);
    setPresenterError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to add a presenter.");
      const token = session.access_token;
      const preparedFile = await preparePresenterImage(presenterFile);
      const form = new FormData();
      form.set("file", preparedFile);
      form.set("name", presenterName.trim());
      form.set("consent", "true");
      const uploadResponse = await fetch("/api/presenters/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: form,
      });
      const uploadJson = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadJson.error || "Could not upload the portrait.");
      let presenter = uploadJson.presenter as UserPresenter;
      upsertUserPresenter(presenter);
      if (presenter.status === "ready") {
        finishPresenter(presenter);
        return;
      }

      const generateResponse = await fetch("/api/presenters/" + presenter.id + "/generate", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...(voiceId ? { voiceId } : {}) }),
      });
      const generateJson = await generateResponse.json().catch(() => ({}));
      if (!generateResponse.ok) {
        throw new Error(generateJson.error || "Could not create the animated presenter.");
      }
      presenter = generateJson.presenter as UserPresenter;
      upsertUserPresenter(presenter);
      if (presenter.status !== "ready") {
        presenter = await waitForPresenter(presenter.id, token);
      }
      finishPresenter(presenter);
    } catch (creationError) {
      setPresenterError(
        creationError instanceof Error ? creationError.message : "Could not create the presenter.",
      );
    } finally {
      setPresenterCreating(false);
    }
  }

  async function retryUserPresenter(presenter: UserPresenter) {
    if (presenter.status !== "failed" || retryingPresenterId) return;
    setRetryingPresenterId(presenter.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to retry this presenter.");
      const token = session.access_token;
      const response = await fetch("/api/presenters/" + presenter.id + "/generate", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...(voiceId ? { voiceId } : {}) }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not retry this presenter.");
      let updated = json.presenter as UserPresenter;
      upsertUserPresenter(updated);
      if (updated.status !== "ready") updated = await waitForPresenter(updated.id, token);
      finishPresenter(updated);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Could not retry this presenter.");
    } finally {
      setRetryingPresenterId(null);
    }
  }

  function previewVoice() {
    const voice = voices.find((item) => item.id === voiceId);
    if (!voice?.previewUrl) return;
    voicePreviewRef.current?.pause();
    const audio = new Audio(voice.previewUrl);
    voicePreviewRef.current = audio;
    setPreviewingVoiceId(voice.id);
    audio.onended = () => setPreviewingVoiceId(null);
    audio.onerror = () => setPreviewingVoiceId(null);
    void audio.play().catch(() => setPreviewingVoiceId(null));
  }

  // Advance the guided loading steps while the plan is being created. The real
  // work is a single POST then a navigation, so we pace the first steps and let
  // createVideo() jump to the final "Open plan" step right before it routes.
  useEffect(() => {
    if (!creating) {
      setLoadingStep(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingStep((s) => (s < 2 ? s + 1 : s));
    }, 850);
    return () => clearInterval(id);
  }, [creating]);

  function tryExample(example?: (typeof EXAMPLES)[number]) {
    const pick = example ?? EXAMPLES[0];
    setUrl(pick.url);
    setMode(pick.mode);
    setError(null);
  }

  async function createVideo() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError("Paste a URL to continue, or upload product media manually.");
      return;
    }
    if (!isValidHttpUrl(cleanUrl)) {
      setError("Enter a valid link starting with http:// or https://");
      return;
    }

    setCreating(true);
    setStatus(mode === "product" ? "Creating your product ad…" : "Creating your video plan…");
    setError(null);
    let navigating = false;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login");
        return;
      }

      if (mode === "product") {
        const res = await fetch("/api/admin/experiments/url-to-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "submit",
            url: cleanUrl,
            style: paStyle,
            format: paFormat,
            length: paLength,
            ...(avatarId ? { avatarId, avatarType } : {}),
            ...(presenterId ? { presenterId } : {}),
            ...(voiceId ? { voiceId } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error("Product Ad generation is currently available in the private beta.");
          }
          if (res.status === 429) {
            throw new Error("The Product Ad beta reached its daily generation limit. Try again tomorrow.");
          }
          throw new Error(
            typeof json.error === "string"
              ? json.error
              : "Could not start your Product Ad. Please try again.",
          );
        }

        setStatus("Opening your video result…");
        setLoadingStep(3);
        navigating = true;
        router.push(`/jobs/${json.jobId}`);
        return;
      }

      const meta = MODES[mode];
      const res = await fetch("/api/research/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          topic: meta.topic,
          input_url: cleanUrl,
          mode,
          language: "en-US",
          target_duration_seconds: meta.duration,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not start your video.");

      setStatus("Opening your video plan…");
      setLoadingStep(3);
      navigating = true;
      router.push(`/research/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start your video.");
      setStatus(null);
    } finally {
      if (!navigating) setCreating(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
          <Link2 className="h-3.5 w-3.5" />
          URL to Video
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
          {mode === "product" ? "Turn a product page into an ad" : "Turn any link into a video"}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-neutral-500">
          {mode === "product"
            ? "Paste a product URL. Choose the presenter, voice, format, and tone before rendering."
            : "Paste an article or docs link. AlphoGen researches it and builds a ready-to-edit video plan."}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="mt-8 w-full"
      >
        {/* Intent chips */}
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          {(Object.keys(MODES) as UrlMode[]).map((key) => {
            const meta = MODES[key];
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={active}
                title={meta.desc}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                <meta.Icon className="h-4 w-4" />
                {meta.label}
              </button>
            );
          })}
        </div>

        {mode === "product" && (
          <section className="mb-4 border-y border-neutral-200 py-5 text-left" aria-label="Product ad settings">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Presenter</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Choose who appears in the ad.</p>
              </div>
              {resourcesLoading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => selectAvatar(null)}
                aria-pressed={avatarId === null}
                className={`flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition ${
                  avatarId === null
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                  <Sparkles className="h-5 w-5" />
                </span>
                <span className="w-full truncate text-[11px] font-semibold">Automatic</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPresenterError(null);
                  setPresenterOpen(true);
                }}
                className="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 bg-white p-2 text-center text-neutral-700 transition hover:border-blue-400 hover:text-blue-700"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <UserPlus className="h-5 w-5" />
                </span>
                <span className="w-full text-[11px] font-semibold">Add mine</span>
              </button>
              {userPresenters.map((presenter) => {
                const selected = presenterId === presenter.id;
                const ready = presenter.status === "ready" && Boolean(presenter.avatarId);
                const failed = presenter.status === "failed";
                const retrying = retryingPresenterId === presenter.id;
                return (
                  <button
                    key={presenter.id}
                    type="button"
                    onClick={() => failed ? void retryUserPresenter(presenter) : selectUserPresenter(presenter)}
                    disabled={(!ready && !failed) || retrying}
                    aria-pressed={selected}
                    title={ready ? presenter.name : presenter.status === "failed" ? presenter.error ?? "" : "Preparing presenter"}
                    className={
                      "relative flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition " +
                      (selected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300") +
                      (!ready && !failed ? " cursor-wait opacity-65" : "") +
                      (failed ? " border-red-200 bg-red-50/40 text-red-700 hover:border-red-300" : "")
                    }
                  >
                    <span className="relative">
                      {presenter.imageUrl ? (
                        // Private signed URLs cannot be configured as a stable Next image domain.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={presenter.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-full bg-neutral-100 object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-sm font-bold">
                          {presenter.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      {presenter.status === "processing" && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/75">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </span>
                      )}
                      {retrying && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </span>
                      )}
                    </span>
                    <span className="w-full truncate text-[11px] font-semibold">{presenter.name}</span>
                    {failed && <span className="text-[9px] font-bold uppercase">Retry</span>}
                    <span className="absolute right-1 top-1 rounded bg-neutral-900 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                      Yours
                    </span>
                  </button>
                );
              })}
              {avatars.map((avatar) => {
                const selected =
                  presenterId === null && avatarId === avatar.id && avatarType === avatar.type;
                return (
                  <button
                    key={`${avatar.type}:${avatar.id}`}
                    type="button"
                    onClick={() => selectAvatar(avatar)}
                    aria-pressed={selected}
                    title={avatar.name}
                    className={`relative flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition ${
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                    }`}
                  >
                    {avatar.thumbUrl ? (
                      // Remote catalog domains vary, so a native img keeps this picker provider-agnostic.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar.thumbUrl}
                        alt=""
                        className="h-12 w-12 rounded-full bg-neutral-100 object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-sm font-bold">
                        {avatar.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="w-full truncate text-[11px] font-semibold">{avatar.name}</span>
                    {avatar.kind !== "public" && (
                      <span className="absolute right-1 top-1 rounded bg-neutral-900 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                        Yours
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="product-ad-voice" className="text-xs font-bold text-neutral-800">
                  Voice
                </label>
                <div className="mt-1.5 flex gap-2">
                  <select
                    id="product-ad-voice"
                    value={voiceId}
                    onChange={(event) => setVoiceId(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus:border-blue-400"
                  >
                    <option value="">Automatic voice</option>
                    {voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}{voice.language ? ` - ${voice.language}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={previewVoice}
                    disabled={!voices.find((voice) => voice.id === voiceId)?.previewUrl}
                    title="Preview voice"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {previewingVoiceId === voiceId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="product-ad-style" className="text-xs font-bold text-neutral-800">
                  Tone
                </label>
                <select
                  id="product-ad-style"
                  value={paStyle}
                  onChange={(event) => setPaStyle(event.target.value as ProductAdStyle)}
                  className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus:border-blue-400"
                >
                  {PRODUCT_AD_STYLES.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label} - {style.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="text-xs font-bold text-neutral-800">Format</legend>
                <div className="mt-1.5 grid grid-cols-3 rounded-lg bg-neutral-100 p-1">
                  {PRODUCT_AD_FORMATS.map((format) => (
                    <button
                      key={format.value}
                      type="button"
                      onClick={() => selectProductFormat(format.value)}
                      aria-pressed={paFormat === format.value}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                        paFormat === format.value
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      {format.label}
                      <span className="ml-1 text-[9px] text-neutral-400">{format.ratio}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-bold text-neutral-800">Duration</legend>
                <div className="mt-1.5 grid grid-cols-3 rounded-lg bg-neutral-100 p-1">
                  {(["15", "30", "60"] as ProductAdLength[]).map((length) => (
                    <button
                      key={length}
                      type="button"
                      onClick={() => setPaLength(length)}
                      aria-pressed={paLength === length}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                        paLength === length
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      {length}s
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <p className="mt-4 text-xs text-neutral-500">
              Need exact wording?{" "}
              <Link href="/create/avatar" className="font-semibold text-neutral-800 underline underline-offset-2">
                Avatar Video uses your script verbatim.
              </Link>{" "}
              Account presenters appear first. Adding a new face here will use a dedicated consented flow.
            </p>
          </section>
        )}

        {/* URL field + primary CTA */}
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 px-3">
            <Link2 className="h-5 w-5 shrink-0 text-neutral-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) createVideo();
              }}
              placeholder="https://your-product-page.com"
              inputMode="url"
              autoFocus
              className="w-full bg-transparent py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>
          <button
            onClick={createVideo}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-80"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? "Working…" : mode === "product" ? "Create product ad" : "Create video"}
          </button>
        </div>

        {/* Try example + manual upload */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            onClick={() => tryExample()}
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            Try example
          </button>
          <span className="text-neutral-300">·</span>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="font-semibold text-neutral-600 hover:text-neutral-900"
          >
            No URL? Upload product media manually
          </button>
        </div>

        {error && (
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
            {error}
          </p>
        )}
        {status && (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-900" />
            {status}
          </div>
        )}
      </motion.div>

      {/* Example thumbnails */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.14 }}
        className="mt-10 w-full"
      >
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          Or start from an example
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => tryExample(ex)}
              className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <ExampleThumb mode={ex.mode} visual={ex.visual} />
              <div className="p-3">
                <p className="text-sm font-semibold text-neutral-900">{ex.label}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{ex.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Advanced escape hatch */}
      <div className="mt-10 flex items-center gap-1.5 text-xs text-neutral-400">
        <Film className="h-3.5 w-3.5" />
        Need sources, watchlists, or fine control?
        <Link href="/research" className="font-semibold text-neutral-600 hover:text-neutral-900">
          Open Research Studio
        </Link>
      </div>

      {/* Manual upload modal — routes to the existing Product / UGC studio (real media upload). */}
      {presenterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add my presenter"
          onClick={() => {
            if (!presenterCreating) setPresenterOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
                    <Camera className="h-5 w-5" />
                  </span>
                  <h2 className="text-lg font-bold text-neutral-900">Add my presenter</h2>
                </div>
                <p className="mt-2 text-sm text-neutral-500">
                  Upload a clear, front-facing portrait. It stays private in your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPresenterOpen(false)}
                disabled={presenterCreating}
                aria-label="Close"
                className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-[132px_1fr]">
              <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 transition hover:border-blue-400">
                {presenterPreview ? (
                  // Local object URL preview.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={presenterPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-xs font-semibold">
                    <Upload className="h-5 w-5" />
                    Choose photo
                  </span>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={presenterCreating}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPresenterFile(file);
                    setPresenterError(null);
                  }}
                />
              </label>
              <div>
                <label htmlFor="presenter-name" className="text-xs font-bold text-neutral-800">
                  Presenter name
                </label>
                <input
                  id="presenter-name"
                  value={presenterName}
                  onChange={(event) => setPresenterName(event.target.value)}
                  disabled={presenterCreating}
                  maxLength={120}
                  placeholder="e.g. My presenter"
                  className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-neutral-50"
                />
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-neutral-50 p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <label className="flex cursor-pointer gap-2 text-xs leading-relaxed text-neutral-600">
                    <input
                      type="checkbox"
                      checked={presenterConsent}
                      onChange={(event) => setPresenterConsent(event.target.checked)}
                      disabled={presenterCreating}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      I confirm that I own this image or have explicit permission from the person
                      shown to create and use an AI presenter from their likeness.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {presenterError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {presenterError}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={createMyPresenter}
                disabled={
                  presenterCreating ||
                  !presenterFile ||
                  !presenterName.trim() ||
                  !presenterConsent
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {presenterCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {presenterCreating ? "Creating presenter..." : "Create animated presenter"}
              </button>
              <button
                type="button"
                onClick={() => setPresenterOpen(false)}
                disabled={presenterCreating}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-neutral-500">
              Creating a new animated presenter uses about 2 presenter-generation credits.
            </p>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upload product media"
          onClick={() => setUploadOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-neutral-100 p-2">
                  <Upload className="h-5 w-5 text-neutral-700" />
                </span>
                <h2 className="text-lg font-bold text-neutral-900">Upload product media</h2>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-500">
              No URL? Build from your own media instead. The Product / UGC studio lets you upload
              product photos and clips, then guides you to a finished video.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <Link
                href="/create/product"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Open Product studio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided loading overlay for the selected workflow. */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Creating your video plan"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
          >
            <p className="text-center text-sm font-bold text-neutral-900">
              {mode === "product" ? "Creating your product ad" : "Building your video plan"}
            </p>
            <p className="mt-1 text-center text-xs text-neutral-500">
              {mode === "product"
                ? "We are turning the product page into a finished product ad."
                : "This usually takes a few seconds."}
            </p>
            <ol className="mt-5 space-y-2.5">
              {loadingSteps.map((step, i) => {
                const done = i < loadingStep;
                const active = i === loadingStep;
                return (
                  <li
                    key={step.label}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      active
                        ? "border-blue-300 bg-blue-50"
                        : done
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-neutral-200 bg-white"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        done
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "bg-blue-600 text-white"
                            : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      {done ? (
                        <Check className="h-4 w-4" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <step.Icon className="h-4 w-4" />
                      )}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        active ? "text-blue-800" : done ? "text-emerald-700" : "text-neutral-500"
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        </div>
      )}
    </div>
  );
}
