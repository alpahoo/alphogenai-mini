import { afterEach, describe, expect, it, vi } from "vitest";

import {
  nativeAnimationAudioExtension,
  toPublicNativePresenterAnimation,
  validateNativeAnimationAudio,
} from "@/lib/video-presenter-native-animation";
import {
  pollNativePresenterAnimation,
  startNativePresenterAnimation,
} from "@/lib/video-presenter-native-animation-provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native presenter animation contract", () => {
  it("accepts supported speech files with a verified digest", () => {
    expect(validateNativeAnimationAudio({
      type: "audio/mpeg",
      size: 12_000,
      sha256: "a".repeat(64),
    })).toBeNull();
    expect(nativeAnimationAudioExtension("audio/mp4")).toBe("m4a");
    expect(nativeAnimationAudioExtension("audio/x-wav")).toBe("wav");
  });

  it("rejects unsupported, oversized, and unverified audio", () => {
    expect(validateNativeAnimationAudio({
      type: "audio/ogg",
      size: 12_000,
      sha256: "a".repeat(64),
    })).toMatch(/MP3/);
    expect(validateNativeAnimationAudio({
      type: "audio/mpeg",
      size: 30 * 1024 * 1024,
      sha256: "a".repeat(64),
    })).toMatch(/25 MB/);
    expect(validateNativeAnimationAudio({
      type: "audio/mpeg",
      size: 12_000,
      sha256: "not-a-digest",
    })).toMatch(/verify/);
  });

  it("maps rows without leaking private storage or provider state", () => {
    const publicValue = toPublicNativePresenterAnimation({
      id: "animation-1",
      native_base_id: "base-1",
      status: "ready",
      output_duration_seconds: 3.2,
      error_code: null,
      created_at: "2026-07-27T10:00:00.000Z",
      updated_at: "2026-07-27T10:01:00.000Z",
    });
    expect(publicValue).toEqual({
      id: "animation-1",
      nativeBaseId: "base-1",
      status: "ready",
      durationSeconds: 3.2,
      errorCode: null,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T10:01:00.000Z",
    });
    expect(JSON.stringify(publicValue)).not.toMatch(
      /provider|task|audio_path|output_video_path|latentsync/i,
    );
  });
});

describe("native presenter animation provider", () => {
  function configure() {
    vi.stubEnv("MODAL_LATENTSYNC_URL", "https://native-animation.example");
    vi.stubEnv("MODAL_WEBHOOK_SECRET", "secret");
  }

  it("starts the private adapter with a capped request", async () => {
    configure();
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () =>
      new Response(
        JSON.stringify({ call_id: "task-1" }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startNativePresenterAnimation({
      videoUrl: "https://signed.example/base.mp4",
      audioUrl: "https://signed.example/speech.mp3",
      outputPath: "user-1/animation-1/animated.mp4",
    })).resolves.toBe("task-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://native-animation.example/native/start",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-webhook-secret": "secret" }),
      }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      video_url: "https://signed.example/base.mp4",
      audio_url: "https://signed.example/speech.mp3",
      output_path: "user-1/animation-1/animated.mp4",
      max_seconds: 8,
    });
  });

  it("polls without exposing provider details", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        status: "completed",
        output_path: "user-1/animation-1/animated.mp4",
        output_probe: { duration_seconds: 3.4 },
        gpu: "A10G",
      }),
      { status: 200 },
    )));

    await expect(pollNativePresenterAnimation("task-1")).resolves.toEqual({
      status: "completed",
      outputPath: "user-1/animation-1/animated.mp4",
      durationSeconds: 3.4,
    });
  });

  it("requires the private adapter configuration", async () => {
    await expect(startNativePresenterAnimation({
      videoUrl: "https://signed.example/base.mp4",
      audioUrl: "https://signed.example/speech.mp3",
      outputPath: "user-1/animation-1/animated.mp4",
    })).rejects.toThrow(/not configured/);
  });
});
