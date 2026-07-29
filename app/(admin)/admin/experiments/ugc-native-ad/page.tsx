"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Film, Loader2, Play, RefreshCw } from "lucide-react";

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

interface ExperimentResult {
  jobId?: string;
  status?: "processing" | "done" | "failed";
  videoUrl?: string;
  usageUnits?: number;
  error?: string;
}

export default function NativeUGCExperimentPage() {
  const [url, setUrl] = useState(DEFAULT_PRODUCT_URL);
  const [presenters, setPresenters] = useState<PresenterRequest[]>([]);
  const [nativeBaseId, setNativeBaseId] = useState("");
  const [loadingPresenters, setLoadingPresenters] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const readyPresenters = useMemo(
    () => presenters.filter((item) => item.nativeBase?.status === "ready"),
    [presenters],
  );

  useEffect(() => {
    fetch("/api/presenters/video")
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Could not load presenters.");
        return json;
      })
      .then((json) => {
        const requests = Array.isArray(json.requests) ? json.requests : [];
        setPresenters(requests);
        const firstReady = requests.find(
          (item: PresenterRequest) => item.nativeBase?.status === "ready",
        );
        if (firstReady?.nativeBase?.id) setNativeBaseId(firstReady.nativeBase.id);
      })
      .catch((error) => {
        setResult({
          status: "failed",
          error: error instanceof Error ? error.message : "Could not load presenters.",
        });
      })
      .finally(() => setLoadingPresenters(false));
  }, []);

  const poll = async (jobId: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      const response = await fetch("/api/admin/experiments/ugc-native-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const start = async () => {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/experiments/ugc-native-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          url,
          nativeBaseId: nativeBaseId || undefined,
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
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase text-blue-600">Admin experiment</p>
        <h1 className="mt-1 text-2xl font-bold">Native multi-shot product ad</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One 15-second generation with a coherent hook, demonstration and CTA. Run a
          single capped validation before routing this mode into Product Ad.
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

        <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
          <div className="text-sm text-muted-foreground">
            9:16 · 15 seconds · French · one generation
          </div>
          <button
            type="button"
            onClick={start}
            disabled={running || !url.trim() || loadingPresenters}
            className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run one validation
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
