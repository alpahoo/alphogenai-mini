import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveTemplate } from "@/lib/comfy/template";
import { STUDIO_MODELS } from "@/lib/studio/catalog";
import { resolveVariant, validateValues, type StudioManifest } from "@/lib/studio/manifest";
import { fileNameFor, libraryPath } from "@/lib/studio/reference-library";
import { CinemaError, EMPTY_PROMPT, FRAMING_SCALE, TIGHTER_STEPS_WARNING, composePrompt, composeShot, framingStep, gatherReferences, toRunParams, usableReferencePath, type Element, type Project, type Shot } from "./compose";
import { modelView } from "./model-view";
import { ANGLES, CATALOG, FILM_STOCKS, FOCUS, GRADES, LENSES, LENS_FAMILIES, LIGHTING_STYLES, MOODS, MOVEMENTS, SHOT_SIZES } from "./presets";

const UID = "f5f40f91-89cc-4d94-8adc-d6dd3796306a";
const H3 = STUDIO_MODELS.find(m => m.slug === "minimax-h3")!;
const MOSS = STUDIO_MODELS.find(m => m.slug === "moss-image")!;
const h3Manifest = H3.manifest as StudioManifest;
const lib = (name: string, n: number) => libraryPath(UID, fileNameFor(name, `0a1b2c3d-1111-4222-8333-44445555666${n}`, "png"));
// The real library entry created for the pilot ("Luz", hex 4c757a).
const LUZ_PATH = `${UID}/library/4c757a_4d5b40a6-1fcf-4086-8505-2804fb7c12e2.png`;

const luz: Element = { id: "cel_luz", kind: "character", name: "Luz", description: "the woman from the reference image", refPaths: [LUZ_PATH] };
const project: Project = { aspect: "9:16", look: {} };
const shot: Shot = {
  action: "Luz stands centred in a sunlit courtyard garden and smiles at the camera",
  size: "full", angle: "eye-level", movement: "push-in", lens: "", focus: "shallow", lighting: "natural-light", mood: "",
  duration: 5, sound: "after a short pause she says in French: \"Bonjour, moi c'est Luz.\" Light breeze, distant birds",
  castIds: ["cel_luz"], locationId: null,
};
const compose = (over: Partial<Parameters<typeof composeShot>[0]> = {}) => composeShot({ userId: UID, project, shot, elements: [luz], mode: "animate", model: H3, ...over });

describe("Luz pilot case: the composer produces what the H3 manifest expects", () => {
  const out = compose();

  it("composes the exact prompt, in the order of the Studio guidance, with the Soundscape wording", () => {
    expect(out.prompt).toBe(
      "Full shot at eye level. Luz stands centred in a sunlit courtyard garden and smiles at the camera. " +
      "Featuring Luz (the woman from the reference image). The camera slowly pushes in. " +
      "Shot with shallow depth of field with a soft background. Lighting: natural available light. " +
      "Soundscape: after a short pause she says in French: \"Bonjour, moi c'est Luz.\" Light breeze, distant birds.");
  });

  it("gives the parameters of the planned render: 9:16, 5 s, turbo, one first frame", () => {
    expect(out.modelSlug).toBe("minimax-h3");
    // The manifest defaults the Studio form starts from (validated 0.4 s audio advance) are included, nothing else.
    expect(out.values).toEqual({ prompt: out.prompt, aspect: "9:16", seconds: 5, quality: "turbo", resolution: "480p", audio_shift_s: 0.4 });
    expect(out.notes).toEqual([]);
  });

  it("is valid for the H3 manifest and resolves to the image-to-video workflow", () => {
    expect(validateValues(h3Manifest, out.values)).toEqual({});
    expect(resolveVariant(h3Manifest, out.values, out.referencePath !== null)).toBe("i2v");
  });

  it("selects the Luz library image as the first frame", () => {
    expect(out.referencePath).toBe(LUZ_PATH);
  });

  it("passes the unchanged server validation: same reference, image-to-video graph, 480x832, 124 frames", () => {
    const params = toRunParams(H3, out);
    expect(params).toMatchObject({ prompt: out.prompt, aspect: "9:16", seconds: 5, quality: "turbo", audio_shift_s: 0.4, first_frame_path: LUZ_PATH });
    expect(params).not.toHaveProperty("seed");
    const server = resolveTemplate(params, UID);
    expect(server.referencePath).toBe(LUZ_PATH);
    expect(server.variant).toBe("i2v");
    expect(server.graph["6"].inputs).toMatchObject({ width: 480, height: 832, length: 124 });
    expect(server.graph["20"].inputs.image).toBe("first_frame.png");
    // Another administrator's folder is still refused by the server.
    expect(() => resolveTemplate(toRunParams(H3, out), "someone-else")).toThrow(/Invalid private reference/);
  });

  it("is deterministic: the same input always gives the same output", () => {
    expect(compose()).toEqual(out);
    expect(compose()).toEqual(compose());
  });
});

describe("first image selection", () => {
  const other = { id: "cel_scope", kind: "prop" as const, name: "Spyglass", description: "", refPaths: [lib("Scope", 1)] };
  const place = { id: "cel_yard", kind: "location" as const, name: "Courtyard", description: "", refPaths: [lib("Yard", 2)] };

  it("picks the first usable image of the first cast member and says how many were left out", () => {
    const messy: Element = { ...luz, refPaths: [`other-user/library/x.png`, `${UID}/library/notes.txt`, lib("Missing", 3), LUZ_PATH, lib("Luz 2", 4)] };
    const out = compose({ elements: [messy], exists: p => !p.includes("Missing") && p !== lib("Missing", 3) });
    expect(out.referencePath).toBe(LUZ_PATH);
    expect(out.notes).toEqual([
      "MiniMax H3 takes 1 reference image (the first frame); 1 other was left out.",
      "3 reference images were not usable (not yours, not an image path, or no longer stored) and skipped.",
    ]);
  });

  it("uses the cast order, then the place", () => {
    const withPlace = { ...shot, castIds: ["cel_scope", "cel_luz"], locationId: "cel_yard" };
    expect(compose({ shot: withPlace, elements: [luz, other, place] }).referencePath).toBe(lib("Scope", 1));
    expect(gatherReferences(UID, withPlace, [luz, other, place]).usable).toEqual([lib("Scope", 1), LUZ_PATH, lib("Yard", 2)]);
  });

  it("uses the place image when the cast has none", () => {
    const noRefs = { ...luz, refPaths: [] };
    expect(compose({ shot: { ...shot, locationId: "cel_yard" }, elements: [noRefs, place] }).referencePath).toBe(lib("Yard", 2));
  });

  it("a duplicate path counts once", () => {
    const dup = { ...luz, refPaths: [LUZ_PATH, LUZ_PATH] };
    expect(compose({ elements: [dup] }).notes).toEqual([]);
  });

  it("refuses an animation without any usable image, instead of sending a missing file", () => {
    const err = (() => { try { compose({ elements: [{ ...luz, refPaths: [lib("Gone", 5)] }], exists: () => false }); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(CinemaError);
    expect((err as CinemaError).code).toBe("no_first_frame");
    expect(() => compose({ elements: [{ ...luz, refPaths: [] }] })).toThrow(/no usable reference image/);
  });

  it("applies the same path rule as the server", () => {
    expect(usableReferencePath(UID, LUZ_PATH)).toBe(true);
    for (const bad of [`x/${LUZ_PATH}`, `${UID}/../x.png`, `${UID}/a b.png`, `${UID}/a.gif`, "", `${UID}.png`]) expect(usableReferencePath(UID, bad)).toBe(false);
  });
});

describe("only what the manifest declares is sent", () => {
  it("text video: no reference is sent, and the member is told", () => {
    const out = compose({ mode: "text" });
    expect(out.referencePath).toBeNull();
    expect(toRunParams(H3, out)).not.toHaveProperty("first_frame_path");
    expect(out.notes).toEqual(["Video from text alone does not use reference images. Use a first frame to keep the look."]);
    expect(resolveVariant(h3Manifest, out.values, false)).toBe("t2v");
  });

  it("text video keeps full quality when asked, an animation falls back to turbo with a note", () => {
    expect(compose({ mode: "text", values: { quality: "full" } }).values.quality).toBe("full");
    const anim = compose({ values: { quality: "full" } });
    expect(anim.values.quality).toBe("turbo");
    expect(anim.notes).toContain("Quality set to turbo: it is the only validated workflow with a first frame.");
  });

  it("MOSS (no reference in its manifest): stills never carry a reference, with an explanation", () => {
    const out = composeShot({ userId: UID, project, shot, elements: [luz], mode: "still", model: MOSS });
    expect(out.referencePath).toBeNull();
    expect(toRunParams(MOSS, out)).not.toHaveProperty("first_frame_path");
    expect(out.notes).toEqual(["MOSS-Image does not take reference images, so the cast and place pictures are not used."]);
    expect(out.values).toMatchObject({ prompt: expect.any(String), aspect: "9:16" });
    expect(out.values).not.toHaveProperty("seconds");
    expect(out.prompt).not.toMatch(/camera slowly pushes|Soundscape|Sound:/);
  });

  it("refuses combinations the model cannot do", () => {
    expect(() => compose({ mode: "animate", model: MOSS })).toThrow(CinemaError);
    expect(() => compose({ mode: "text", model: MOSS })).toThrow(/cannot make video from text/);
    expect(() => compose({ mode: "still" })).toThrow(/makes video: pick an image model/);
  });

  it("overrides only keep declared parameters, never the prompt", () => {
    const out = compose({ values: { seed: 7, prompt: "hijack", steps: 999, bogus: 1 } });
    expect(out.values).toMatchObject({ seed: 7 });
    expect(out.values.prompt).toBe(out.prompt);
    expect(out.values).not.toHaveProperty("steps");
    expect(out.values).not.toHaveProperty("bogus");
  });

  it("falls back for a ratio or a length the model lacks, with a note", () => {
    const wide = compose({ project: { ...project, aspect: "21:9" }, shot: { ...shot, duration: 12 } });
    expect(wide.values).toMatchObject({ aspect: "9:16", seconds: 10 });
    expect(wide.notes).toEqual(expect.arrayContaining(["MiniMax H3 cannot make 21:9; it uses 9:16 instead.", "MiniMax H3 makes 2 to 10 seconds; this shot uses 10 s instead of 12 s."]));
    expect(compose({ shot: { ...shot, duration: 1.2 } }).values.seconds).toBe(2);
    expect(compose({ project: { ...project, aspect: "16:9" } }).values.aspect).toBe("16:9");
  });

  it("model capabilities come from the manifest and the catalog", () => {
    const h3 = modelView(H3), moss = modelView(MOSS);
    expect(h3).toMatchObject({ output: "video", canAnimate: true, canText: true, soundPrefix: "Soundscape", maxPrompt: 2000, duration: { min: 2, max: 10, step: 1, default: 5 } });
    expect(h3.reference).toMatchObject({ param: "first_frame_path", label: "First frame", max: 1 });
    expect(moss).toMatchObject({ output: "image", canAnimate: false, canText: false, reference: null, soundPrefix: "Sound" });
  });
});

describe("prompt", () => {
  it("an empty shot sends the default prompt, and an over-long one is cut with a note", () => {
    const empty: Shot = { ...shot, action: "", size: "", angle: "", movement: "", focus: "", lighting: "", sound: "", castIds: [] };
    expect(compose({ shot: empty, elements: [], mode: "text" }).prompt).toBe(EMPTY_PROMPT);
    const long = compose({ shot: { ...shot, action: "x".repeat(2500) }, mode: "text" });
    expect(long.prompt).toHaveLength(2000);
    expect(long.notes).toContain("The prompt was cut to 2000 characters for MiniMax H3.");
  });

  it("stills leave out the camera movement and the sound, a model without native audio says Sound:", () => {
    expect(composePrompt(project, shot, [luz], "still")).not.toMatch(/pushes in|Sound/);
    expect(composePrompt(project, shot, [luz], "animate")).toMatch(/Sound: after a short pause/);
  });

  it("project lighting is the default and the shot's own lighting wins; the look is added", () => {
    const p: Project = { aspect: "9:16", look: { lighting: "golden-hour", filmStock: "35mm-color", grade: "golden-warm", lensFamily: "anamorphic" } };
    const noLight = { ...shot, lighting: "" };
    expect(composePrompt(p, noLight, [], "text")).toMatch(/Lighting: low golden-hour sunlight\. Look: shot on 35mm colour negative film with fine grain, warm golden colour grade, anamorphic lenses/);
    expect(composePrompt(p, shot, [], "text")).toMatch(/Lighting: natural available light/);
  });

  it("every preset id is unique and used presets exist", () => {
    for (const list of [FILM_STOCKS, GRADES, LENS_FAMILIES, LIGHTING_STYLES, SHOT_SIZES, ANGLES, MOVEMENTS, LENSES, FOCUS, MOODS]) {
      expect(new Set(list.map(p => p.id)).size).toBe(list.length);
    }
    expect(Object.keys(CATALOG.shot)).toEqual(["size", "angle", "movement", "lens", "focus", "lighting", "mood"]);
    for (const [list, id] of [[SHOT_SIZES, "full"], [ANGLES, "eye-level"], [MOVEMENTS, "push-in"], [FOCUS, "shallow"], [LIGHTING_STYLES, "natural-light"]] as const) expect(list.some(p => p.id === id)).toBe(true);
  });
});

describe("the composer is pure and read only", () => {
  it("does not touch the network, the database, storage, the environment or any gate", () => {
    for (const f of ["lib/cinema/compose.ts", "lib/cinema/model-view.ts", "lib/cinema/presets.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/fetch\(|supabase|process\.env|localStorage|sessionStorage|\.rpc\(|comfy_admin_gate|comfy_runtime_gates|committed_usd|dispatch|idempotency|admit_/);
    }
  });
  it("keeps the Parallax licence next to the ported code", () => {
    expect(readFileSync("lib/cinema/LICENSE-parallax.txt", "utf8")).toMatch(/MIT License[\s\S]*Copyright \(c\) 2026 Nick Vasilescu/);
    expect(readFileSync("lib/cinema/presets.ts", "utf8")).toMatch(/a98671e3c47fdb12c42789aee821268aa8f23f6c/);
  });
});

describe("framing caution: a shot much tighter than the first frame (Luz pilot, 22/11/2026)", () => {
  const luzFull: Element = { ...luz, refFraming: "full" };
  const withSize = (size: string) => compose({ elements: [luzFull], shot: { ...shot, size } });

  it("warns for the pilot case: a medium shot from the full-length Luz image", () => {
    const out = withSize("medium");
    expect(out.framingWarning).toEqual({ firstFrame: "full", requested: "medium", suggestedSize: "full" });
    expect(out.warnings).toEqual([
      "The first frame is a full but this shot asks for a medium. In a pilot test, a medium shot started from a full-length image gave a double silhouette. Ask for a full with a slow push-in, or use a first image framed like the shot.",
    ]);
  });

  it("does not warn for what worked in the pilot: the same framing (full) or wider (wide)", () => {
    expect(withSize("full").warnings).toEqual([]);
    expect(withSize("wide").warnings).toEqual([]);
    expect(withSize("extreme-wide").framingWarning).toBeNull();
  });

  it("warns from two steps tighter only: one step (medium wide) is untested, so it does not warn", () => {
    expect(withSize("medium-wide").framingWarning).toBeNull();
    for (const tight of ["medium", "medium-close", "close-up", "extreme-close"]) expect(withSize(tight).framingWarning?.requested).toBe(tight);
  });

  it("is silent when the framing of the image is unknown, when the size is off the scale or empty, and for stills or text video", () => {
    expect(compose({ shot: { ...shot, size: "close-up" } }).warnings).toEqual([]);
    for (const size of ["", "insert", "over-shoulder", "pov", "two-shot"]) expect(withSize(size).warnings).toEqual([]);
    expect(compose({ elements: [luzFull], shot: { ...shot, size: "close-up" }, mode: "text" }).warnings).toEqual([]);
    expect(composeShot({ userId: UID, project, shot: { ...shot, size: "close-up" }, elements: [luzFull], mode: "still", model: MOSS }).warnings).toEqual([]);
  });

  it("uses the framing of the element that owns the image actually sent", () => {
    const other: Element = { id: "cel_face", kind: "character", name: "Face", description: "", refPaths: [lib("Face", 7)], refFraming: "close-up" };
    // The first usable image belongs to the face element: a close-up shot matches it, so no caution.
    const faceFirst = compose({ elements: [luzFull, other], shot: { ...shot, size: "close-up", castIds: ["cel_face", "cel_luz"] } });
    expect(faceFirst.referencePath).toBe(lib("Face", 7));
    expect(faceFirst.warnings).toEqual([]);
    // Luz first: the same close-up shot is now far from the full-length image.
    expect(compose({ elements: [luzFull, other], shot: { ...shot, size: "close-up", castIds: ["cel_luz", "cel_face"] } }).framingWarning).not.toBeNull();
  });

  it("never changes the prompt, the values or the selected image (non-blocking)", () => {
    const withWarning = withSize("medium"), without = compose({ shot: { ...shot, size: "medium" } });
    expect(withWarning.prompt).toBe(without.prompt);
    expect(withWarning.values).toEqual(without.values);
    expect(withWarning.referencePath).toBe(without.referencePath);
    expect(without.warnings).toEqual([]);
  });

  it("the scale follows the preset order and covers the sizes the pilot used", () => {
    const ids = SHOT_SIZES.map(s => s.id).filter(id => (FRAMING_SCALE as readonly string[]).includes(id));
    expect(ids).toEqual([...FRAMING_SCALE]);
    expect(TIGHTER_STEPS_WARNING).toBe(2);
    expect(framingStep("full")).toBe(2); expect(framingStep("medium")).toBe(4); expect(framingStep("pov")).toBeNull(); expect(framingStep(undefined)).toBeNull();
  });
});
