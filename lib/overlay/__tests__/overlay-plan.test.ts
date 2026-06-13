import { describe, it, expect } from 'vitest';
import { buildOverlayPlan, type OverlayPlanInput } from '@/lib/overlay/overlay-plan';

function baseInput(overrides: Partial<OverlayPlanInput> = {}): OverlayPlanInput {
  return {
    scenes: [
      { title: 'Intro', duration_sec: 5, voiceover_line: 'Welcome to the breakdown.', source_citation: 'OpenAI News' },
      { title: 'Body', duration_sec: 6, voiceover_line: 'Here is what changed.', source_citation: null },
      { title: 'Close', duration_sec: 4, voiceover_line: '', source_citation: 'help.openai.com' },
    ],
    angle: { title: 'The angle', hook: 'A compelling hook line.' },
    ...overrides,
  };
}

describe('buildOverlayPlan', () => {
  it('disables and returns no elements for empty scenes', () => {
    const plan = buildOverlayPlan({ scenes: [] });
    expect(plan.enabled).toBe(false);
    expect(plan.elements).toEqual([]);
  });

  it('emits captions per scene with cumulative timing, skipping empty voiceover', () => {
    const plan = buildOverlayPlan(baseInput());
    const captions = plan.elements.filter((e) => e.kind === 'caption');
    expect(captions).toHaveLength(2); // scene 3 has empty voiceover_line
    expect(captions[0]).toMatchObject({ text: 'Welcome to the breakdown.', start_sec: 0, end_sec: 5, position: 'bottom' });
    expect(captions[1]).toMatchObject({ text: 'Here is what changed.', start_sec: 5, end_sec: 11 });
  });

  it('emits one opening lower-third from the angle, capped to <=4s', () => {
    const plan = buildOverlayPlan(baseInput());
    const lts = plan.elements.filter((e) => e.kind === 'lower_third');
    expect(lts).toHaveLength(1);
    expect(lts[0]).toMatchObject({ text: 'The angle', subtext: 'A compelling hook line.', start_sec: 0, position: 'lower_third' });
    expect(lts[0].end_sec).toBeLessThanOrEqual(4);
  });

  it('emits source_card only for scenes with a citation, capped window, top position', () => {
    const plan = buildOverlayPlan(baseInput());
    const cards = plan.elements.filter((e) => e.kind === 'source_card');
    expect(cards.map((c) => c.text)).toEqual(['OpenAI News', 'help.openai.com']);
    for (const c of cards) {
      expect(c.position).toBe('top');
      expect(c.end_sec - c.start_sec).toBeLessThanOrEqual(4);
    }
    // scene 3 (Close) window starts at 11
    expect(cards[1].start_sec).toBe(11);
  });

  it('respects option flags to disable element kinds', () => {
    const plan = buildOverlayPlan(
      baseInput({ options: { captions: false, lowerThird: false, sourceCards: true } }),
    );
    expect(plan.elements.every((e) => e.kind === 'source_card')).toBe(true);
  });

  it('applies brand defaults and passthrough', () => {
    const d = buildOverlayPlan(baseInput());
    expect(d.brand).toMatchObject({ logo_url: null, logo_position: 'br', logo_opacity: 0.9, watermark_text: null });

    const b = buildOverlayPlan(
      baseInput({ brand: { logo_url: 'https://cdn.x/logo.png', logo_position: 'tl', logo_opacity: 0.5, watermark_text: 'AlphoGen' } }),
    );
    expect(b.brand).toMatchObject({
      logo_url: 'https://cdn.x/logo.png',
      logo_position: 'tl',
      logo_opacity: 0.5,
      watermark_text: 'AlphoGen',
    });
  });

  it('is enabled when only brand is set (no text elements)', () => {
    const plan = buildOverlayPlan({
      scenes: [{ duration_sec: 5, voiceover_line: '', source_citation: '' }],
      angle: null,
      brand: { watermark_text: 'AlphoGen' },
    });
    expect(plan.elements).toHaveLength(0);
    expect(plan.enabled).toBe(true);
  });

  it('caps long text fields', () => {
    const plan = buildOverlayPlan({
      scenes: [{ duration_sec: 5, voiceover_line: 'x'.repeat(500), source_citation: 'y'.repeat(300) }],
      angle: { title: 't'.repeat(300), hook: 'h'.repeat(300) },
    });
    const caption = plan.elements.find((e) => e.kind === 'caption')!;
    const lt = plan.elements.find((e) => e.kind === 'lower_third')!;
    const card = plan.elements.find((e) => e.kind === 'source_card')!;
    expect(caption.text.length).toBeLessThanOrEqual(200);
    expect(lt.text.length).toBeLessThanOrEqual(120);
    expect((lt.subtext ?? '').length).toBeLessThanOrEqual(160);
    expect(card.text.length).toBeLessThanOrEqual(120);
  });

  it('is deterministic and leaks no provider names', () => {
    const a = JSON.stringify(buildOverlayPlan(baseInput()));
    const b = JSON.stringify(buildOverlayPlan(baseInput()));
    expect(a).toBe(b);
    for (const name of ['groq', 'openai api', 'litellm', 'jina', 'anthropic', 'claude', 'heygen', 'seedance']) {
      expect(a.toLowerCase()).not.toContain(name);
    }
  });
});
