"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Film,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
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

interface ProductReference {
  id: string;
  name: string;
  previewUrl: string;
  storagePath?: string;
  status: "uploading" | "ready" | "failed";
  error?: string;
}

interface ExperimentResult {
  jobId?: string;
  status?: "processing" | "done" | "failed";
  videoUrl?: string;
  usageUnits?: number;
  error?: string;
  ready?: number;
  failed?: number;
  processing?: number;
  requestId?: string;
  outputs?: Record<string, { status: string; videoUrl?: string }>;
  editManifest?: unknown;
}

type ExperimentMode = "visual_preview" | "native" | "directed_edit";

export default function NativeUGCExperimentPage() {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState(DEFAULT_PRODUCT_URL);
  const [presenters, setPresenters] = useState<PresenterRequest[]>([]);
  const [nativeBaseId, setNativeBaseId] = useState("");
  const [verifiedIdentities, setVerifiedIdentities] = useState<VerifiedIdentity[]>([]);
  const [verifiedAssetId, setVerifiedAssetId] = useState("");
  const [script, setScript] = useState("");
  const [productReferences, setProductReferences] = useState<ProductReference[]>([]);
  const [loadingPresenters, setLoadingPresenters] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningMode, setRunningMode] = useState<ExperimentMode | null>(null);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const resumedJobRef = useRef<string | null>(null);
  const productReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const readyPresenters = useMemo(
    () => presenters.filter((item) => item.nativeBase?.status === "ready"),
    [presenters],
  );
  const readyProductReferences = useMemo(
    () => productReferences.filter((item) => item.status === "ready"),
    [productReferences],
  );
  const productReferenceSelectionBlocked = productReferences.some(
    (item) => item.status !== "ready",
  );

  const uploadProductReferences = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files).slice(
      0,
      Math.max(0, 6 - productReferences.length),
    );
    for (const file of selected) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setProductReferences((current) => [
        ...current,
        { id, name: file.name, previewUrl, status: "uploading" },
      ]);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload?bucket=references", {
          method: "POST",
          body: formData,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || typeof json.storage_path !== "string") {
          throw new Error(json.error || "Upload failed.");
        }
        setProductReferences((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  storagePath: json.storage_path,
                  previewUrl:
                    typeof json.url === "string" ? json.url : item.previewUrl,
                  status: "ready",
                }
              : item,
          ),
        );
      } catch (error) {
        setProductReferences((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "failed",
                  error: error instanceof Error ? error.message : "Upload failed.",
                }
              : item,
          ),
        );
      }
    }
    if (productReferenceInputRef.current) {
      productReferenceInputRef.current.value = "";
    }
  };

  const removeProductReference = (id: string) => {
    setProductReferences((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

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

  const poll = async (jobId: string, mode: ExperimentMode) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");
      const response = await fetch(
        mode === "directed_edit"
          ? "/api/admin/experiments/ugc-shot-pack"
          : "/api/admin/experiments/ugc-native-ad",
        {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "poll", jobId }),
        }
      );
      const json = (await response.json().catch(() => ({}))) as ExperimentResult;
      if (!response.ok || json.status === "failed") {
        throw new Error(json.error || "Product Ad generation failed.");
      }
      setResult(json);
      if (json.status === "done") return;
    }
    throw new Error("Product Ad generation is still running. Open the job later.");
  };

  const pollDirectedAssembly = async (jobId: string, requestId: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");
      const response = await fetch("/api/admin/experiments/ugc-shot-pack", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "poll_edit_request",
          jobId,
          requestId,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as ExperimentResult;
      if (!response.ok || json.status === "failed") {
        throw new Error(json.error || "The directed assembly failed.");
      }
      setResult(json);
      if (json.status === "done") return;
    }
    throw new Error("The directed assembly is still running. Open the job later.");
  };

  const start = async (mode: ExperimentMode) => {
    setRunning(true);
    setRunningMode(mode);
    setResult(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");
      const response = await fetch(
        mode === "directed_edit"
          ? "/api/admin/experiments/ugc-shot-pack"
          : "/api/admin/experiments/ugc-native-ad",
        {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          mode,
          url,
          nativeBaseId: mode !== "visual_preview" ? nativeBaseId || undefined : undefined,
          verifiedAssetIds:
            mode !== "visual_preview" && verifiedAssetId ? [verifiedAssetId] : undefined,
          script: mode === "native" ? script : undefined,
          productReferencePaths:
            mode === "native"
              ? readyProductReferences
                  .map((item) => item.storagePath)
                  .filter((value): value is string => Boolean(value))
              : undefined,
          aspectRatio: "9:16",
          language: "French (France)",
        }),
        }
      );
      const json = (await response.json().catch(() => ({}))) as ExperimentResult;
      if (!response.ok || !json.jobId) {
        throw new Error(json.error || "Could not start the native UGC experiment.");
      }
      if (mode === "directed_edit") {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?job_id=${encodeURIComponent(json.jobId)}`,
        );
      }
      setResult({ ...json, status: "processing" });
      await poll(json.jobId, mode);
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

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job_id");
    if (!jobId || resumedJobRef.current === jobId) return;
    resumedJobRef.current = jobId;
    setRunning(true);
    setRunningMode("directed_edit");
    setResult({ jobId, status: "processing" });
    void poll(jobId, "directed_edit")
      .catch((error) => {
        setResult((current) => ({
          ...current,
          status: "failed",
          error: error instanceof Error ? error.message : "Could not resume the directed edit.",
        }));
      })
      .finally(() => {
        setRunning(false);
        setRunningMode(null);
      });
    // The selected job is encoded in the URL and must only resume once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryDirectedAssembly = async (jobId: string) => {
    setRunning(true);
    setRunningMode("directed_edit");
    setResult({ jobId, status: "processing" });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");
      const response = await fetch("/api/admin/experiments/ugc-shot-pack", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "restart_edit_v2", jobId }),
      });
      const json = (await response.json().catch(() => ({}))) as ExperimentResult;
      if (!response.ok) {
        throw new Error(json.error || "Could not restart the cached assembly.");
      }
      if (!json.requestId) {
        throw new Error(
          "The new assembly request was not accepted. Refresh after deployment and try once more.",
        );
      }
      setResult({
        jobId,
        status: "processing",
        requestId: json.requestId,
      });
      await pollDirectedAssembly(jobId, json.requestId);
    } catch (error) {
      setResult((current) => ({
        ...current,
        status: "failed",
        error: error instanceof Error ? error.message : "Could not retry the final assembly.",
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
        <h1 className="mt-1 text-2xl font-bold">Creator UGC Studio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One creator, one script and selected product references in a single coherent
          performance. BytePlus is the first engine behind this provider-neutral workflow.
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
          <span className="text-sm font-medium">Creator script / UGC brief</span>
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value.slice(0, 1600))}
            rows={5}
            placeholder="Example: Je les porte pendant chaque entraînement. Montre comment ils tiennent derrière l'oreille, ajuste-les face caméra, puis recommande-les naturellement."
            className="w-full resize-y border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <span className="text-xs text-muted-foreground">
            Drives one coherent creator performance. Native speech follows this wording
            as closely as the model allows.
          </span>
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Product and scene references</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Add up to 6 clean references. They replace unpredictable page images.
              </div>
            </div>
            <input
              ref={productReferenceInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => void uploadProductReferences(event.target.files)}
            />
            <button
              type="button"
              onClick={() => productReferenceInputRef.current?.click()}
              disabled={running || productReferences.length >= 6}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              Add references
            </button>
          </div>
          {productReferences.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {productReferences.map((item, index) => (
                <div key={item.id} className="relative border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  <div className="mt-2 truncate text-xs font-medium">
                    Reference {index + 1}: {item.name}
                  </div>
                  <div
                    className={`mt-1 text-xs ${
                      item.status === "failed"
                        ? "text-red-600"
                        : item.status === "ready"
                          ? "text-emerald-700"
                          : "text-muted-foreground"
                    }`}
                  >
                    {item.status === "uploading"
                      ? "Uploading"
                      : item.status === "ready"
                        ? "Ready"
                        : item.error || "Upload failed"}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProductReference(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="absolute right-3 top-3 grid h-7 w-7 place-items-center bg-background/90 shadow"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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
              productReferenceSelectionBlocked ||
              (Boolean(nativeBaseId) && !verifiedAssetId)
            }
            className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningMode === "native" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating UGC performance
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Generate coherent UGC performance
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div>
            <div className="text-sm font-medium">Legacy three-shot assembly</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Kept for comparison. Three separate clips plus deterministic captions;
              this is not the recommended native UGC path.
            </div>
          </div>
          <button
            type="button"
            onClick={() => start("directed_edit")}
            disabled={
              running ||
              !url.trim() ||
              loadingPresenters ||
              (Boolean(nativeBaseId) && !verifiedAssetId)
            }
            className="inline-flex h-10 items-center gap-2 bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningMode === "directed_edit" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating 3 shots
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run directed edit
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
              {result.outputs && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {Object.entries(result.outputs)
                    .filter(([, output]) => output.status === "ready" && output.videoUrl)
                    .map(([shotId, output], index) => (
                      <a
                        key={shotId}
                        href={output.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"
                      >
                        Open shot {index + 1}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ))}
                </div>
              )}
              {Boolean(result.editManifest) && (
                <p className="mt-3 text-sm text-emerald-700">
                  Three-shot edit manifest ready for deterministic assembly.
                </p>
              )}
              {(result.status === "failed" || result.status === "done") &&
                result.jobId &&
                Boolean(result.editManifest) && (
                <button
                  type="button"
                  onClick={() => retryDirectedAssembly(result.jobId!)}
                  disabled={running}
                  className="mt-4 inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runningMode === "directed_edit" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {result.status === "done"
                    ? "Rebuild assembly from cached shots"
                    : "Retry assembly from cached shots"}
                </button>
                )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
