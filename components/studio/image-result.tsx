"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileJson, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionButton } from "./result-stage";
import type { StudioAsset, StudioRun } from "./types";
import type { StudioState } from "./use-studio";

/** Private image with signed-URL refresh on expiry. Never rendered through the Next image optimizer. */
export function PrivateImage({ asset, s, sizes, aspect, className, alt = "Generated image" }: {
  asset: StudioAsset; s: StudioState; sizes?: Record<string, readonly number[]>; aspect?: string; className?: string; alt?: string;
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
  const size = aspect ? sizes?.[aspect] : undefined;
  const style = size ? { aspectRatio: `${size[0]}/${size[1]}` } : undefined;
  if (failed) return <div style={style} className={cn("grid h-64 place-items-center bg-black/30 text-sm text-muted-foreground", className)}>Private link unavailable</div>;
  if (!url) return <div style={style} className={cn("grid h-64 place-items-center bg-black/30", className)}><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived private signed URL, must not be proxied or cached
    <img key={url} src={url} alt={alt} style={style} decoding="async" draggable={false}
      onError={async () => {
        if (retried.current) { setFailed(true); return; }
        retried.current = true;
        try { setUrl(await signMedia(asset.id, { force: true })); } catch { setFailed(true); }
      }}
      className={cn("h-auto w-auto object-contain", className)} />
  );
}

function caption(run: StudioRun) {
  const p = run.params_effective ?? {};
  return [p.seed !== undefined && `seed ${p.seed}`, p.steps && `${p.steps} steps`, p.cfg && `CFG ${p.cfg}`, p.sampler_name].filter(Boolean).join(" · ");
}

/** Side-by-side comparison of two completed image runs. */
export function ImageCompare({ s, run }: { s: StudioState; run: StudioRun }) {
  const others = s.compareCandidates(run.id);
  const other = others.find(o => o.id === s.compareWith) ?? others[0];
  const sizes = s.model.manifest?.resolutions;
  const pair = [run, other].filter(Boolean) as StudioRun[];
  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        {pair.map((r, i) => {
          const asset = r.assets?.find(a => a.role === "raw");
          return (
            <figure key={r.id} className="flex min-h-0 flex-col items-center gap-2">
              <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                {asset && <PrivateImage asset={asset} s={s} sizes={sizes} aspect={String(r.params_effective?.aspect ?? "1:1")} className="max-h-full max-w-full rounded-2xl" />}
              </div>
              <figcaption className="max-w-full truncate text-center text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{i === 0 ? "Current" : "Compared"}</span> · {caption(r)}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {others.length > 1 && (
        <label className="mx-auto flex items-center gap-2 text-xs text-muted-foreground">
          Compare with
          <select value={other?.id} onChange={e => s.setCompareWith(e.target.value)}
            className="h-8 max-w-[16rem] truncate rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground">
            {others.map(o => <option key={o.id} value={o.id}>{String(o.params_effective?.prompt ?? o.id).slice(0, 48)} · {caption(o)}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** PNG original (signed URL), JPEG/WebP converted server-side, and the run settings as JSON. */
export function ImageDownloads({ s, run, asset }: { s: StudioState; run: StudioRun; asset: StudioAsset }) {
  const save = (href: string) => { const a = document.createElement("a"); a.href = href; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); };
  const settings = () => {
    const body = JSON.stringify({ run_id: run.id, template: run.template_version, created_at: run.created_at, params: run.params_effective }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `alphogen-${run.id.slice(0, 8)}-settings.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <ActionButton icon={Download} label="PNG" onClick={() => void s.download(asset.id)} />
      <ActionButton icon={Download} label="JPEG" onClick={() => save(`/api/admin/comfy/media/${encodeURIComponent(asset.id)}?format=jpeg`)} />
      <ActionButton icon={Download} label="WebP" onClick={() => save(`/api/admin/comfy/media/${encodeURIComponent(asset.id)}?format=webp`)} />
      <ActionButton icon={FileJson} label="Settings" onClick={settings} />
    </>
  );
}
