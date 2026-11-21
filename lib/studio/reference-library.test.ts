import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveTemplate } from "@/lib/comfy/template";
import { STUDIO_MODELS } from "./catalog";
import { defaultValues, submissionParams, type StudioManifest } from "./manifest";
import { MAX_NAME_LENGTH, cleanName, fileNameFor, isLibraryPath, libraryPath, parseFileName, thumbPath } from "./reference-library";

const UID = "f5f40f91-89cc-4d94-8adc-d6dd3796306a";
const ID = "0a1b2c3d-1111-4222-8333-444455556666";

describe("library names and paths", () => {
  it("round-trips any name, including accents, spaces and emoji", () => {
    for (const name of ["Luz", "Luz - plage", "Élodie été", "Luz 🌴", "日本語"]) {
      const file = fileNameFor(name, ID, "png");
      expect(parseFileName(file)).toEqual({ id: ID, name, ext: "png", fileName: file });
    }
  });
  it("accepts 1 to 40 characters, no control characters, and collapses spaces", () => {
    expect(cleanName("  Luz   plage ")).toBe("Luz plage");
    expect(cleanName("")).toBeNull(); expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(MAX_NAME_LENGTH))).not.toBeNull(); expect(cleanName("x".repeat(MAX_NAME_LENGTH + 1))).toBeNull();
    expect(cleanName("a\u0000b")).toBeNull(); expect(cleanName(42)).toBeNull();
  });
  it("ignores folders, thumbnails and stray files when listing", () => {
    for (const bad of ["thumbs", "notes.txt", "zz_" + ID + ".png", `${"4c757a"}_${ID}.gif`, `_${ID}.png`, "4c757a_not-a-uuid.png"]) expect(parseFileName(bad)).toBeNull();
  });
  it("thumbnails live in their own folder as webp", () => {
    const file = fileNameFor("Luz", ID, "jpg");
    expect(thumbPath(UID, file)).toBe(`${UID}/library/thumbs/${file.replace(".jpg", ".webp")}`);
    expect(parseFileName(thumbPath(UID, file).split("/").pop()!)?.ext).toBe("webp".replace("webp", "webp"));
  });
  it("recognises only the caller's own library, never a path with ..", () => {
    expect(isLibraryPath(UID, libraryPath(UID, fileNameFor("Luz", ID, "png")))).toBe(true);
    expect(isLibraryPath(UID, `${UID}/${ID}.png`)).toBe(false);
    expect(isLibraryPath(UID, `other/library/${fileNameFor("Luz", ID, "png")}`)).toBe(false);
    expect(isLibraryPath(UID, `${UID}/library/../x.png`)).toBe(false);
    expect(isLibraryPath(UID, null)).toBe(false);
  });
});

describe("a library reference works with the existing run API", () => {
  const h3 = STUDIO_MODELS.find(m => m.slug === "minimax-h3")!.manifest as StudioManifest;
  it("the unchanged server validation accepts a library path (generation uses the same first_frame_path)", () => {
    const path = libraryPath(UID, fileNameFor("Luz plage", ID, "webp"));
    const params = submissionParams(h3, { ...defaultValues(h3), prompt: "A woman walks on a beach", quality: "turbo" }, path);
    const out = resolveTemplate(params, UID);
    expect(out.referencePath).toBe(path);
    expect(out.variant).toBe("i2v");
  });
  it("the server still refuses another user's library path", () => {
    const path = libraryPath("someone-else", fileNameFor("Luz", ID, "png"));
    expect(() => resolveTemplate(submissionParams(h3, { ...defaultValues(h3), prompt: "abc def", quality: "turbo" }, path), UID)).toThrow(/Invalid private reference/);
  });
  it("the same reference can be used by several generations", () => {
    const path = libraryPath(UID, fileNameFor("Luz", ID, "png"));
    for (const seed of [1, 2, 3]) expect(resolveTemplate(submissionParams(h3, { ...defaultValues(h3), prompt: "abc def", quality: "turbo", seed }, path), UID).referencePath).toBe(path);
  });
});

describe("capabilities: a reference is sent only to a model that takes one", () => {
  it("MOSS declares no reference, so no reference is ever submitted for it", () => {
    const moss = STUDIO_MODELS.find(m => m.slug === "moss-image")!.manifest as StudioManifest;
    expect(moss.studio?.reference).toBeUndefined();
    expect(submissionParams(moss, { ...defaultValues(moss), prompt: "a mug" }, libraryPath(UID, fileNameFor("Luz", ID, "png")))).not.toHaveProperty("first_frame_path");
  });
  it("the library is mounted only when the manifest declares a reference, with the manifest's own label", () => {
    const panel = readFileSync("components/studio/create-panel.tsx", "utf8");
    expect(panel).toMatch(/\{ref && <ReferenceLibrary s=\{s\} label=\{ref\.label\}/);
    const h3 = STUDIO_MODELS.find(m => m.slug === "minimax-h3")!.manifest as StudioManifest;
    expect(h3.studio?.reference?.label).toBe("First frame");
  });
});

describe("read only toward generation", () => {
  it("choosing or managing references never generates, reserves or touches a gate", () => {
    for (const f of ["components/studio/reference-library.tsx", "lib/studio/reference-library.ts", "app/api/admin/studio/references/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/generate\(|admit_|rpc\(|comfy_admin_gate|comfy_runtime_gates|committed_usd|dispatch|idempotency|localStorage/i);
    }
  });
  it("selecting a library image only attaches it to the form", () => {
    const hook = readFileSync("components/studio/use-studio.ts", "utf8");
    const block = hook.slice(hook.indexOf("const selectLibraryReference"), hook.indexOf("const clearReference"));
    expect(block).toMatch(/attachReference/);
    expect(block).not.toMatch(/fetch\(|generate\(/);
  });
});
