import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { UGCEditManifest } from "./manifest";

const VIDEO_LIMIT_BYTES = 250 * 1024 * 1024;
const AUDIO_LIMIT_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 90_000;

interface LocalizedManifest {
  manifest: UGCEditManifest;
  cleanup: () => Promise<void>;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) return resolvePromise();
      reject(
        new Error(
          `${command} exited with code ${code ?? "unknown"}: ${stderr.trim()}`
        )
      );
    });
  });
}

async function download(url: string, destination: string, maxBytes: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok || !response.body) {
      throw new Error(`media_download_failed_${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) throw new Error("media_too_large");

    let received = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > maxBytes) {
          callback(new Error("media_too_large"));
          return;
        }
        callback(null, chunk);
      },
    });

    await mkdir(dirname(destination), { recursive: true });
    await pipeline(
      Readable.fromWeb(response.body as never),
      limiter,
      createWriteStream(destination)
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function normalizeVideo(source: string, destination: string) {
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    destination,
  ]);
}

async function normalizeAudio(source: string, destination: string) {
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    source,
    "-vn",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    destination,
  ]);
}

export async function localizeManifestMedia(
  requestId: string,
  manifest: UGCEditManifest
): Promise<LocalizedManifest> {
  const assetRoot = resolve("public", "render-assets", requestId);
  await mkdir(assetRoot, { recursive: true });

  try {
    const localizedShots = [];
    for (let index = 0; index < manifest.shots.length; index += 1) {
      const shot = manifest.shots[index];
      const source = resolve(assetRoot, `shot-${index + 1}.source`);
      const output = resolve(assetRoot, `shot-${index + 1}.mp4`);
      await download(shot.videoUrl, source, VIDEO_LIMIT_BYTES);
      await normalizeVideo(source, output);
      await rm(source, { force: true });
      localizedShots.push({
        ...shot,
        videoUrl: output,
      });
    }

    let voiceoverUrl = manifest.voiceoverUrl;
    if (voiceoverUrl) {
      const source = resolve(assetRoot, "voiceover.source");
      const output = resolve(assetRoot, "voiceover.wav");
      await download(voiceoverUrl, source, AUDIO_LIMIT_BYTES);
      await normalizeAudio(source, output);
      await rm(source, { force: true });
      voiceoverUrl = `render-assets/${requestId}/voiceover.wav`;
    }

    return {
      manifest: {
        ...manifest,
        shots: localizedShots as UGCEditManifest["shots"],
        voiceoverUrl,
      },
      cleanup: () => rm(assetRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(assetRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
