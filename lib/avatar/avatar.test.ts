import { describe, expect, it } from "vitest";
import { audioFileName, audioPath, cleanAudioName, isOwnAudioPath, parseAudioFileName, wavDurationSeconds } from "./audio-library";
import { DEFAULT_PROMPT, resolveAvatar, segmentsFor, videoSecondsFor } from "./template";
import { fileNameFor, libraryPath } from "@/lib/studio/reference-library";
import { InputError, graphHash, type Graph } from "@/lib/comfy/template";

const OWNER = "0f8fad5b-d9cb-469f-a165-70867728950e", OTHER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ID1 = "11111111-1111-4111-8111-111111111111", ID2 = "22222222-2222-4222-8222-222222222222";
const image = libraryPath(OWNER, fileNameFor("Luz", ID1, "png"));
const audio = audioPath(OWNER, audioFileName("Luz intro", ID2, "wav"));

function wav(seconds: number, rate = 16000): Uint8Array {
  const data = Math.round(seconds * rate * 2), b = new Uint8Array(44 + data), v = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  tag(0, "RIFF"); v.setUint32(4, 36 + data, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, data, true);
  return b;
}

describe("audio library paths", () => {
  it("round-trips a name and keeps unicode", () => {
    const f = audioFileName("Voix d'Émma", ID2, "mp3");
    expect(parseAudioFileName(f)).toEqual({ id: ID2, name: "Voix d'Émma", ext: "mp3", fileName: f });
  });
  it("accepts only the caller's own well-formed audio files", () => {
    expect(isOwnAudioPath(OWNER, audio)).toBe(true);
    expect(isOwnAudioPath(OTHER, audio)).toBe(false);                                   // someone else's folder
    expect(isOwnAudioPath(OWNER, `${OWNER}/audio-library/../${OTHER}/x.wav`)).toBe(false); // traversal
    expect(isOwnAudioPath(OWNER, `${OWNER}/library/${audioFileName("a", ID2, "wav")}`)).toBe(false); // wrong folder
    expect(isOwnAudioPath(OWNER, `${OWNER}/audio-library/stray.wav`)).toBe(false);
    expect(isOwnAudioPath(OWNER, 42)).toBe(false);
  });
  it("validates names", () => {
    expect(cleanAudioName("  Luz   FR ")).toBe("Luz FR");
    expect(cleanAudioName("")).toBeNull();
    expect(cleanAudioName("x".repeat(41))).toBeNull();
    expect(cleanAudioName("a\u0000b")).toBeNull();
  });
});

describe("wav duration", () => {
  it("is exact from the header", () => { expect(wavDurationSeconds(wav(9.72))).toBeCloseTo(9.72, 2); });
  it("tolerates an over-declared data chunk (streaming header)", () => {
    const b = wav(2); new DataView(b.buffer).setUint32(40, 0xffffffff, true);
    expect(wavDurationSeconds(b)).toBeCloseTo(2, 2);
  });
  it("is null for anything that is not a WAV", () => {
    expect(wavDurationSeconds(new Uint8Array(10))).toBeNull();
    expect(wavDurationSeconds(new TextEncoder().encode("ID3".padEnd(60, "x")))).toBeNull();
  });
});

describe("segments and output length", () => {
  it("matches the measured upstream lengths (93, 173, 253 frames at 25 fps)", () => {
    expect(videoSecondsFor(1)).toBeCloseTo(3.72, 2);
    expect(videoSecondsFor(2)).toBeCloseTo(6.92, 2);
    expect(videoSecondsFor(3)).toBeCloseTo(10.12, 2);
  });
  it("picks the fewest segments that cover the audio", () => {
    expect(segmentsFor(3.5)).toBe(1);
    expect(segmentsFor(3.72)).toBe(1);
    expect(segmentsFor(3.8)).toBe(2);
    expect(segmentsFor(6.9)).toBe(2);
    expect(segmentsFor(9.72)).toBe(3);   // the Luz test
    expect(segmentsFor(10)).toBe(3);
  });
  it("refuses an audio longer than the first scope, and invalid values", () => {
    expect(segmentsFor(10.2)).toBeNull();
    expect(segmentsFor(0)).toBeNull();
    expect(segmentsFor(Number.NaN)).toBeNull();
  });
});

describe("resolveAvatar", () => {
  it("binds the fixed validated configuration and keeps storage paths out of the public params", () => {
    const r = resolveAvatar({ image_path: image, audio_path: audio, seed: 7 }, OWNER);
    expect(r.runtime).toBe("longcat-avatar@1");
    expect(r.template).toBe("longcat-avatar@1");
    expect(r.referencePath).toBe(image);
    expect(r.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.params).toEqual({ prompt: DEFAULT_PROMPT, seed: 7, resolution: "480p", steps: 8, image_label: "Luz", audio_label: "Luz intro" });
    expect(JSON.stringify(r.params)).not.toContain(OWNER);
    expect(r.graph["1"].inputs).toMatchObject({ resolution: "480p", steps: 8, precision: "int8", distilled: true, model: "avatar-v1.6", mix_steps: 4, mix_alpha: 1 });
  });
  it("is deterministic for identical input (basis of the duplicate guard)", () => {
    const a = resolveAvatar({ image_path: image, audio_path: audio, seed: 7, prompt: "Hello there" }, OWNER);
    const b = resolveAvatar({ image_path: image, audio_path: audio, seed: 7, prompt: "Hello there" }, OWNER);
    expect(a.hash).toBe(b.hash);
    expect(resolveAvatar({ image_path: image, audio_path: audio, seed: 8, prompt: "Hello there" }, OWNER).hash).not.toBe(a.hash);
  });
  it("draws a random seed only when none is given", () => {
    const seed = (r: ReturnType<typeof resolveAvatar>) => r.params.seed as number;
    const s = seed(resolveAvatar({ image_path: image, audio_path: audio }, OWNER));
    expect(Number.isInteger(s) && s >= 0 && s < 2 ** 31).toBe(true);
  });
  it.each([
    ["a portrait of someone else", { image_path: libraryPath(OTHER, fileNameFor("Luz", ID1, "png")), audio_path: audio }],
    ["an audio of someone else", { image_path: image, audio_path: audioPath(OTHER, audioFileName("x", ID2, "wav")) }],
    ["a traversal portrait", { image_path: `${OWNER}/library/../${OTHER}/x.png`, audio_path: audio }],
    ["a portrait outside the library", { image_path: `${OWNER}/${ID1}/photo.png`, audio_path: audio }],
    ["a missing audio", { image_path: image }],
    ["a locked parameter", { image_path: image, audio_path: audio, steps: 50 }],
    ["an unknown parameter", { image_path: image, audio_path: audio, resolution: "720p" }],
    ["a bad seed", { image_path: image, audio_path: audio, seed: -1 }],
    ["a fractional seed", { image_path: image, audio_path: audio, seed: 1.5 }],
    ["a too short prompt", { image_path: image, audio_path: audio, prompt: "ab" }],
    ["a too long prompt", { image_path: image, audio_path: audio, prompt: "x".repeat(601) }],
    ["a non-object body", "nope"],
  ])("rejects %s", (_name, input) => { expect(() => resolveAvatar(input, OWNER)).toThrow(InputError); });
});

describe("cross-language graph hash", () => {
  it("equals the Python canonical hash of the same graph (modal_app/comfy/test_avatar.py)", () => {
    const graph = { "1": { class_type: "LongCatAvatar", inputs: {
      image_path: "u1/library/4c757a_11111111-1111-4111-8111-111111111111.png",
      audio_path: "u1/audio-library/4c757a_22222222-2222-4222-8222-222222222222.wav",
      prompt: "Salut, ça va ? « Luz »", seed: 42, resolution: "480p", steps: 8, precision: "int8", distilled: true, model: "avatar-v1.6", mix_steps: 4, mix_alpha: 1.0,
    } } } as Graph;
    expect(graphHash(graph)).toBe("8eef85e9f2589a241d6c7218affea14c4342971fe8bc22a94d44592465b48b90");
  });
});
