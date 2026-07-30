import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { UGCEditManifest } from "./manifest";
import { localizeManifestMedia } from "./localize-media";
import { renderProductAd } from "./render-product-ad";

type RenderStatus = "queued" | "rendering" | "done" | "failed";

interface RenderState {
  id: string;
  status: RenderStatus;
  createdAt: number;
  videoUrl?: string;
  error?: string;
}

interface RenderRequest {
  jobId: string;
  manifest: UGCEditManifest;
}

const port = Number(process.env.PORT || 4000);
const secret = process.env.REVIDEO_WORKER_SECRET || "";
const publicBaseUrl = (
  process.env.REVIDEO_PUBLIC_URL || "https://revideo.srv859722.hstgr.cloud"
).replace(/\/+$/, "");
const states = new Map<string, RenderState>();
const jobRequests = new Map<string, string>();
let queue = Promise.resolve();

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(header: string | undefined) {
  return Boolean(secret) && header === `Bearer ${secret}`;
}

function sendMedia(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  asset: Buffer,
  contentType: string
) {
  const commonHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  };
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const requestedEnd = range[2] ? Number(range[2]) : asset.length - 1;
    const end = Math.min(requestedEnd, asset.length - 1);
    if (!Number.isFinite(start) || start < 0 || start > end) {
      response.writeHead(416, { "Content-Range": `bytes */${asset.length}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...commonHeaders,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${asset.length}`,
    });
    response.end(request.method === "HEAD" ? undefined : asset.subarray(start, end + 1));
    return;
  }
  response.writeHead(200, {
    ...commonHeaders,
    "Content-Length": asset.length,
  });
  response.end(request.method === "HEAD" ? undefined : asset);
}

async function serveRenderAsset(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse
) {
  const match = request.url?.match(
    /^\/render-assets\/([0-9a-f-]{36})\/(shot-[1-3]\.mp4|voiceover\.wav)$/i
  );
  if (!match) return false;
  try {
    const asset = await readFile(resolve("public", "render-assets", match[1], match[2]));
    sendMedia(
      request,
      response,
      asset,
      match[2].endsWith(".mp4") ? "video/mp4" : "audio/wav"
    );
  } catch {
    json(response, 404, { error: "Render asset not found." });
  }
  return true;
}

async function serveOutput(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse
) {
  const match = request.url?.match(/^\/output\/([0-9a-f-]{36})\.mp4$/i);
  if (!match) return false;
  try {
    const asset = await readFile(resolve("output", `${match[1]}.mp4`));
    sendMedia(request, response, asset, "video/mp4");
  } catch {
    json(response, 404, { error: "Render output not found." });
  }
  return true;
}

function mediaUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validManifest(value: unknown): value is UGCEditManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as UGCEditManifest;
  if (!Array.isArray(manifest.shots) || manifest.shots.length !== 3) return false;
  if (manifest.voiceoverUrl && !mediaUrl(manifest.voiceoverUrl)) return false;
  return manifest.shots.every(
    (shot) =>
      mediaUrl(shot.videoUrl) &&
      Number.isFinite(shot.durationSeconds) &&
      shot.durationSeconds >= 4 &&
      shot.durationSeconds <= 8
  );
}

async function requestBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function runRender(id: string, input: RenderRequest) {
  const state = states.get(id);
  if (!state) return;
  state.status = "rendering";
  const filename = `${id}.mp4`;
  const outputPath = resolve("output", filename);
  let cleanupAssets: (() => Promise<void>) | undefined;
  let keepOutput = false;
  try {
    await mkdir(resolve("output"), { recursive: true });
    const localized = await localizeManifestMedia(id, input.manifest);
    cleanupAssets = localized.cleanup;
    await renderProductAd(localized.manifest, filename);
    state.videoUrl = `${publicBaseUrl}/output/${filename}`;
    state.status = "done";
    keepOutput = true;
  } catch (error) {
    console.error(`[revideo-worker] render failed request=${id}`, error);
    state.status = "failed";
    state.error = "render_failed";
  } finally {
    if (!keepOutput) {
      await rm(outputPath, { force: true }).catch(() => undefined);
    }
    await cleanupAssets?.().catch(() => undefined);
  }
}

function enqueue(input: RenderRequest) {
  const existingId = jobRequests.get(input.jobId);
  if (existingId && states.has(existingId)) return existingId;
  const id = randomUUID();
  states.set(id, { id, status: "queued", createdAt: Date.now() });
  jobRequests.set(input.jobId, id);
  queue = queue.then(() => runRender(id, input)).catch((error) => {
    console.error("[revideo-worker] queue failure", error);
  });
  return id;
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, state] of states) {
    if (state.createdAt < cutoff) {
      states.delete(id);
      void rm(resolve("output", `${id}.mp4`), { force: true }).catch(() => undefined);
      for (const [jobId, requestId] of jobRequests) {
        if (requestId === id) jobRequests.delete(jobId);
      }
    }
  }
}, 60 * 60 * 1000).unref();

export const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { ok: true, service: "product-ad-renderer" });
  }
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    ((await serveRenderAsset(request, response)) || (await serveOutput(request, response)))
  ) {
    return;
  }
  if (!authorized(request.headers.authorization)) {
    return json(response, 401, { error: "Unauthorized" });
  }
  if (request.method === "POST" && request.url === "/render") {
    try {
      const body = (await requestBody(request)) as Partial<RenderRequest>;
      if (
        typeof body.jobId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.jobId) ||
        !validManifest(body.manifest)
      ) {
        return json(response, 400, { error: "Invalid render request." });
      }
      const requestId = enqueue(body as RenderRequest);
      return json(response, 202, { requestId, status: "queued" });
    } catch {
      return json(response, 400, { error: "Invalid render request." });
    }
  }
  const match = request.url?.match(/^\/status\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && match) {
    const state = states.get(match[1]);
    if (!state) return json(response, 404, { error: "Render request not found." });
    return json(response, 200, state);
  }
  return json(response, 404, { error: "Not found." });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[revideo-worker] listening on ${port}`);
});
