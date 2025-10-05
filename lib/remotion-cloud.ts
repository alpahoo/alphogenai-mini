import fetch from "node-fetch";

export type RenderRequest = {
  clips: { url: string; durationSec: number }[];
  audioUrl: string;
  srt?: string;
  logoUrl?: string;
  compositionId?: string;
  width?: number;
  height?: number;
  fps?: number;
};

export async function renderFinalVideo(req: RenderRequest): Promise<string> {
  const REMOTION_SITE_ID = process.env.REMOTION_SITE_ID!;
  const REMOTION_SECRET_KEY = process.env.REMOTION_SECRET_KEY!;

  const body = {
    compositionId: req.compositionId || "AGM_Video",
    serveUrl: `https://remotion.pro/api/sites/${REMOTION_SITE_ID}`,
    inputProps: req,
    codec: "h264",
    imageFormat: "jpeg",
  };

  const res = await fetch("https://api.remotion.pro/render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${REMOTION_SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.renderId) throw new Error("Render failed: " + JSON.stringify(data));

  let status;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://api.remotion.pro/renders/${data.renderId}`,
      { headers: { Authorization: `Bearer ${REMOTION_SECRET_KEY}` } }
    );
    status = await statusRes.json();
    if (status.status === "done" && status.fileUrl) {
      return status.fileUrl;
    }
  }
  throw new Error("Render timeout");
}