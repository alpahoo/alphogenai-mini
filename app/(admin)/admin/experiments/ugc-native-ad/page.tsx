"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Film, Loader2, Play, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_PRODUCT_URL =
  "https://www.beatsbydre.com/fr/earbuds/powerbeats-pro-2";

interface NativeBase {
  id: string;
  status: string;
}

interface PresenterRequest {
  id: string;
  name: string;
  nativeBase: NativeBase | null;
}

interface VerifiedIdentity {
  asset_id: string;
  name: string;
}

interface ExperimentResult {
  jobId?: string;
  status?: "processing" | "done" | "failed";
  videoUrl?: string;
  usageUnits?: number;
  error?: string;
}

export default function NativeUGCExperimentPage() {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState(DEFAULT_PRODUCT_URL);
  const [presenters, setPresenters] = useState<PresenterRequest[]>([]);
  const [nativeBaseId, setNativeBaseId] = useState("");
  const [verifiedIdentities, setVerifiedIdentities] = useState<VerifiedIdentity[]>([]);
  const [verifiedAssetId, setVerifiedAssetId] = useState("");
  const [loadingPresenters, setLoadingPresenters] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningMode, setRunningMode] = useState<"visual_preview" | "native" | null>(
    null
  );
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const readyPresenters = useMemo(
    () => presenters.filter((item) => item.nativeBase?.status === "ready"),
    [presenters],
  );

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Unauthorized");
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const [presenterResponse, identityResponse] = await Promise.all([
          fetch("/api/presenters/video", { headers }),
          fetch("/api/byteplus-assets", { headers }),
        ]);
        const presenterJson = await presenterResponse.json().catch(() => ({}));
        const identityJson = await identityResponse.json().catch(() => ({}));
        if (!presenterResponse.ok) {
          throw new Error(presenterJson.error || "Could not load presenters.");
        }
        if (!identityResponse.ok) {
          throw new Error(identityJson.error || "Could not load verified identities.");
        }
        const requests = Array.isArray(presenterJson.requests)
          ? presenterJson.requests
          : [];
        const identities = Array.isArray(identityJson.assets)
          ? identityJson.assets
          : [];
        setPresenters(requests);
        setVerifiedIdentities(identities);
        const firstReady = requests.find(
          (item: PresenterRequest) => item.nativeBase?.status === "ready",
        );
        if (firstReady?.nativeBase?.id) setNativeBaseId(firstReady.nativeBase.id);
        if (identities[0]?.asset_id) setVerifiedAssetId(identities[0].asset_id);
      } catch (error) {
        setResult({
          status: "failed",
          error: error instanceof Error ? error.message : "Could not load presenters.",
        });
      } finally {
        setLoadingPresenters(false);
      }
    })();
  }, [supabase]);

  const poll = async (jobId: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");
      const response = await fetch("/api/admin/experiments/ugc-native-ad", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "poll", jobId }),
      });
      const json = (await response.json().catch(() => ({}))) as ExperimentResult;
      if (!response.ok || json.status === "failed") {
        throw new Error(json.error || "Native UGC generation failed.");
      }
      setResult(json);
      if (json.status === "done") return;
    }
    throw new Error("Native UGC generation is still running. Open the job later.");
  };

  const start = async (mode: "visual_preview" | "native") => {
    setRunning(true);
    setRunningMode(mode);
    setResult(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");
      const response = await fetch("/api/admin/experiments/ugc-native-ad", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          mode,
          url,
          nativeBaseId: mode === "native" ? nativeBaseId || undefined : undefined,
          verifiedAssetIds:
            mode === "native" && verifiedAssetId ? [verifiedAssetId] : undefined,
          aspectRatio: "9:16",
          language: "French (France)",
        }),
      });
      const json = (await response.json().catch(() => ({}))) as ExperimentResult;
      if (!response.ok || !json.jobId) {
        throw new Error(json.error || "Could not start the native UGC experiment.");
      }
      setResult({ ...json, status: "processing" });
      await poll(json.jobId);
    } catch (error) {
      setResult((current) => ({
        ...current,
        status: "failed",
        error: error instanceof Error ? error.message : "Native UGC experiment failed.",
      }));
    } finally {
      setRunning(false);
      setRunningMode(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase text-blue-600">Admin experiment</p>
        <h1 className="mt-1 text-2xl font-bold">Native multi-shot product ad</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start with the free 10-second visual preview. Use the full 15-second native
          validation only after the product motion and pacing look convincing.
        </p>
      </div>

      <section className="space-y-5 border-y border-border py-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Product URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-blue-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Reusable performance clip</span>
          <select
            value={nativeBaseId}
            onChange={(event) => setNativeBaseId(event.target.value)}
            disabled={loadingPresenters || running}
            className="h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-blue-500"
          >
            <option value="">No presenter reference</option>
            {readyPresenters.map((item) => (
              <option key={item.nativeBase!.id} value={item.nativeBase!.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Verified creator identity</span>
          <select
            value={verifiedAssetId}
            onChange={(event) => setVerifiedAssetId(event.target.value)}
            disabled={loadingPresenters || running}
            className="h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-blue-500"
          >
            <option value="">No verified identity</option>
            {verifiedIdentities.map((identity) => (
              <option key={identity.asset_id} value={identity.asset_id}>
                {identity.name || identity.asset_id}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Seedance uses this approved identity instead of the raw performance
            video, which BytePlus blocks for privacy.
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div className="text-sm text-muted-foreground">
            Free visual preview: 9:16 · 10 seconds · no presenter · no audio
          </div>
          <button
            type="button"
            onClick={() => start("visual_preview")}
            disabled={running || !url.trim()}
            className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningMode === "visual_preview" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating preview
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run free visual preview
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            9:16 · 15 seconds · French · one generation
          </div>
          <button
            type="button"
            onClick={() => start("native")}
            disabled={
              running ||
              !url.trim() ||
              loadingPresenters ||
              (Boolean(nativeBaseId) && !verifiedAssetId)
            }
            className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningMode === "native" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating validation
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run full native validation
              </>
            )}
          </button>
        </div>
      </section>

      {result && (
        <section className="border border-border p-5">
          <div className="flex items-start gap-3">
            {result.status === "processing" ? (
              <RefreshCw className="mt-0.5 h-5 w-5 animate-spin text-blue-600" />
            ) : (
              <Film className="mt-0.5 h-5 w-5 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {result.status === "done"
                  ? "Native ad ready"
                  : result.status === "failed"
                    ? "Generation stopped"
                    : "Native ad is generating"}
              </p>
              {result.jobId && (
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  Job {result.jobId}
                </p>
              )}
              {result.error && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
              {result.videoUrl && (
                <a
                  href={result.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"
                >
                  Open final MP4
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
