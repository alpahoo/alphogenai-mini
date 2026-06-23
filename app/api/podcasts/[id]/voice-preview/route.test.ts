import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";
import { DEFAULT_HOST_VOICE } from "@/lib/podcast/voice-catalog";
import { POST } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/tts", () => ({ generateVoiceover: vi.fn(), isTTSAvailable: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadBufferToR2: vi.fn() }));

const USER = { id: "user-1" };

function ownedService() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: "p1", user_id: USER.id }, error: null }) }) }),
    }),
  } as never;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => ({ url: "http://localhost", json: async () => body ?? {} } as never);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.R2_PUBLIC_URL = "https://cdn.example.com";
  vi.mocked(isTTSAvailable).mockReturnValue(true);
  vi.mocked(generateVoiceover).mockResolvedValue({
    audio: new ArrayBuffer(8), provider: "elevenlabs", duration_estimate: 2, content_type: "audio/mpeg",
  });
  vi.mocked(uploadBufferToR2).mockResolvedValue("https://cdn.example.com/audio/podcast/voice-previews/rachel.mp3");
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/podcasts/[id]/voice-preview", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(req({ voice_id: DEFAULT_HOST_VOICE }), ctx("p1"))).status).toBe(401);
  });

  it("503 when TTS is unavailable", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(isTTSAvailable).mockReturnValue(false);
    vi.mocked(createServiceClient).mockReturnValue(ownedService());
    expect((await POST(req({ voice_id: DEFAULT_HOST_VOICE }), ctx("p1"))).status).toBe(503);
  });

  it("400 for an unknown voice", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(ownedService());
    expect((await POST(req({ voice_id: "nope" }), ctx("p1"))).status).toBe(400);
  });

  it("returns the cached preview without synthesizing when it already exists", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(ownedService());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true } as Response));
    const res = await POST(req({ voice_id: DEFAULT_HOST_VOICE }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(generateVoiceover).not.toHaveBeenCalled();
  });

  it("synthesizes + uploads on cache miss, never exposing the provider", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(createServiceClient).mockReturnValue(ownedService());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
    const res = await POST(req({ voice_id: DEFAULT_HOST_VOICE }), ctx("p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(false);
    expect(json.audio_url).toMatch(/^https?:\/\//);
    expect(generateVoiceover).toHaveBeenCalledTimes(1);
    expect(uploadBufferToR2).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(json).toLowerCase()).not.toContain("elevenlabs");
    expect(JSON.stringify(json).toLowerCase()).not.toContain("provider");
  });
});
