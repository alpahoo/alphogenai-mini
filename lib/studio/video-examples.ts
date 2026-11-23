/**
 * Starter prompts for the Studio Video screen: the sample list of the Parallax Video studio, without its artwork.
 *
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/content/video.ts (`videoExamples`, `videoCopy.categories`). Differences: plain text tiles (no images are copied),
 * and the prompts only fill the form: nothing is generated, reserved or sent until the administrator presses Generate.
 * See components/studio/video/LICENSE-parallax.txt.
 */
export type ExampleShape = "wide" | "photo" | "tall";

export const EXAMPLE_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "nature", label: "Nature" },
  { id: "city", label: "City" },
  { id: "people", label: "People" },
  { id: "product", label: "Product" },
  { id: "motion", label: "Motion" },
  { id: "stylised", label: "Stylised" },
] as const;

export type ExampleCategory = Exclude<(typeof EXAMPLE_CATEGORIES)[number]["id"], "all">;

export interface VideoExample { id: string; category: ExampleCategory; shape: ExampleShape; prompt: string }

export const VIDEO_EXAMPLES: readonly VideoExample[] = [
  { id: "harbour-dawn", category: "nature", shape: "wide", prompt: "Slow push-in over a quiet fishing harbour at dawn, mist on the water, gulls lifting off the masts" },
  { id: "neon-rain", category: "city", shape: "photo", prompt: "Handheld tracking shot down a rain-soaked night street, neon signs reflecting in puddles, people with umbrellas" },
  { id: "dancer-studio", category: "people", shape: "tall", prompt: "A dancer spins in an empty sunlit studio, dust in the light beams, camera circles slowly around her" },
  { id: "sneaker-turn", category: "product", shape: "tall", prompt: "A white sneaker turning on a glossy pedestal, soft studio light, clean grey backdrop, smooth 360 orbit" },
  { id: "desert-drone", category: "nature", shape: "tall", prompt: "Drone rising over red desert dunes at sunset, long shadows, a lone jeep leaving a trail of dust" },
  { id: "paper-city", category: "stylised", shape: "wide", prompt: "A papercraft city unfolds from a book, tiny cars start moving, warm stop-motion feel" },
  { id: "coffee-pour", category: "product", shape: "photo", prompt: "Macro slow motion of milk poured into black coffee, swirling patterns, morning window light" },
  { id: "skate-park", category: "motion", shape: "wide", prompt: "A skateboarder drops into a concrete bowl, low angle follow cam, golden hour, fisheye lens" },
  { id: "market-crowd", category: "city", shape: "tall", prompt: "Time-lapse of a busy night market, lanterns glowing, crowds streaming between food stalls" },
  { id: "forest-fox", category: "nature", shape: "photo", prompt: "A red fox steps out of a snowy forest and looks into the camera, breath visible in the cold air" },
  { id: "chef-flame", category: "people", shape: "wide", prompt: "A chef flips vegetables in a flaming wok, sparks and steam, kitchen bustle in the background" },
  { id: "ink-ocean", category: "stylised", shape: "tall", prompt: "Ink-wash painting of ocean waves that start to move and crash, brush strokes trailing behind" },
];

/** The examples of one category; "all" gives every example, an unknown category gives none. */
export function examplesIn(category: string): VideoExample[] {
  return category === "all" ? [...VIDEO_EXAMPLES] : VIDEO_EXAMPLES.filter(e => e.category === category);
}
