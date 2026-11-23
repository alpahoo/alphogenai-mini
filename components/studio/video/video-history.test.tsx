import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StudioRun } from "../types";
import type { StudioState } from "../use-studio";
import { HistorySkeleton, VideoHistory } from "./video-history";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const mp4 = (role: string, id: string) => ({ id, role, mime: "video/mp4" });
const base = { error_code: null, generation_seconds: null, template_version: "minimax-h3@1" };

function state(history: StudioRun[] | null) {
  const signMedia = vi.fn(async () => "https://private.example/signed");
  const s = { history, media: {}, signMedia, retryDispatch: vi.fn(), reuse: vi.fn() } as unknown as StudioState;
  return { s, signMedia };
}
const render = (history: StudioRun[] | null) => { const { s, signMedia } = state(history); return { html: renderToStaticMarkup(<VideoHistory s={s} onOpen={() => undefined} />), signMedia }; };

describe("Video screen tiles", () => {
  const history: StudioRun[] = [
    { ...base, id: "done-1", status: "done", params_effective: { prompt: "A finished fox", aspect: "9:16", seconds: 5 }, assets: [mp4("final", "a1"), mp4("raw", "a2")] },
    { ...base, id: "queued-undelivered", status: "queued", dispatched: false, params_effective: { prompt: "Waiting for dispatch", aspect: "16:9" }, assets: [] },
    { ...base, id: "queued-delivered", status: "queued", dispatched: true, params_effective: { prompt: "Waiting for the GPU" }, assets: [] },
    { ...base, id: "failed-1", status: "failed", error_code: "GPU_START_TIMEOUT", params_effective: { prompt: "A failed run" }, assets: [] },
    { ...base, id: "image-1", status: "done", template_version: "moss-image@1", params_effective: { prompt: "An image, not a video" }, assets: [{ id: "i1", role: "raw", mime: "image/png" }] },
  ];

  it("draws one tile per video run and none for image runs", () => {
    const { html } = render(history);
    expect(html).toContain("A finished fox");
    expect(html).toContain("Waiting for dispatch");
    expect(html).toContain("A failed run");
    expect(html).not.toContain("An image, not a video");
    expect(html.match(/data-status="queued"/g)).toHaveLength(2);
    expect(html).toContain('data-status="failed"');
  });

  it("offers Retry dispatch only on the queued run whose dispatch was not acknowledged", () => {
    const { html } = render(history);
    expect(html.match(/Retry dispatch/g)).toHaveLength(1);
  });

  it("explains a failed run with the server's message and offers only to reuse its settings, never an automatic retry", () => {
    const { html } = render(history);
    expect(text(html)).toContain("No GPU start was confirmed within 5 minutes");
    expect(text(html)).toContain("Reuse settings");
    expect(text(html)).not.toMatch(/Try it again|Re-?run|Regenerate/i);
  });

  it("asks for no private link while drawing: a link is signed only when its tile is seen, and the page never carries one", () => {
    const { html, signMedia } = render(history);
    expect(signMedia).not.toHaveBeenCalled();
    expect(html).not.toContain("<video");
    expect(html).not.toContain("private.example");
    expect(html).not.toMatch(/storage_key|modal_call_id/);
  });

  it("sizes each tile from the format that was asked for", () => {
    const { html } = render(history);
    expect(html).toContain("aspect-ratio:9 / 16");
    expect(html).toContain("aspect-ratio:16 / 9");
  });

  it("shows a quiet skeleton while the history loads", () => {
    expect(renderToStaticMarkup(<HistorySkeleton />)).toContain('aria-hidden="true"');
  });
});
