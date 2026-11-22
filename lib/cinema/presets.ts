/**
 * Cinema presets: shot sizes, angles, camera movements, lenses, lighting, moods, project look.
 *
 * Ported unchanged from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu),
 * https://github.com/nickvasilescu/parallax, commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * file src/server/cinema/presets.ts. The licence text is in lib/cinema/LICENSE-parallax.txt.
 * Preset ids are stable: never rename one, add a new entry instead.
 */
/**
 * The cinema preset catalog, as data. Each entry has an id (stored), a label (shown)
 * and a `phrase` the prompt composer writes into the prompt. Ids are stable: never
 * rename one, add a new entry instead.
 */

export interface Preset {
  id: string;
  label: string;
  phrase: string;
}

const p = (id: string, label: string, phrase: string): Preset => ({ id, label, phrase });

/* ------------------------------ project look ------------------------------ */

export const FILM_STOCKS: Preset[] = [
  p("digital-clean", "Clean digital", "shot on a clean modern digital cinema camera"),
  p("35mm-color", "35mm colour negative", "shot on 35mm colour negative film with fine grain"),
  p("16mm-grain", "16mm grainy", "shot on 16mm film with visible grain and soft edges"),
  p("super8-home", "Super 8 home movie", "shot on Super 8 film, warm faded colours and heavy grain"),
  p("bw-silver", "Black and white silver", "black and white film with rich silver tones"),
  p("video-90s", "1990s camcorder", "1990s camcorder video with soft detail and slight colour bleed"),
];

export const GRADES: Preset[] = [
  p("natural", "Natural", "natural, true-to-life colour"),
  p("teal-orange", "Teal and orange", "teal shadows and warm orange skin tones"),
  p("bleach-bypass", "Bleach bypass", "desaturated, high-contrast bleach bypass grade"),
  p("golden-warm", "Golden warm", "warm golden colour grade"),
  p("cold-steel", "Cold steel", "cold blue-steel colour grade"),
  p("pastel-soft", "Soft pastel", "soft pastel palette with lifted blacks"),
  p("neon-night", "Neon night", "saturated magenta and cyan neon palette"),
  p("sepia-age", "Aged sepia", "aged sepia tones"),
];

export const LENS_FAMILIES: Preset[] = [
  p("spherical-sharp", "Sharp spherical", "sharp modern spherical lenses"),
  p("anamorphic", "Anamorphic", "anamorphic lenses with oval bokeh and horizontal flares"),
  p("vintage-soft", "Vintage soft", "vintage lenses with gentle softness and blooming highlights"),
  p("tilt-shift", "Tilt-shift", "tilt-shift lens with a narrow plane of focus"),
];

export const LIGHTING_STYLES: Preset[] = [
  p("natural-light", "Natural light", "natural available light"),
  p("high-key", "High key", "bright, even high-key lighting"),
  p("low-key", "Low key", "low-key lighting with deep shadows"),
  p("golden-hour", "Golden hour", "low golden-hour sunlight"),
  p("blue-hour", "Blue hour", "cool blue-hour twilight"),
  p("chiaroscuro", "Chiaroscuro", "strong chiaroscuro contrast from a single hard source"),
  p("practical-neon", "Neon practicals", "lit by neon signs and practical lights"),
  p("overcast-soft", "Soft overcast", "soft, diffused overcast light"),
  p("candlelight", "Candlelight", "flickering warm candlelight"),
];

/* ---------------------------------- shot ---------------------------------- */

export const SHOT_SIZES: Preset[] = [
  p("extreme-wide", "Extreme wide", "Extreme wide shot"),
  p("wide", "Wide", "Wide shot"),
  p("full", "Full", "Full shot"),
  p("medium-wide", "Medium wide", "Medium wide shot"),
  p("medium", "Medium", "Medium shot"),
  p("medium-close", "Medium close-up", "Medium close-up"),
  p("close-up", "Close-up", "Close-up"),
  p("extreme-close", "Extreme close-up", "Extreme close-up"),
  p("insert", "Insert", "Insert shot of a detail"),
  p("over-shoulder", "Over the shoulder", "Over-the-shoulder shot"),
  p("pov", "Point of view", "Point-of-view shot"),
  p("two-shot", "Two-shot", "Two-shot"),
];

export const ANGLES: Preset[] = [
  p("eye-level", "Eye level", "at eye level"),
  p("low", "Low angle", "from a low angle"),
  p("high", "High angle", "from a high angle"),
  p("overhead", "Overhead", "from directly overhead"),
  p("dutch", "Dutch tilt", "with a tilted Dutch angle"),
  p("worms-eye", "Ground level", "from ground level looking up"),
  p("aerial", "Aerial", "from high in the air"),
];

export const MOVEMENTS: Preset[] = [
  p("static", "Locked off", "The camera is locked off and still."),
  p("push-in", "Push in", "The camera slowly pushes in."),
  p("pull-out", "Pull out", "The camera slowly pulls back."),
  p("pan-left", "Pan left", "The camera pans left."),
  p("pan-right", "Pan right", "The camera pans right."),
  p("tilt-up", "Tilt up", "The camera tilts up."),
  p("tilt-down", "Tilt down", "The camera tilts down."),
  p("track-left", "Track left", "The camera tracks sideways to the left."),
  p("track-right", "Track right", "The camera tracks sideways to the right."),
  p("follow", "Follow", "The camera follows the subject from behind."),
  p("lead", "Lead", "The camera moves backwards ahead of the subject."),
  p("orbit", "Orbit", "The camera orbits around the subject."),
  p("crane-up", "Crane up", "The camera rises on a crane."),
  p("crane-down", "Crane down", "The camera descends on a crane."),
  p("handheld", "Handheld", "Handheld camera with natural shake."),
  p("dolly-zoom", "Dolly zoom", "A dolly zoom warps the background behind the subject."),
  p("whip-pan", "Whip pan", "A fast whip pan."),
  p("drone-fly", "Drone flyover", "A smooth drone flyover."),
];

export const LENSES: Preset[] = [
  p("14mm", "14mm ultra wide", "14mm ultra-wide lens"),
  p("24mm", "24mm wide", "24mm wide lens"),
  p("35mm", "35mm", "35mm lens"),
  p("50mm", "50mm normal", "50mm lens"),
  p("85mm", "85mm portrait", "85mm portrait lens"),
  p("135mm", "135mm telephoto", "135mm telephoto lens"),
  p("macro", "Macro", "macro lens"),
  p("fisheye", "Fisheye", "fisheye lens"),
];

export const FOCUS: Preset[] = [
  p("shallow", "Shallow", "shallow depth of field with a soft background"),
  p("medium", "Medium", "moderate depth of field"),
  p("deep", "Deep", "deep focus, everything sharp"),
  p("rack", "Rack focus", "focus racks from foreground to background"),
];

export const MOODS: Preset[] = [
  p("tense", "Tense", "tense"),
  p("calm", "Calm", "calm"),
  p("joyful", "Joyful", "joyful"),
  p("melancholy", "Melancholy", "melancholic"),
  p("mysterious", "Mysterious", "mysterious"),
  p("romantic", "Romantic", "romantic"),
  p("eerie", "Eerie", "eerie"),
  p("epic", "Epic", "epic"),
  p("playful", "Playful", "playful"),
  p("gritty", "Gritty", "gritty"),
];

export const ASPECTS = ["16:9", "21:9", "4:3", "1:1", "9:16"] as const;

/** Every list, keyed the way the API and the shot fields name them. */
export const CATALOG = {
  look: { filmStock: FILM_STOCKS, grade: GRADES, lensFamily: LENS_FAMILIES, lighting: LIGHTING_STYLES },
  shot: { size: SHOT_SIZES, angle: ANGLES, movement: MOVEMENTS, lens: LENSES, focus: FOCUS, lighting: LIGHTING_STYLES, mood: MOODS },
  aspects: ASPECTS,
};

export function presetById(list: Preset[], id: string | null | undefined): Preset | undefined {
  return id ? list.find((x) => x.id === id) : undefined;
}
