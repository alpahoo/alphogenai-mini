import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

async function serveRenderAsset(
  requestUrl: string,
  response: import("node:http").ServerResponse
) {
  const match = requestUrl.match(
    /^\/render-assets\/([0-9a-f-]{36})\/(shot-[1-3]\.mp4|voiceover\.wav)$/i
  );
  if (!match) return false;
  try {
    const asset = await readFile(resolve("public", "render-assets", match[1], match[2]));
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Length": asset.length,
      "Content-Type": match[2].endsWith(".mp4") ? "video/mp4" : "audio/wav",
    });
    response.end(asset);
  } catch {
    json(response, 404, { error: "Render asset not found." });
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

function s3Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("storage_not_configured");
  }
  return new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function uploadOutput(path: string, key: string) {
  const buffer = await readFile(path);
  await s3Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "alphogenai-assets",
      Key: key,
      Body: buffer,
      ContentType: "video/mp4",
    })
  );
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("public_storage_url_not_configured");
  return `${base}/${key}`;
}

async function runRender(id: string, input: RenderRequest) {
  const state = states.get(id);
  if (!state) return;
  state.status = "rendering";
  const filename = `${id}.mp4`;
  const outputPath = resolve("output", filename);
  let cleanupAssets: (() => Promise<void>) | undefined;
  try {
    await mkdir(resolve("output"), { recursive: true });
    const localized = await localizeManifestMedia(id, input.manifest);
    cleanupAssets = localized.cleanup;
    await renderProductAd(localized.manifest, filename);
    const key = `videos/ugc-directed-edit/${input.jobId}/${id}.mp4`;
    state.videoUrl = await uploadOutput(outputPath, key);
    state.status = "done";
  } catch (error) {
    console.error(`[revideo-worker] render failed request=${id}`, error);
    state.status = "failed";
    state.error = "render_failed";
  } finally {
    await rm(outputPath, { force: true }).catch(() => undefined);
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
    request.method === "GET" &&
    request.url &&
    (await serveRenderAsset(request.url, response))
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
