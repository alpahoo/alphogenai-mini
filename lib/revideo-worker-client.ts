import type { RevideoProductAdManifest } from "@/lib/revideo-product-ad";

interface WorkerState {
  requestId: string;
  status: "queued" | "rendering" | "done" | "failed";
  videoUrl?: string;
}

function config() {
  const url = (process.env.REVIDEO_WORKER_URL || "").replace(/\/+$/, "");
  const secret = process.env.REVIDEO_WORKER_SECRET || "";
  if (!url || !secret) return null;
  return { url, secret };
}

export function isRevideoWorkerConfigured() {
  return config() !== null;
}

export async function startRevideoProductAd(
  jobId: string,
  manifest: RevideoProductAdManifest
): Promise<WorkerState> {
  const worker = config();
  if (!worker) throw new Error("revideo_worker_not_configured");
  const response = await fetch(`${worker.url}/render`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${worker.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId, manifest }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => ({}))) as Partial<WorkerState>;
  if (!response.ok || !json.requestId) throw new Error("revideo_worker_start_failed");
  return json as WorkerState;
}

export async function getRevideoProductAd(requestId: string): Promise<WorkerState> {
  const worker = config();
  if (!worker) throw new Error("revideo_worker_not_configured");
  const response = await fetch(`${worker.url}/status/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${worker.secret}` },
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({}))) as Partial<WorkerState>;
  if (response.status === 404) throw new Error("revideo_worker_request_not_found");
  if (!response.ok || !json.status) throw new Error("revideo_worker_poll_failed");
  return json as WorkerState;
}
