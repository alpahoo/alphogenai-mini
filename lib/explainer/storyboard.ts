/**
 * Explainer storyboard mapping — pure, deterministic, no network.
 *
 * Bridges a Research storyboard (research_storyboards.scenes_json, shaped like
 * CinematicScenePlan[] for recent jobs, or {title,prompt,duration_sec} for older
 * ones) into the payload the explainer renderer (build.js) consumes:
 *   { meta: { brand }, scenes: ExplainerScene[] }
 *
 * Used by BOTH the in-app route (Modal render) and the VPS admin script, so the
 * brand derivation + template/voice-over mapping stay identical everywhere.
 */

export interface ExplainerBrand {
  name: string;
  product_url: string;
  logo_url: string;
  primary: string;
  accent: string;
  font: string;
}

export type ExplainerTemplate =
  | "hero"
  | "screenshot_zoom"
  | "bullets"
  | "comparison"
  | "stat"
  | "cta";

export interface ExplainerScene {
  title: string;
  duration_sec: number;
  camera_motion: string | null;
  onscreen_text: string;
  voiceover_line: string;
  source_citation: string | null;
  template: ExplainerTemplate;
  bullets?: string[];
  /** Optional structured data for the `comparison` / `stat` templates. Not set by
   *  mapScenes today (templates fall back to defaults); reserved for the editable
   *  Studio storyboard so composition.ts and build.js stay in lockstep. */
  comparison?: { before_label?: string; before?: string; after_label?: string; after?: string };
  stat?: { value?: string; label?: string };
}

/** Permissive shape: research scenes_json varies by generation date. */
export interface RawScene {
  title?: unknown;
  prompt?: unknown;
  duration_sec?: unknown;
  camera_shot?: unknown;
  camera_motion?: unknown;
  onscreen_text?: unknown;
  voiceover_line?: unknown;
  source_citation?: unknown;
  bullets?: unknown;
}

const DEFAULT_BRAND = { primary: "#10131a", accent: "#6ee7b7", font: "Inter" } as const;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Derive branding for an explainer from the research job. Research storyboards
 * carry no brand block, so we infer from input_url + topic, with an optional
 * caller override (e.g. a known logo/colors).
 */
export function deriveBrand(
  inputUrl: string | null | undefined,
  topic: string | null | undefined,
  override?: Partial<ExplainerBrand> | null,
): ExplainerBrand {
  let name = str(topic) || "Product";
  let productUrl = "";
  const url = str(inputUrl);
  if (url) {
    try {
      const u = new URL(url);
      productUrl = u.origin;
      const host = u.hostname.replace(/^www\./, "").split(".")[0];
      if (host) name = host.charAt(0).toUpperCase() + host.slice(1);
    } catch {
      /* keep topic */
    }
  }
  return {
    name,
    product_url: productUrl,
    logo_url: "",
    ...DEFAULT_BRAND,
    ...(override || {}),
  };
}

/** Choose a template per scene: hero first, CTA last, screenshot for screen
 *  captures, then cycle through text layouts. Deterministic. */
function templateFor(scene: RawScene, i: number, last: number, cycleState: { c: number }): ExplainerTemplate {
  if (i === 0) return "hero";
  if (i === last) return "cta";
  if (str(scene.camera_shot) === "screen_capture") return "screenshot_zoom";
  const cycle: ExplainerTemplate[] = ["bullets", "stat", "comparison"];
  return cycle[cycleState.c++ % cycle.length];
}

/** Resolve the spoken line: prefer the cinematic voiceover_line, else the
 *  scene prompt (older format), else the on-screen text/title. */
function voiceoverFor(scene: RawScene): string {
  return str(scene.voiceover_line) || str(scene.prompt) || str(scene.onscreen_text) || str(scene.title);
}

export function mapScenes(rawScenes: unknown): ExplainerScene[] {
  const scenes = Array.isArray(rawScenes) ? (rawScenes as RawScene[]) : [];
  const last = scenes.length - 1;
  const cycleState = { c: 0 };
  return scenes.map((s, i) => {
    const bullets = Array.isArray(s.bullets) ? s.bullets.map(str).filter(Boolean) : undefined;
    return {
      title: str(s.title) || `Scene ${i + 1}`,
      duration_sec: Number(s.duration_sec) > 0 ? Number(s.duration_sec) : 6,
      camera_motion: str(s.camera_motion) || null,
      onscreen_text: str(s.onscreen_text) || str(s.title) || "",
      voiceover_line: voiceoverFor(s),
      source_citation: str(s.source_citation) || null,
      template: templateFor(s, i, last, cycleState),
      ...(bullets && bullets.length ? { bullets } : {}),
    };
  });
}

export interface ExplainerStoryboard {
  meta: { brand: ExplainerBrand };
  scenes: ExplainerScene[];
}

/** Build the full renderer payload from a research job + its storyboard. */
export function buildExplainerStoryboard(
  job: { input_url?: string | null; topic?: string | null },
  scenesJson: unknown,
  override?: Partial<ExplainerBrand> | null,
): ExplainerStoryboard {
  return {
    meta: { brand: deriveBrand(job.input_url, job.topic, override) },
    scenes: mapScenes(scenesJson),
  };
}
