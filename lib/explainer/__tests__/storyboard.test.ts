import { describe, it, expect } from 'vitest';
import {
  deriveBrand,
  mapScenes,
  buildExplainerStoryboard,
  sanitizeEditedScenes,
} from '@/lib/explainer/storyboard';

describe('sanitizeEditedScenes', () => {
  it('preserves a valid user-picked template (unlike mapScenes positional assignment)', () => {
    const out = sanitizeEditedScenes([
      { template: 'stat', onscreen_text: 'A', duration_sec: 5 },
      { template: 'comparison', onscreen_text: 'B', duration_sec: 6 },
    ]);
    expect(out.map((s) => s.template)).toEqual(['stat', 'comparison']);
  });

  it('falls back invalid templates/motions to safe defaults', () => {
    const [s] = sanitizeEditedScenes([{ template: 'evil', camera_motion: 'zoom_warp', onscreen_text: 'x' }]);
    expect(s.template).toBe('hero');
    expect(s.camera_motion).toBeNull();
  });

  it('clamps duration to [2,30] and defaults non-positive values', () => {
    expect(sanitizeEditedScenes([{ duration_sec: 999 }])[0].duration_sec).toBe(30);
    expect(sanitizeEditedScenes([{ duration_sec: 0 }])[0].duration_sec).toBe(6);
    expect(sanitizeEditedScenes([{ duration_sec: 1 }])[0].duration_sec).toBe(2);
  });

  it('coerces + length-caps text fields and ignores non-string junk', () => {
    const long = 'a'.repeat(2000);
    const [s] = sanitizeEditedScenes([
      { onscreen_text: long, voiceover_line: { evil: true }, title: 42, source_citation: '' },
    ]);
    expect(s.onscreen_text.length).toBe(600);
    expect(s.voiceover_line).toBe('');
    expect(s.title).toBe('Scene 1');
    expect(s.source_citation).toBeNull();
  });

  it('caps scene count at 30 and bullets at 6', () => {
    const many = Array.from({ length: 50 }, () => ({ template: 'hero', onscreen_text: 'x' }));
    expect(sanitizeEditedScenes(many)).toHaveLength(30);
    const [s] = sanitizeEditedScenes([{ template: 'bullets', bullets: Array.from({ length: 20 }, (_, i) => `b${i}`) }]);
    expect(s.bullets).toHaveLength(6);
  });

  it('returns [] for non-array input', () => {
    expect(sanitizeEditedScenes(null)).toEqual([]);
    expect(sanitizeEditedScenes('nope')).toEqual([]);
  });
});

describe('deriveBrand', () => {
  it('derives name + product_url from input_url', () => {
    const b = deriveBrand('https://www.wise.com/pricing', 'Some topic');
    expect(b.name).toBe('Wise');
    expect(b.product_url).toBe('https://www.wise.com');
    expect(b.font).toBe('Inter');
  });

  it('falls back to topic when no url', () => {
    const b = deriveBrand(null, 'My Product Launch');
    expect(b.name).toBe('My Product Launch');
    expect(b.product_url).toBe('');
  });

  it('applies overrides last', () => {
    const b = deriveBrand('https://openai.com', 'x', { name: 'OpenAI', accent: '#10a37f' });
    expect(b.name).toBe('OpenAI');
    expect(b.accent).toBe('#10a37f');
  });

  it('tolerates a malformed url', () => {
    const b = deriveBrand('not-a-url', 'Fallback');
    expect(b.name).toBe('Fallback');
    expect(b.product_url).toBe('');
  });
});

describe('mapScenes — template assignment', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ title: `S${i}`, duration_sec: 5 }));
  it('hero first, cta last, cycles the middle', () => {
    const m = mapScenes(six);
    expect(m[0].template).toBe('hero');
    expect(m[5].template).toBe('cta');
    expect(m.slice(1, 5).map((s) => s.template)).toEqual(['bullets', 'stat', 'comparison', 'bullets']);
  });

  it('uses screenshot_zoom for screen_capture shots', () => {
    const scenes = [
      { title: 'a' },
      { title: 'b', camera_shot: 'screen_capture' },
      { title: 'c' },
    ];
    expect(mapScenes(scenes)[1].template).toBe('screenshot_zoom');
  });

  it('returns [] for non-array input', () => {
    expect(mapScenes(null)).toEqual([]);
    expect(mapScenes({})).toEqual([]);
  });
});

describe('mapScenes — voice-over resolution', () => {
  it('prefers voiceover_line (new format)', () => {
    const m = mapScenes([{ title: 't', voiceover_line: 'spoken', prompt: 'visual', onscreen_text: 'os' }]);
    expect(m[0].voiceover_line).toBe('spoken');
  });
  it('falls back to prompt (old format), then onscreen, then title', () => {
    expect(mapScenes([{ title: 't', prompt: 'p' }])[0].voiceover_line).toBe('p');
    expect(mapScenes([{ title: 't', onscreen_text: 'os' }])[0].voiceover_line).toBe('os');
    expect(mapScenes([{ title: 't' }])[0].voiceover_line).toBe('t');
  });
  it('defaults duration to 6 when missing/invalid', () => {
    expect(mapScenes([{ title: 't' }])[0].duration_sec).toBe(6);
    expect(mapScenes([{ title: 't', duration_sec: 0 }])[0].duration_sec).toBe(6);
    expect(mapScenes([{ title: 't', duration_sec: 9 }])[0].duration_sec).toBe(9);
  });
  it('keeps clean bullets when provided', () => {
    const m = mapScenes([{ title: 'a' }, { title: 'b', bullets: ['x', '', '  y '] }, { title: 'c' }]);
    expect(m[1].bullets).toEqual(['x', 'y']);
  });
});

describe('buildExplainerStoryboard', () => {
  it('assembles meta.brand + mapped scenes', () => {
    const sb = buildExplainerStoryboard(
      { input_url: 'https://wise.com', topic: 'Wise promo' },
      [{ title: 'Hook', voiceover_line: 'hello', duration_sec: 5 }],
    );
    expect(sb.meta.brand.name).toBe('Wise');
    expect(sb.scenes).toHaveLength(1);
    expect(sb.scenes[0].template).toBe('hero');
    expect(sb.scenes[0].voiceover_line).toBe('hello');
  });
});
