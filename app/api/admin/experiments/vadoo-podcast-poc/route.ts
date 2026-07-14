import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { uploadBufferToR2 } from "@/lib/r2";
import { createVadooPodcast, getVadooVideo } from "@/lib/vadoo-client";

/**
 * EXPERIMENTAL — T-1150 Vadoo AI podcast POC. NOT a product feature, no UI.
 *
 * Admin-gated, no DB writes. Step-driven from outside (serverless-timeout safe):
 *  - step "create": submit a podcast job → returns { vid, submitMs }.
 *  - step "poll":   check status; when done, download the MP4 and copy it to R2,
 *                   returning the R2 url + size + timing. Records raw error/status.
 * Measures: submit time, generation time (poll elapsed vs create), status, raw
 * error, R2 url, byte size. Resolution / audio-video presence is verified with
 * ffprobe on the downloaded file after this route returns the R2 url.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const step = body.step;
  const t0 = Date.now();
  try {
    if (step === "create") {
      const { text, url, name1, name2, voice1, voice2, language, duration, tone, theme } = body;
      if ((!text && !url) || !name1 || !name2) {
        return NextResponse.json({ error: "text|url + name1 + name2 required" }, { status: 400 });
      }
      const r = await createVadooPodcast({ text, url, name1, name2, voice1, voice2, language, duration, tone, theme });
      return NextResponse.json({ submitMs: Date.now() - t0, http: r.http, vid: r.vid, raw: r.raw });
    }

    if (step === "poll") {
      if (!body.vid) return NextResponse.json({ error: "vid required" }, { status: 400 });
      const s = await getVadooVideo(String(body.vid));
      if (!s.videoUrl) {
        return NextResponse.json({ elapsedMs: Date.now() - t0, http: s.http, status: s.status, ready: false, raw: s.raw });
      }
      // Completed → copy the provider MP4 into our own R2 for durable inspection.
      const dl = await fetch(s.videoUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dl.ok) {
        return NextResponse.json({ elapsedMs: Date.now() - t0, status: s.status, ready: true, providerUrl: s.videoUrl, error: `download ${dl.status}` });
      }
      const buf = Buffer.from(await dl.arrayBuffer());
      const key = `experiments/vadoo-podcast-poc/${body.vid}.mp4`;
      const r2 = await uploadBufferToR2(buf, key, "video/mp4");
      return NextResponse.json({
        elapsedMs: Date.now() - t0,
        status: s.status,
        ready: true,
        providerUrl: s.videoUrl,
        r2Url: r2,
        bytes: buf.length,
      });
    }

    return NextResponse.json({ error: "unknown step (use create | poll)" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
