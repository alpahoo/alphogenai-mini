/**
 * Post-Production Overlay Plan (T-1111b) — pure, deterministic, no runtime.
 *
 * Builds an OverlayPlan (payload-only contract) from Research storyboard data +
 * scene timings. The plan describes EXACT text + branding to burn onto the
 * finished video in a later deterministic Modal pass (T-1111c). Text comes from
 * Research data (script/angle/source citations), never from the video model —
 * this is what eliminates hallucinated on-screen text. No network, no provider
 * names, no migration.
 *
 * V1 element set: caption (per scene), lower_third (opening title), source_card,
 * plus brand (logo passthrough + watermark). stat_card/model_card are reserved.
 */

export type OverlayKind =
  | 'title'
  | 'lower_third'
  | 'caption'
  | 'source_card'
  | 'stat_card'
  | 'model_card'
  | 'custom';

export type OverlayPosition = 'top' | 'center' | 'lower_third' | 'bottom';
export type LogoPosition = 'tl' | 'tr' | 'bl' | 'br';

export interface OverlayElement {
  kind: OverlayKind;
  text: string;
  subtext: string | null;
  start_sec: number;
  end_sec: number;
  position: OverlayPosition;
}

export interface OverlayBrand {
  logo_url: string | null;
  logo_position: LogoPosition;
  logo_opacity: number;
  watermark_text: string | null;
}

export interface OverlayPlan {
  enabled: boolean;
  safe_area_pct: number;
  brand: OverlayBrand;
  elements: OverlayElement[];
}

export interface OverlayScene {
  title?: unknown;
  duration_sec?: unknown;
  voiceover_line?: unknown;
  source_citation?: unknown;
  onscreen_text?: unknown;
}

export interface OverlayPlanInput {
  scenes: OverlayScene[];
  angle?: { title?: string | null; hook?: string | null } | null;
  brand?: Partial<OverlayBrand> | null;
  options?: {
    safeAreaPct?: number;
    captions?: boolean;
    lowerThird?: boolean;
    sourceCards?: boolean;
  };
}

const TITLE_MAX = 120;
const SUBTEXT_MAX = 160;
const CAPTION_MAX = 200;
const SOURCE_MAX = 120;
const SOURCE_CARD_MAX_SEC = 4;
const DEFAULT_SAFE_AREA_PCT = 5;
const MAX_ELEMENTS = 200;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDuration(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(600, n);
}

function defaultBrand(brand?: Partial<OverlayBrand> | null): OverlayBrand {
  const position = brand?.logo_position;
  const opacity = brand?.logo_opacity;
  return {
    logo_url: str(brand?.logo_url) || null,
    logo_position: position === 'tl' || position === 'tr' || position === 'bl' || position === 'br' ? position : 'br',
    logo_opacity: typeof opacity === 'number' && opacity >= 0 && opacity <= 1 ? round2(opacity) : 0.9,
    watermark_text: str(brand?.watermark_text) || null,
  };
}

/**
 * Build a deterministic OverlayPlan from Research scenes + angle + brand.
 * Identical inputs always produce identical output.
 */
export function buildOverlayPlan(input: OverlayPlanInput): OverlayPlan {
  const opts = input.options ?? {};
  const wantCaptions = opts.captions !== false;
  const wantLowerThird = opts.lowerThird !== false;
  const wantSourceCards = opts.sourceCards !== false;
  const safe_area_pct =
    typeof opts.safeAreaPct === 'number' && opts.safeAreaPct >= 0 && opts.safeAreaPct <= 40
      ? opts.safeAreaPct
      : DEFAULT_SAFE_AREA_PCT;

  const brand = defaultBrand(input.brand);
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];

  if (scenes.length === 0) {
    return { enabled: false, safe_area_pct, brand, elements: [] };
  }

  // Cumulative scene windows.
  const windows: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of scenes) {
    const dur = toDuration(s.duration_sec);
    windows.push({ start: round2(cursor), end: round2(cursor + dur) });
    cursor += dur;
  }

  const elements: OverlayElement[] = [];

  // Opening lower-third from the selected angle (title + hook).
  if (wantLowerThird && input.angle) {
    const title = cap(str(input.angle.title), TITLE_MAX);
    if (title) {
      const first = windows[0];
      elements.push({
        kind: 'lower_third',
        text: title,
        subtext: cap(str(input.angle.hook), SUBTEXT_MAX) || null,
        start_sec: first.start,
        end_sec: round2(Math.min(first.end, first.start + Math.min(first.end - first.start, 4))),
        position: 'lower_third',
      });
    }
  }

  scenes.forEach((scene, i) => {
    const win = windows[i];

    if (wantCaptions) {
      const line = cap(str(scene.voiceover_line), CAPTION_MAX);
      if (line) {
        elements.push({
          kind: 'caption',
          text: line,
          subtext: null,
          start_sec: win.start,
          end_sec: win.end,
          position: 'bottom',
        });
      }
    }

    if (wantSourceCards) {
      const citation = cap(str(scene.source_citation), SOURCE_MAX);
      if (citation) {
        elements.push({
          kind: 'source_card',
          text: citation,
          subtext: null,
          start_sec: win.start,
          end_sec: round2(Math.min(win.end, win.start + SOURCE_CARD_MAX_SEC)),
          position: 'top',
        });
      }
    }
  });

  return {
    enabled: elements.length > 0 || brand.logo_url !== null || brand.watermark_text !== null,
    safe_area_pct,
    brand,
    elements: elements.slice(0, MAX_ELEMENTS),
  };
}
