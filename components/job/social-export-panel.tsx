"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Download,
  Copy,
  Check,
  Smartphone,
  Square,
  Monitor,
  Sparkles,
  Crown,
  Image as ImageIcon,
  LogOut,
  Package,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import type { SocialMetadata } from "@/lib/social-metadata";
import type { JobScene } from "@/lib/types";
import { ThumbnailPicker } from "./thumbnail-picker";

interface SocialExportPanelProps {
  jobId: string;
  plan: string;
  videoUrl: string;
  existingExports?: Record<string, string>;
  youtubeConnected?: boolean;
  tiktokConnected?: boolean;
  instagramConnected?: boolean;
  channelNames?: Record<string, string>;
  /** Scenes for thumbnail picker */
  scenes?: JobScene[];
}

const FORMATS = [
  { key: "tiktok", label: "TikTok / Reels", ratio: "9:16", icon: Smartphone, color: "text-pink-400", bg: "bg-pink-500/10" },
  { key: "instagram", label: "Instagram", ratio: "1:1", icon: Square, color: "text-purple-400", bg: "bg-purple-500/10" },
  { key: "youtube", label: "YouTube", ratio: "16:9", icon: Monitor, color: "text-red-400", bg: "bg-red-500/10" },
] as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SocialExportPanel({
  jobId,
  plan,
  videoUrl,
  existingExports,
  youtubeConnected,
  tiktokConnected,
  instagramConnected,
  channelNames = {},
  scenes = [],
}: SocialExportPanelProps) {
  const [exports, setExports] = useState<Record<string, string>>(existingExports || {});
  const [exporting, setExporting] = useState(false);
  const [metadata, setMetadata] = useState<SocialMetadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    existingExports?.thumbnail ?? null,
  );
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Collapsible sections
  const [showFormats, setShowFormats] = useState(true);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);
  const [showPublish, setShowPublish] = useState(false);

  // Local connection state
  const [ytConnected, setYtConnected] = useState(youtubeConnected ?? false);
  const [ttConnected, setTtConnected] = useState(tiktokConnected ?? false);
  const [igConnected, setIgConnected] = useState(instagramConnected ?? false);

  const isFree = plan === "free";

  // Auto-generate metadata on mount (lazy)
  useEffect(() => {
    if (isFree || metadata || loadingMeta) return;
    const timer = setTimeout(() => {
      handleGenerateMetadata();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = async (platform: "youtube" | "tiktok" | "instagram") => {
    if (!confirm(`Disconnect ${platform}?`)) return;
    setDisconnecting(platform);
    try {
      const res = await fetch("/api/auth/social/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (res.ok) {
        if (platform === "youtube") setYtConnected(false);
        if (platform === "tiktok") setTtConnected(false);
        if (platform === "instagram") setIgConnected(false);
        setPublishResult(null);
      }
    } catch (e) {
      console.error("Disconnect failed:", e);
    } finally {
      setDisconnecting(null);
    }
  };

  const publishToYouTube = async () => {
    if (!metadata) return;
    if (!confirm(`Publish to YouTube as "${metadata.title}"?`)) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/publish/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadata.title,
          description: metadata.description_youtube,
          tags: metadata.hashtags.map((h: string) => h.replace("#", "")),
          privacy: "unlisted",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPublishResult({ url: data.youtube_url });
      } else {
        setPublishResult({ error: data.error });
      }
    } catch (e) {
      setPublishResult({ error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setPublishing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/export-social`, { method: "POST" });
      const data = await res.json();

      if (data.formats && !data.status) {
        setExports(data.formats);
        setExporting(false);
        return;
      }

      if (data.status === "processing") {
        if (data.formats) setExports(data.formats);
        const maxPolls = 36;
        for (let i = 0; i < maxPolls; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const poll = await fetch(`/api/jobs/${jobId}/export-social`);
          const pollData = await poll.json();
          if (pollData.ready && pollData.formats) {
            setExports(pollData.formats);
            break;
          }
        }
      }
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateMetadata = useCallback(async () => {
    if (loadingMeta) return;
    setLoadingMeta(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/generate-metadata`, { method: "POST" });
      const data = await res.json();
      if (data.metadata) setMetadata(data.metadata);
    } catch (e) {
      console.error("Metadata generation failed:", e);
    } finally {
      setLoadingMeta(false);
    }
  }, [jobId, loadingMeta]);

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Free gate
  if (isFree) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Social Media Pack</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Export your video in TikTok, Instagram, and YouTube formats with
          AI-generated titles, hashtags, and custom thumbnails.
        </p>
        <Link
          href="/pricing"
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2.5 text-xs font-semibold text-white hover:brightness-110"
        >
          <Crown className="h-3.5 w-3.5" />
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  const hasExports = exports.tiktok && exports.instagram && exports.youtube;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Social Media Pack</h3>
        </div>
        {loadingMeta && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading AI copy...
          </span>
        )}
      </div>

      {/* ── Section: Formats ──────────────────────────────── */}
      <CollapsibleSection
        title="Video Formats"
        open={showFormats}
        onToggle={() => setShowFormats((p) => !p)}
        trailing={
          !hasExports ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleExport(); }}
              disabled={exporting}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {exporting ? "..." : "Export"}
            </button>
          ) : (
            <span className="text-[10px] text-green-400 flex items-center gap-1">
              <Check className="h-3 w-3" /> Ready
            </span>
          )
        }
      >
        <div className="space-y-2">
          {FORMATS.map((fmt) => {
            const url = exports[fmt.key] || (fmt.key === "youtube" ? videoUrl : null);
            return (
              <div
                key={fmt.key}
                className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-md p-1.5 ${fmt.bg}`}>
                    <fmt.icon className={`h-3.5 w-3.5 ${fmt.color}`} />
                  </div>
                  <div>
                    <span className="text-xs font-medium">{fmt.label}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">{fmt.ratio}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Mini preview */}
                  {url && (
                    <div className={`hidden sm:block ${
                      fmt.ratio === "9:16" ? "w-6 h-10" : fmt.ratio === "1:1" ? "w-8 h-8" : "w-12 h-7"
                    } rounded overflow-hidden border border-border/20 bg-black`}>
                      <video
                        src={url}
                        className="h-full w-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                      />
                    </div>
                  )}
                  {url ? (
                    <a
                      href={url}
                      download
                      className="rounded-md border border-border bg-background/50 px-2 py-1 text-[10px] font-medium hover:bg-muted/40 transition-colors"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {exporting ? "Processing..." : "Export first"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* ── Section: Thumbnail ────────────────────────────── */}
      <CollapsibleSection
        title="Thumbnail"
        open={showThumbnail}
        onToggle={() => setShowThumbnail((p) => !p)}
        trailing={
          thumbnailUrl ? (
            <span className="text-[10px] text-green-400 flex items-center gap-1">
              <Check className="h-3 w-3" /> Set
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> Pick
            </span>
          )
        }
      >
        <ThumbnailPicker
          jobId={jobId}
          scenes={scenes}
          videoUrl={videoUrl}
          initialThumbnail={thumbnailUrl}
          onThumbnailChange={setThumbnailUrl}
          title={metadata?.title}
        />
      </CollapsibleSection>

      {/* ── Section: AI Copy ──────────────────────────────── */}
      <CollapsibleSection
        title="AI-Generated Copy"
        open={showMetadata}
        onToggle={() => setShowMetadata((p) => !p)}
        trailing={
          metadata ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerateMetadata(); }}
              disabled={loadingMeta}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              title="Regenerate"
            >
              <RefreshCw className={`h-3 w-3 ${loadingMeta ? "animate-spin" : ""}`} />
            </button>
          ) : loadingMeta ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null
        }
      >
        {metadata ? (
          <div className="space-y-2.5">
            <CopyField label="Title" value={metadata.title} copied={copied} onCopy={copyToClipboard} />
            <CopyField label="Hashtags" value={metadata.hashtags.join(" ")} copied={copied} onCopy={copyToClipboard} />
            <CopyField label="TikTok / Reels" value={metadata.description_tiktok} copied={copied} onCopy={copyToClipboard} multiline />
            <CopyField label="YouTube" value={metadata.description_youtube} copied={copied} onCopy={copyToClipboard} multiline />
            <CopyField label="Instagram" value={metadata.description_instagram} copied={copied} onCopy={copyToClipboard} multiline />
          </div>
        ) : loadingMeta ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
          </div>
        ) : (
          <div className="text-center py-4">
            <button
              onClick={handleGenerateMetadata}
              className="flex mx-auto items-center gap-1.5 rounded-md border border-border bg-background/50 px-3 py-1.5 text-[10px] font-medium hover:bg-muted/40"
            >
              <Sparkles className="h-3 w-3" /> Generate AI Copy
            </button>
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section: Publish ──────────────────────────────── */}
      <CollapsibleSection
        title="Publish"
        open={showPublish}
        onToggle={() => setShowPublish((p) => !p)}
        trailing={
          <span className="text-[10px] text-muted-foreground">
            {[ytConnected, ttConnected, igConnected].filter(Boolean).length}/3 connected
          </span>
        }
      >
        <div className="space-y-2">
          {/* Publish result */}
          <AnimatePresence>
            {publishResult?.url && publishResult.url.startsWith("http") && (
              <motion.a
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                href={publishResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400 text-center hover:brightness-110"
              >
                Published! View on YouTube →
              </motion.a>
            )}
            {publishResult?.url && !publishResult.url.startsWith("http") && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-md bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400 text-center"
              >
                Posted successfully
              </motion.p>
            )}
            {publishResult?.error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive"
              >
                {publishResult.error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* YouTube */}
          <PlatformRow
            platform="youtube"
            connected={ytConnected}
            channelName={channelNames.youtube}
            hasMetadata={!!metadata}
            publishing={publishing}
            disconnecting={disconnecting}
            jobId={jobId}
            onPublish={publishToYouTube}
            onDisconnect={handleDisconnect}
            icon={Monitor}
            label="YouTube"
            color="red"
          />

          {/* TikTok */}
          <PlatformRow
            platform="tiktok"
            connected={ttConnected}
            channelName={channelNames.tiktok}
            hasMetadata={!!metadata}
            publishing={publishing}
            disconnecting={disconnecting}
            jobId={jobId}
            onPublish={async () => {
              if (!metadata || !confirm(`Post to TikTok: "${metadata.title}"?`)) return;
              setPublishing(true);
              try {
                const res = await fetch(`/api/jobs/${jobId}/publish/tiktok`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: metadata.description_tiktok }),
                });
                const data = await res.json();
                setPublishResult(data.success ? { url: "tiktok://posted" } : { error: data.error });
              } catch { setPublishResult({ error: "TikTok publish failed" }); }
              setPublishing(false);
            }}
            onDisconnect={handleDisconnect}
            icon={Smartphone}
            label="TikTok"
            color="white"
          />

          {/* Instagram */}
          <PlatformRow
            platform="instagram"
            connected={igConnected}
            channelName={channelNames.instagram}
            hasMetadata={!!metadata}
            publishing={publishing}
            disconnecting={disconnecting}
            jobId={jobId}
            onPublish={async () => {
              if (!metadata || !confirm(`Post to Instagram: "${metadata.title}"?`)) return;
              setPublishing(true);
              try {
                const res = await fetch(`/api/jobs/${jobId}/publish/instagram`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ caption: metadata.description_instagram }),
                });
                const data = await res.json();
                setPublishResult(data.success ? { url: "instagram://posted" } : { error: data.error });
              } catch { setPublishResult({ error: "Instagram publish failed" }); }
              setPublishing(false);
            }}
            onDisconnect={handleDisconnect}
            icon={Square}
            label="Instagram"
            color="purple"
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  open,
  onToggle,
  trailing,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </div>
        {trailing}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform publish row
// ---------------------------------------------------------------------------

function PlatformRow({
  platform,
  connected,
  channelName,
  hasMetadata,
  publishing,
  disconnecting,
  jobId,
  onPublish,
  onDisconnect,
  icon: Icon,
  label,
  color,
}: {
  platform: "youtube" | "tiktok" | "instagram";
  connected: boolean;
  channelName?: string;
  hasMetadata: boolean;
  publishing: boolean;
  disconnecting: string | null;
  jobId: string;
  onPublish: () => void;
  onDisconnect: (p: "youtube" | "tiktok" | "instagram") => void;
  icon: typeof Monitor;
  label: string;
  color: string;
}) {
  const colorClasses = {
    red: { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-400", btn: "bg-red-600" },
    white: { border: "border-white/20", bg: "bg-white/5", text: "text-white/70", btn: "bg-black border border-white/20" },
    purple: { border: "border-purple-500/30", bg: "bg-purple-500/5", text: "text-purple-400", btn: "bg-gradient-to-r from-purple-600 to-pink-500" },
  }[color] ?? { border: "border-border/30", bg: "bg-muted/5", text: "text-muted-foreground", btn: "bg-primary" };

  if (!connected) {
    return (
      <a
        href={`/api/auth/${platform}/connect?return_to=/jobs/${jobId}`}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border ${colorClasses.border} ${colorClasses.bg} px-4 py-2 text-xs font-medium ${colorClasses.text} hover:brightness-125 transition-all`}
      >
        <Icon className="h-3.5 w-3.5" /> Connect {label}
      </a>
    );
  }

  return (
    <div className="flex gap-1.5">
      {hasMetadata ? (
        <button
          onClick={onPublish}
          disabled={publishing}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg ${colorClasses.btn} px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50`}
        >
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
          {publishing ? "Publishing..." : `Publish to ${label}`}
        </button>
      ) : (
        <div className={`flex flex-1 items-center gap-2 rounded-lg border ${colorClasses.border} ${colorClasses.bg} px-3 py-2 text-xs ${colorClasses.text}`}>
          <Icon className="h-3.5 w-3.5" /> {channelName || `${label} connected`}
        </div>
      )}
      <button
        onClick={() => onDisconnect(platform)}
        disabled={disconnecting === platform}
        title={`Disconnect ${label}`}
        className="rounded-lg border border-border/40 bg-background/40 px-2 py-2 text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-50 transition-colors"
      >
        {disconnecting === platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy field helper
// ---------------------------------------------------------------------------

function CopyField({
  label,
  value,
  copied,
  onCopy,
  multiline = false,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  multiline?: boolean;
}) {
  const key = label.toLowerCase().replace(/\s/g, "_");
  return (
    <div className="rounded-md border border-border/20 bg-background/30 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
        <button
          onClick={() => onCopy(value, key)}
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied === key ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied === key ? "Copied" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
          {value}
        </pre>
      ) : (
        <p className="text-[11px] text-foreground">{value}</p>
      )}
    </div>
  );
}
