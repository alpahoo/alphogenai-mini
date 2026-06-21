import { describe, it, expect } from 'vitest';
import {
  buildCompositionHtml,
  compositionDurationSec,
  COMPOSITION_WIDTH,
  COMPOSITION_HEIGHT,
  type CompositionAssets,
} from '@/lib/explainer/composition';
import { buildExplainerStoryboard, type ExplainerStoryboard } from '@/lib/explainer/storyboard';

function storyboard(): ExplainerStoryboard {
  // Goes through the real mapper so the test reflects production data shape.
  return buildExplainerStoryboard(
    { input_url: 'https://www.wise.com/pricing', topic: 'Wise pricing' },
    [
      { title: 'Intro', onscreen_text: 'Send money abroad', duration_sec: 5, voiceover_line: 'Hello there' },
      { title: 'Proof', onscreen_text: 'Cheaper transfers', duration_sec: 6, bullets: ['Low fees', 'Real rate'] },
      { title: 'Numbers', onscreen_text: '0.5%', duration_sec: 4 },
      { title: 'Outro', onscreen_text: 'Try Wise', duration_sec: 5 },
    ],
  );
}

describe('buildCompositionHtml', () => {
  it('emits a valid single-composition HTML document at 1920x1080', () => {
    const html = buildCompositionHtml(storyboard());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain(`data-width="${COMPOSITION_WIDTH}"`);
    expect(html).toContain(`data-height="${COMPOSITION_HEIGHT}"`);
    expect(COMPOSITION_WIDTH).toBe(1920);
    expect(COMPOSITION_HEIGHT).toBe(1080);
  });

  it('renders one .clip section per scene with sequential data-start offsets', () => {
    const html = buildCompositionHtml(storyboard());
    expect(html.match(/id="sc\d+" class="clip"/g)).toHaveLength(4);
    // scene 0 starts at 0, scene 1 at 5 (after a 5s hero), scene 2 at 11, scene 3 at 15
    expect(html).toContain('id="sc0" class="clip" data-start="0" data-duration="5"');
    expect(html).toContain('id="sc1" class="clip" data-start="5" data-duration="6"');
    expect(html).toContain('id="sc2" class="clip" data-start="11" data-duration="4"');
    expect(html).toContain('id="sc3" class="clip" data-start="15" data-duration="5"');
  });

  it('sets the root duration to the sum of scene durations', () => {
    const html = buildCompositionHtml(storyboard());
    expect(html).toContain('data-start="0" data-duration="20" data-width=');
    expect(compositionDurationSec(storyboard())).toBe(20);
  });

  it('exposes a paused GSAP timeline under window.__timelines["main"]', () => {
    const html = buildCompositionHtml(storyboard());
    expect(html).toContain('gsap.timeline({ paused: true })');
    expect(html).toContain('window.__timelines["main"] = tl;');
    expect(html).toContain('cdn.jsdelivr.net/npm/gsap');
  });

  it('uses hero first and cta last (template-specific markers)', () => {
    const html = buildCompositionHtml(storyboard());
    // hero has the 104px headline; cta has the pill button with 60px radius
    expect(html).toContain('font-size:104px');
    expect(html).toContain('border-radius:60px');
  });

  it('escapes HTML in on-screen text to prevent markup injection', () => {
    const sb = buildExplainerStoryboard({ input_url: null, topic: 'X' }, [
      { title: 'a', onscreen_text: '<script>alert("x")</script> & more', duration_sec: 5 },
      { title: 'b', onscreen_text: 'end', duration_sec: 5 },
    ]);
    const html = buildCompositionHtml(sb);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; more');
    expect(html).not.toContain('<script>alert');
  });

  it('adds an <audio> track and extends the scene to fit narration', () => {
    const sb = storyboard();
    const assets: CompositionAssets = { audio: [{ scene_index: 0, url: 'https://r2/voice0.mp3', duration_sec: 7.2 }] };
    const html = buildCompositionHtml(sb, assets);
    expect(html).toContain('<audio class="clip"');
    expect(html).toContain('src="https://r2/voice0.mp3"');
    // planned 5s < narration 7.2 + 0.7 tail = 7.9s → scene 0 extended to 7.9
    expect(html).toContain('id="sc0" class="clip" data-start="0" data-duration="7.9"');
    expect(compositionDurationSec(sb, assets)).toBeCloseTo(22.9, 5);
  });

  it('injects a Google Fonts link for the brand font', () => {
    const html = buildCompositionHtml(storyboard());
    expect(html).toContain('fonts.googleapis.com/css2?family=Inter');
  });

  it('is deterministic — same input yields identical HTML', () => {
    expect(buildCompositionHtml(storyboard())).toBe(buildCompositionHtml(storyboard()));
  });
});
