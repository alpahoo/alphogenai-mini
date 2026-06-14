import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVoiceover } from "../tts";

const OK_AUDIO = new ArrayBuffer(8);

function okAudioResponse() {
  return { ok: true, arrayBuffer: async () => OK_AUDIO } as unknown as Response;
}
function errResponse(status: number) {
  return { ok: false, status, text: async () => "boom" } as unknown as Response;
}

const origEleven = process.env.ELEVENLABS_API_KEY;
const origOpenAI = process.env.OPENAI_API_KEY;

describe("generateVoiceover provider fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env.ELEVENLABS_API_KEY = origEleven;
    process.env.OPENAI_API_KEY = origOpenAI;
  });

  it("falls back to OpenAI when ElevenLabs fails and OpenAI is configured", async () => {
    process.env.ELEVENLABS_API_KEY = "el-key";
    process.env.OPENAI_API_KEY = "oa-key";
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("elevenlabs.io") ? errResponse(401) : okAudioResponse()
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await generateVoiceover({ text: "Bonjour le monde." });

    expect(res.provider).toBe("openai");
    expect(fetchMock).toHaveBeenCalledTimes(2); // ElevenLabs (fail) then OpenAI (ok)
  });

  it("uses ElevenLabs and does not call OpenAI when ElevenLabs succeeds", async () => {
    process.env.ELEVENLABS_API_KEY = "el-key";
    process.env.OPENAI_API_KEY = "oa-key";
    const fetchMock = vi.fn(async () => okAudioResponse());
    vi.stubGlobal("fetch", fetchMock);

    const res = await generateVoiceover({ text: "Bonjour." });

    expect(res.provider).toBe("elevenlabs");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when all configured providers fail", async () => {
    process.env.ELEVENLABS_API_KEY = "el-key";
    process.env.OPENAI_API_KEY = "oa-key";
    vi.stubGlobal("fetch", vi.fn(async () => errResponse(500)));

    await expect(generateVoiceover({ text: "Bonjour." })).rejects.toThrow();
  });

  it("throws a clear error when no provider is configured", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(generateVoiceover({ text: "Bonjour." })).rejects.toThrow(/No TTS provider/);
  });
});
