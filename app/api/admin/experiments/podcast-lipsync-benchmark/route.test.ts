import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "../../middleware";
import { uploadBufferToR2 } from "@/lib/r2";
import { getPodcastLipsyncProvider } from "@/lib/podcast/lipsync-provider";
import { POST } from "./route";

vi.mock("../../middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));
vi.mock("@/lib/podcast/lipsync-provider", () => ({ getPodcastLipsyncProvider: vi.fn() }));

const ADMIN = { id: "admin-1", email: "admin@alphogen.com" };
const createClip = vi.fn();
const pollClip = vi.fn();

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/admin/experiments/podcast-lipsync-benchmark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN } as never);
  vi.mocked(getPodcastLipsyncProvider).mockReturnValue({
    id: "heygen",
    label: "HeyGen",
    capabilities: { estimatedUsdPerOutputSecond: 0.04 },
    createClip,
    pollClip,
  });
  createClip.mockResolvedValue({ providerTaskId: "task-1" });
  pollClip.mockResolvedValue({ status: "processing" });
  vi.mocked(uploadBufferToR2).mockResolvedValue("https://cdn.example.com/bench.mp4");
});

describe("POST /api/admin/experiments/podcast-lipsync-benchmark", () => {
  it("requires admin access", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    } as never);

    const res = await POST(req({ action: "start" }));

    expect(res.status).toBe(403);
    expect(getPodcastLipsyncProvider).not.toHaveBeenCalled();
  });

  it("rejects malformed start input before provider spend", async () => {
    const res = await POST(req({ action: "start", baseClipUrl: "nope", audioUrl: "https://cdn/audio.mp3", durationSeconds: 3 }));

    expect(res.status).toBe(400);
    expect(createClip).not.toHaveBeenCalled();
  });

  it("enforces the spend cap before provider spend", async () => {
    const res = await POST(req({
      action: "start",
      baseClipUrl: "https://cdn/base.mp4",
      audioUrl: "https://cdn/audio.mp3",
      durationSeconds: 8,
      maxUsd: 0.1,
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("cap");
    expect(json.estimatedUsd).toBe(0.32);
    expect(createClip).not.toHaveBeenCalled();
  });

  it("starts one capped benchmark clip through the provider", async () => {
    const res = await POST(req({
      action: "start",
      baseClipUrl: "https://cdn/base.mp4",
      audioUrl: "https://cdn/audio.mp3",
      durationSeconds: 3.26,
      mode: "precision",
      maxUsd: 0.25,
    }));

    expect(res.status).toBe(200);
    expect(createClip).toHaveBeenCalledWith({
      videoUrl: "https://cdn/base.mp4",
      audioUrl: "https://cdn/audio.mp3",
      mode: "precision",
    });
    const json = await res.json();
    expect(json.providerTaskId).toBe("task-1");
    expect(json.estimatedUsd).toBe(0.13);
  });

  it("polls an in-flight provider task without copying to R2", async () => {
    pollClip.mockResolvedValueOnce({ status: "processing" });

    const res = await POST(req({ action: "poll", providerTaskId: "task-1" }));

    expect(res.status).toBe(200);
    expect(pollClip).toHaveBeenCalledWith("task-1");
    expect(uploadBufferToR2).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.status).toBe("processing");
  });

  it("copies a completed provider output to R2", async () => {
    pollClip.mockResolvedValueOnce({ status: "completed", videoUrl: "https://provider/result.mp4" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    const res = await POST(req({ action: "poll", providerTaskId: "task-1" }));

    expect(res.status).toBe(200);
    expect(uploadBufferToR2).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.stringMatching(/^experiments\/lipsync-benchmarks\/heygen-.+\.mp4$/),
      "video/mp4",
    );
    const json = await res.json();
    expect(json.status).toBe("completed");
    expect(json.outputUrl).toBe("https://cdn.example.com/bench.mp4");
  });

  it("scores manual benchmark inputs without provider spend", async () => {
    const res = await POST(req({
      action: "score",
      id: "candidate-a",
      label: "Candidate A",
      mouthSync: 4,
      identityStability: 4,
      visualQuality: 4,
      costUsdPerSecond: 0.03,
      latencySecondsPerOutputSecond: 12,
      apiFit: 4,
      cacheFit: 4,
      consentFit: 4,
      integrationEffort: 2,
    }));

    expect(res.status).toBe(200);
    expect(createClip).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.score.id).toBe("candidate-a");
    expect(json.score.score).toBeGreaterThan(70);
  });
});
