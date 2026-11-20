"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudioAsset } from "./types";
import type { StudioState } from "./use-studio";

/**
 * Private video with signed-URL refresh when a link expires. The URL comes from the existing admin media route
 * (owner-scoped, short-lived) and is never stored or shown. One refresh is tried on error, then a clear message.
 */
export function PrivateVideo({ asset, s, videoRef, muted, className, style, onMetadata, label = "Video" }: {
  asset: StudioAsset; s: StudioState; videoRef?: React.Ref<HTMLVideoElement>; muted?: boolean; className?: string;
  style?: React.CSSProperties; onMetadata?: (info: { duration: number; width: number; height: number }) => void; label?: string;
}) {
  const [url, setUrl] = useState<string | null>(s.media[asset.id]?.url ?? null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  const { signMedia } = s;
  useEffect(() => {
    let live = true; retried.current = false; setFailed(false);
    signMedia(asset.id).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sign once per asset; refresh handled on error
  }, [asset.id]);
  const onError = useCallback(async () => {
    if (retried.current) { setFailed(true); return; }
    retried.current = true;
    try { setUrl(await signMedia(asset.id, { force: true })); } catch { setFailed(true); }
  }, [asset.id, signMedia]);
  if (failed) return <div style={style} role="alert" className={cn("grid place-items-center bg-black/40 px-3 text-center text-sm text-muted-foreground", className)}>{label}: private link unavailable. The file may have been removed or the link expired.</div>;
  if (!url) return <div style={style} className={cn("grid place-items-center bg-black/40", className)}><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={`Loading ${label}`} /></div>;
  return (
    <video ref={videoRef} key={url} src={url} controls playsInline muted={muted} preload="metadata" onError={onError} style={style} aria-label={label}
      onLoadedMetadata={e => onMetadata?.({ duration: e.currentTarget.duration, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
      className={cn("bg-black object-contain", className)} />
  );
}
