import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { uploadBufferToR2 } from "@/lib/r2";
import { submitFabric, pollFabric } from "@/lib/veed-fabric-client";

/**
 * EXPERIMENTAL — T-1151 VEED Fabric 1.0 podcast-speaker POC. NOT a product
 * feature, no UI, no DB. Admin-gated, step-driven (serverless-timeout safe):
 *  - step "create": submit image_url + audio_url + resolution -> { requestId }.
 *  - step "poll":   check status; when COMPLETED, download the MP4 to R2 and
 *                   return the R2 url + size + timing. Records raw error/status.
 * Measures whether Fabric can replace the base-clip -> trim -> HeyGen pipeline
 * with a single image+audio -> talking clip call.
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
      const { imageUrl, audioUrl, resolution } = body;
      if (!imageUrl || !audioUrl) {
        return NextResponse.json({ error: "imageUrl + audioUrl required" }, { status: 400 });
      }
      const r = await submitFabric({ imageUrl, audioUrl, resolution: resolution === "720p" ? "720p" : "480p" });
      return NextResponse.json({ submitMs: Date.now() - t0, http: r.http, requestId: r.requestId, raw: r.raw });
    }

    if (step === "poll") {
      if (!body.requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
      const s = await pollFabric(String(body.requestId));
      if (!s.videoUrl) {
        return NextResponse.json({ elapsedMs: Date.now() - t0, http: s.http, status: s.status, ready: false, raw: s.raw });
      }
      const dl = await fetch(s.videoUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dl.ok) {
        return NextResponse.json({ elapsedMs: Date.now() - t0, status: s.status, ready: true, providerUrl: s.videoUrl, error: `download ${dl.status}` });
      }
      const buf = Buffer.from(await dl.arrayBuffer());
      const key = `experiments/veed-fabric-poc/${body.requestId}.mp4`;
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
