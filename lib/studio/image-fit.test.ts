import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  FitError, MAX_INPUT_BYTES, MIN_LONG_EDGE, SCALE_STEPS, UPLOAD_BUDGET_BYTES, fitImage, resizeNote, uploadFailureMessage, type Codec,
} from "./image-fit";

const file = (bytes: number, type = "image/png", name = "luz.png") => new File([new Uint8Array(bytes)], name, { type });

/**
 * A codec whose output size is a simple function of the pixel count, so the ladder is deterministic:
 * `bytesPerPixel` for the lossless case, and a fraction of it for lossy output.
 */
function fakeCodec(width: number, height: number, bytesPerPixel: number, opts: { lossyFactor?: number; decodeFails?: boolean; encodeFails?: boolean } = {}) {
  const calls: { w: number; h: number; type: string; quality?: number }[] = [];
  let released = 0;
  const codec: Codec = {
    decode: vi.fn(async () => { if (opts.decodeFails) throw new Error("bad image"); return { width, height, source: "bitmap" }; }),
    encode: vi.fn(async (_s, w, h, type, quality) => {
      calls.push({ w, h, type, quality });
      if (opts.encodeFails) throw new Error("no canvas");
      const factor = quality !== undefined ? (opts.lossyFactor ?? 0.25) : 1;
      return new Blob([new Uint8Array(Math.round(w * h * bytesPerPixel * factor))], { type });
    }),
    release: () => { released++; },
  };
  return { codec, calls, released: () => released };
}

describe("fitImage: an image under the budget is never touched", () => {
  it("returns the same file and does not even decode it", async () => {
    const { codec } = fakeCodec(100, 100, 1);
    const f = file(UPLOAD_BUDGET_BYTES);
    const out = await fitImage(f, { codec });
    expect(out).toEqual({ file: f, resized: false, note: null });
    expect(out.file).toBe(f);
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("leaves a format it cannot fit to the server, which refuses it clearly", async () => {
    const { codec } = fakeCodec(100, 100, 1);
    const gif = file(UPLOAD_BUDGET_BYTES + 1, "image/gif", "x.gif");
    expect((await fitImage(gif, { codec })).file).toBe(gif);
    expect(codec.decode).not.toHaveBeenCalled();
  });
});

describe("fitImage: a large image is resized in its own format, without enlarging", () => {
  it("the Luz case: a 4.8 MB, 1440 x 2560 PNG is scaled down until it fits, keeping the 9:16 ratio and the type", async () => {
    // 1440 x 2560 at 1.3 bytes/px = 4.8 MB. 0.85 -> 3.4 MB fits.
    const { codec, calls, released } = fakeCodec(1440, 2560, 1.3);
    const f = file(4_838_400, "image/png", "REFERENCE_OFFICIELLE_fullbody.png");
    const out = await fitImage(f, { codec });
    expect(out.resized).toBe(true);
    expect(out.file.size).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
    expect(out.file.type).toBe("image/png");
    expect(out.file.name).toBe("REFERENCE_OFFICIELLE_fullbody.png");
    // The first attempt is not at full size for a PNG (re-encoding it at the same size would not shrink it).
    expect(calls[0]).toMatchObject({ w: 1224, h: 2176, type: "image/png" });
    expect(calls[0].quality).toBeUndefined();
    expect(Math.abs(calls[0].w / calls[0].h - 1440 / 2560)).toBeLessThan(0.002);
    expect(out.note).toMatch(/^Resized to fit the 4\.5 MB upload limit: 1440 × 2560 \(4\.8 MB\) → 1224 × 2176 \(3\.\d MB\)\.$/);
    expect(released()).toBe(1);
  });

  it("keeps stepping down until the file fits", async () => {
    const { codec, calls } = fakeCodec(1440, 2560, 4); // 14.7 MB at full size: only the 0.45 step (3.0 MB) fits
    const out = await fitImage(file(9_000_000), { codec });
    expect(out.file.size).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
    expect(calls.map(c => c.w)).toEqual([1224, 1008, 792, 648]);
    expect(out.file.type).toBe("image/png");
  });

  it("a JPEG or WebP is first re-encoded at the same size, at high quality, and only then scaled", async () => {
    const jpeg = fakeCodec(2000, 3000, 1.2, { lossyFactor: 0.25 }); // 2000x3000x1.2x0.25 = 1.8 MB: re-encode alone is enough
    const out = await fitImage(file(6_000_000, "image/jpeg", "a.jpg"), { codec: jpeg.codec });
    expect(jpeg.calls).toEqual([{ w: 2000, h: 3000, type: "image/jpeg", quality: 0.92 }]);
    expect(out.file.type).toBe("image/jpeg");
    expect(out.note).toMatch(/2000 × 3000 \(6\.0 MB\) → 2000 × 3000/);
    const webp = fakeCodec(2000, 3000, 4, { lossyFactor: 0.25 }); // 6 MB at full size: needs a smaller size
    const out2 = await fitImage(file(7_000_000, "image/webp", "a.webp"), { codec: webp.codec });
    expect(webp.calls[0]).toMatchObject({ w: 2000, h: 3000, quality: 0.92 });
    expect(webp.calls.length).toBeGreaterThan(1);
    expect(out2.file.size).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
  });

  it("never enlarges: every attempt is at most the original size", async () => {
    const { codec, calls } = fakeCodec(1200, 2000, 5);
    await fitImage(file(12_000_000), { codec }).catch(() => undefined);
    for (const c of calls) { expect(c.w).toBeLessThanOrEqual(1200); expect(c.h).toBeLessThanOrEqual(2000); }
    expect(Math.max(...SCALE_STEPS)).toBe(1);
  });

  it("every attempt keeps the aspect ratio within a pixel of rounding", async () => {
    const { codec, calls } = fakeCodec(1800, 1000, 6);
    await fitImage(file(10_000_000), { codec }).catch(() => undefined);
    for (const c of calls) expect(Math.abs(c.w / c.h - 1.8)).toBeLessThan(0.01);
  });
});

describe("fitImage: failures are explicit, never an opaque 413", () => {
  it("stops at the minimum size and says what to do", async () => {
    const { codec, calls } = fakeCodec(1500, 1500, 20); // incompressible
    await expect(fitImage(file(9_000_000), { codec })).rejects.toThrow(/still above the 4\.5 MB upload limit after resizing/);
    for (const c of calls) expect(Math.max(c.w, c.h)).toBeGreaterThanOrEqual(MIN_LONG_EDGE);
  });

  it("refuses a file above the browser cap, an unreadable image and an absurd pixel count", async () => {
    const { codec } = fakeCodec(100, 100, 1);
    await expect(fitImage(file(MAX_INPUT_BYTES + 1), { codec })).rejects.toThrow(/25 MB or less/);
    await expect(fitImage(file(5_000_000), { codec: fakeCodec(100, 100, 1, { decodeFails: true }).codec })).rejects.toThrow(/could not be read/);
    await expect(fitImage(file(5_000_000), { codec: fakeCodec(20000, 20000, 1).codec })).rejects.toThrow(/too large to resize/);
  });

  it("a canvas that cannot encode ends in the same explicit error, and the bitmap is always released", async () => {
    const f = fakeCodec(1440, 2560, 1.3, { encodeFails: true });
    await expect(fitImage(file(4_838_400), { codec: f.codec })).rejects.toBeInstanceOf(FitError);
    expect(f.released()).toBe(1);
  });
});

describe("messages", () => {
  it("explains a 413, which comes from the hosting platform", () => {
    expect(uploadFailureMessage(413)).toBe("The image is larger than the 4.5 MB upload limit. Use a smaller image.");
    expect(uploadFailureMessage(413, "ignored")).toMatch(/4\.5 MB/);
  });
  it("keeps the server's own message for other errors, with a fallback", () => {
    expect(uploadFailureMessage(409, "A reference with this name already exists")).toBe("A reference with this name already exists");
    expect(uploadFailureMessage(500)).toBe("Upload failed");
    expect(uploadFailureMessage(503, null, "Reference library unavailable")).toBe("Reference library unavailable");
  });
  it("formats the note", () => {
    expect(resizeNote({ bytes: 4_838_400, width: 1440, height: 2560 }, { bytes: 2_436_424, width: 1080, height: 1920 }))
      .toBe("Resized to fit the 4.5 MB upload limit: 1440 × 2560 (4.8 MB) → 1080 × 1920 (2.4 MB).");
  });
});

describe("both upload paths use it, and the budget stays under the hosting limit", () => {
  it("the budget leaves room under 4,718,592 bytes for the multipart envelope", () => {
    expect(UPLOAD_BUDGET_BYTES).toBeLessThan(4_718_592 - 100_000);
  });
  it("the library and the one-off upload both resize before sending and map a 413", () => {
    const lib = readFileSync("components/studio/reference-library.tsx", "utf8");
    expect(lib.indexOf("fitImage(pending.file)")).toBeGreaterThan(-1);
    expect(lib.indexOf("fitImage(pending.file)")).toBeLessThan(lib.indexOf('fetch("/api/admin/studio/references", { method: "POST"'));
    expect(lib).toMatch(/uploadFailureMessage\(res\.status/);
    const hook = readFileSync("components/studio/use-studio.ts", "utf8");
    const block = hook.slice(hook.indexOf("const uploadReference"), hook.indexOf("const selectLibraryReference"));
    expect(block.indexOf("fitImage(file)")).toBeGreaterThan(-1);
    expect(block.indexOf("fitImage(file)")).toBeLessThan(block.indexOf('fetch("/api/upload?bucket=references"'));
    expect(block).toMatch(/res\.status === 413/);
    expect(block).toMatch(/fitted\.file/);
  });
  it("only the reference uploads changed: no other route and no server limit is touched", () => {
    const route = readFileSync("app/api/admin/studio/references/route.ts", "utf8");
    expect(route).toMatch(/const MAX_BYTES = 10 \* 1024 \* 1024/);
    expect(readFileSync("lib/studio/image-fit.ts", "utf8")).not.toMatch(/fetch\(|supabase|process\.env|localStorage|\/api\//);
  });
});
