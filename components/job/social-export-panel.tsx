"use client";

import { useState } from "react";
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
} from "lucide-react";
import Link from "next/link";
import type { SocialMetadata } from "@/lib/social-metadata";

interface SocialExportPanelProps {
  jobId: string;
  plan: string;
  videoUrl: string;
  existingExports?: Record<string, string>;
  youtubeConnected?: boolean;
  tiktokConnected?: boolean;
  instagramConnected?: boolean;
}

const FORMATS = [
  { key: "tiktok", label: "TikTok / Reels", ratio: "9:16", icon: Smartphone, color: "text-pink-400" },
  { key: "instagram", label: "Instagram", ratio: "1:1", icon: Square, color: "text-purple-400" },
  { key: "youtube", label: "YouTube", ratio: "16:9", icon: Monitor, color: "text-red-400" },
] as const;

export function SocialExportPanel({ jobId, plan, videoUrl, existingExports, youtubeConnected, tiktokConnected, instagramConnected }: SocialExportPanelProps) {
  const [exports, setExports] = useState<Record<string, string>>(existingExports || {});
  const [exporting, setExporting] = useState(false);
  const [metadata, setMetadata] = useState<SocialMetadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    existingExports?.thumbnail ?? null
  );
  const [genThumb, setGenThumb] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Local connection state — starts from props, updated on disconnect
  const [ytConnected, setYtConnected] = useState(youtubeConnected ?? false);
  const [ttConnected, setTtConnected] = useState(tiktokConnected ?? false);
  const [igConnected, setIgConnected] = useState(instagramConnected ?? false);

  const isFree = plan === "free";

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
    if (!metadata) {
      alert("Generate metadata first (click Generate under AI Copy)");
      return;
    }
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
      if (data.formats) {
        setExports(data.formats);
      }
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateMetadata = async () => {
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
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isFree) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Export for Social Media</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Export your video in TikTok, Instagram, and YouTube formats with
          AI-generated titles, hashtags, and descriptions.
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

  const hasExports = Object.keys(exports).length > 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Export for Social</h3>
        </div>
        {!hasExports && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {exporting ? "Exporting..." : "Export Formats"}
          </button>
        )}
      </div>

      {/* Format downloads */}
      <div className="grid gap-2">
        {FORMATS.map((fmt) => {
          const url = exports[fmt.key] || (fmt.key === "youtube" ? videoUrl : null);
          return (
            <div
              key={fmt.key}
              className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <fmt.icon className={`h-4 w-4 ${fmt.color}`} />
                <div>
                  <span className="text-xs font-medium">{fmt.label}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">{fmt.ratio}</span>
                </div>
              </div>
              {url ? (
                <a
                  href={url}
                  download
                  className="rounded-md border border-border bg-background/50 px-2 py-1 text-[10px] font-medium hover:bg-muted/40"
                >
                  Download
                </a>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {exporting ? "Processing..." : "Click Export"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Thumbnail */}
      <div className="border-t border-border/30 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Thumbnail
          </h4>
          {!thumbnailUrl && (
            <button
              onClick={async () => {
                setGenThumb(true);
                try {
                  const res = await fetch(`/api/jobs/${jobId}/thumbnail`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: metadata?.title || "" }),
                  });
                  const data = await res.json();
                  if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
                } catch { /* ignore */ }
                setGenThumb(false);
              }}
              disabled={genThumb}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[10px] font-medium hover:bg-muted/40 disabled:opacity-50"
            >
              {genThumb ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              Generate
            </button>
          )}
        </div>
        {thumbnailUrl ? (
          <div className="relative">
            <img src={thumbnailUrl} alt="Thumbnail" className="w-full rounded-lg border border-border/30" />
            <a
              href={thumbnailUrl}
              download
              className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80"
            >
              Download
            </a>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">
            {genThumb ? "Generating thumbnail..." : "Generate a thumbnail for your social media posts."}
          </p>
        )}
      </div>

      {/* Metadata */}
      <div className="border-t border-border/30 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            AI-Generated Copy
          </h4>
          {!metadata && (
            <button
              onClick={handleGenerateMetadata}
              disabled={loadingMeta}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[10px] font-medium hover:bg-muted/40 disabled:opacity-50"
            >
              {loadingMeta ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Generate
            </button>
          )}
        </div>

        {/* Platform rows: connected = publish + disconnect / disconnected = connect */}
        <div className="flex flex-col gap-2 mb-3">

          {/* YouTube */}
          {ytConnected ? (
            <div className="flex gap-1.5">
              {metadata && (
                <button
                  onClick={publishToYouTube}
                  disabled={publishing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Monitor className="h-3.5 w-3.5" />}
                  {publishing ? "Publishing..." : "Publish to YouTube"}
                </button>
              )}
              {!metadata && (
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  <Monitor className="h-3.5 w-3.5" /> YouTube connected
                </div>
              )}
              <button
                onClick={() => handleDisconnect("youtube")}
                disabled={disconnecting === "youtube"}
                title="Disconnect YouTube"
                className="rounded-lg border border-border/40 bg-background/40 px-2 py-2 text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-50"
              >
                {disconnecting === "youtube" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <a href="/api/auth/youtube/connect"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10">
              <Monitor className="h-3.5 w-3.5" /> Connect YouTube
            </a>
          )}

          {/* TikTok */}
          {ttConnected ? (
            <div className="flex gap-1.5">
              {metadata && (
                <button
                  onClick={async () => {
                    if (!confirm(`Post to TikTok: "${metadata.title}"?`)) return;
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
                  disabled={publishing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-black border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                  Publish to TikTok
                </button>
              )}
              {!metadata && (
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/70">
                  <Smartphone className="h-3.5 w-3.5" /> TikTok connected
                </div>
              )}
              <button
                onClick={() => handleDisconnect("tiktok")}
                disabled={disconnecting === "tiktok"}
                title="Disconnect TikTok"
                className="rounded-lg border border-border/40 bg-background/40 px-2 py-2 text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-50"
              >
                {disconnecting === "tiktok" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <a href="/api/auth/tiktok/connect"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10">
              <Smartphone className="h-3.5 w-3.5" /> Connect TikTok
            </a>
          )}

          {/* Instagram */}
          {igConnected ? (
            <div className="flex gap-1.5">
              {metadata && (
                <button
                  onClick={async () => {
                    if (!confirm(`Post to Instagram: "${metadata.title}"?`)) return;
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
                  disabled={publishing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                  Publish to Instagram
                </button>
              )}
              {!metadata && (
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-xs text-purple-400">
                  <Square className="h-3.5 w-3.5" /> Instagram connected
                </div>
              )}
              <button
                onClick={() => handleDisconnect("instagram")}
                disabled={disconnecting === "instagram"}
                title="Disconnect Instagram"
                className="rounded-lg border border-border/40 bg-background/40 px-2 py-2 text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-50"
              >
                {disconnecting === "instagram" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <a href="/api/auth/instagram/connect"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-2 text-xs font-medium text-purple-400 hover:bg-purple-500/10">
              <Square className="h-3.5 w-3.5" /> Connect Instagram
            </a>
          )}
        </div>

        {/* Publish result feedback */}
        {publishResult?.url && publishResult.url.startsWith("http") && (
          <a
            href={publishResult.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 block rounded-md bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400 text-center hover:brightness-110"
          >
            Published! View on YouTube →
          </a>
        )}
        {publishResult?.url && !publishResult.url.startsWith("http") && (
          <p className="mb-3 rounded-md bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400 text-center">
            ✓ Posted successfully
          </p>
        )}
        {publishResult?.error && (
          <p className="mb-3 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {publishResult.error}
          </p>
        )}

        {metadata ? (
          <div className="space-y-3">
            {/* Title */}
            <CopyField label="Title" value={metadata.title} copied={copied} onCopy={copyToClipboard} />

            {/* Hashtags */}
            <CopyField
              label="Hashtags"
              value={metadata.hashtags.join(" ")}
              copied={copied}
              onCopy={copyToClipboard}
            />

            {/* Platform descriptions */}
            <CopyField
              label="TikTok / Reels"
              value={metadata.description_tiktok}
              copied={copied}
              onCopy={copyToClipboard}
              multiline
            />
            <CopyField
              label="YouTube"
              value={metadata.description_youtube}
              copied={copied}
              onCopy={copyToClipboard}
              multiline
            />
            <CopyField
              label="Instagram"
              value={metadata.description_instagram}
              copied={copied}
              onCopy={copyToClipboard}
              multiline
            />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">
            Click &quot;Generate&quot; to get AI-crafted titles, hashtags, and
            descriptions optimized for each platform.
          </p>
        )}
      </div>
    </div>
  );
}

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
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
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
