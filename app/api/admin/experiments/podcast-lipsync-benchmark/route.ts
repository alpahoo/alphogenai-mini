import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { uploadBufferToR2 } from "@/lib/r2";
import {
  type LipsyncProviderBenchmarkInput,
  scoreLipsyncProvider,
} from "@/lib/podcast/lipsync-provider-benchmark";
import {
  type PodcastLipsyncMode,
  getPodcastLipsyncProvider,
} from "@/lib/podcast/lipsync-provider";

export const maxDuration = 60;

const DEFAULT_MAX_USD = 0.25;
const ABSOLUTE_MAX_USD = 0.5;
const HEYGEN_USD_PER_SECOND = 0.04;

type BenchmarkAction = "start" | "poll" | "score";

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function parseMode(value: unknown): PodcastLipsyncMode {
  return value === "speed" ? "speed" : "precision";
}

function estimateUsd(durationSeconds: number): number {
  return Math.round(durationSeconds * HEYGEN_USD_PER_SECOND * 100) / 100;
}

function parseScoreInput(body: Record<string, unknown>): LipsyncProviderBenchmarkInput | null {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!id || !label) return null;
  const required = [
    "mouthSync",
    "identityStability",
    "visualQuality",
    "costUsdPerSecond",
    "latencySecondsPerOutputSecond",
    "apiFit",
    "cacheFit",
    "consentFit",
    "integrationEffort",
  ] as const;
  const numeric = Object.fromEntries(required.map((key) => [key, Number(body[key])])) as Record<typeof required[number], number>;
  if (Object.values(numeric).some((value) => !Number.isFinite(value))) return null;
  return { id, label, ...numeric };
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as BenchmarkAction;

  if (action === "score") {
    const input = parseScoreInput(body);
    if (!input) {
      return NextResponse.json({ error: "Invalid score input." }, { status: 400 });
    }
    return NextResponse.json({ score: scoreLipsyncProvider(input) });
  }

  const provider = getPodcastLipsyncProvider("heygen");

  if (action === "start") {
    const videoUrl = body.baseClipUrl;
    const audioUrl = body.audioUrl;
    const durationSeconds = positiveNumber(body.durationSeconds);
    const maxUsd = Math.min(
      positiveNumber(body.maxUsd) ?? DEFAULT_MAX_USD,
      ABSOLUTE_MAX_USD,
    );

    if (!isHttpUrl(videoUrl) || !isHttpUrl(audioUrl) || !durationSeconds) {
      return NextResponse.json(
        { error: "baseClipUrl, audioUrl, and durationSeconds are required." },
        { status: 400 },
      );
    }
    if (durationSeconds > 12) {
      return NextResponse.json(
        { error: "Benchmark clips are capped at 12 seconds." },
        { status: 400 },
      );
    }

    const estimatedUsd = estimateUsd(durationSeconds);
    if (estimatedUsd > maxUsd) {
      return NextResponse.json(
        {
          error: "Benchmark spend cap exceeded.",
          estimatedUsd,
          maxUsd,
        },
        { status: 400 },
      );
    }

    const mode = parseMode(body.mode);
    const startedAt = Date.now();
    const task = await provider.createClip({ videoUrl, audioUrl, mode });
    return NextResponse.json({
      provider: provider.id,
      providerLabel: provider.label,
      providerTaskId: task.providerTaskId,
      mode,
      estimatedUsd,
      maxUsd,
      durationSeconds,
      startedAt,
    });
  }

  if (action === "poll") {
    const providerTaskId = typeof body.providerTaskId === "string" ? body.providerTaskId.trim() : "";
    if (!providerTaskId) {
      return NextResponse.json({ error: "providerTaskId required." }, { status: 400 });
    }

    const result = await provider.pollClip(providerTaskId);
    if (result.status !== "completed" || !result.videoUrl) {
      return NextResponse.json({
        provider: provider.id,
        providerTaskId,
        status: result.status,
        error: result.error ?? null,
      });
    }

    const dl = await fetch(result.videoUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!dl.ok) {
      return NextResponse.json(
        { error: `Provider output download failed (${dl.status}).` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await dl.arrayBuffer());
    const key = `experiments/lipsync-benchmarks/${provider.id}-${randomUUID()}.mp4`;
    const outputUrl = await uploadBufferToR2(buffer, key, "video/mp4");

    return NextResponse.json({
      provider: provider.id,
      providerTaskId,
      status: "completed",
      outputUrl,
      storageKey: key,
      bytes: buffer.length,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
