const API_BASE = "https://api.muapi.ai/api/v1";

function apiKey() {
  return process.env.MUAPI_API_KEY || process.env.MU_API_KEY || "";
}

export function isCommerceImageProviderConfigured() {
  return Boolean(apiKey());
}

export async function startCommerceImage(input: { prompt: string; images: string[] }) {
  const key = apiKey();
  if (!key) throw new Error("Commerce image generation is not configured.");
  const response = await fetch(`${API_BASE}/nano-banana-2-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      prompt: input.prompt,
      images_list: input.images,
      aspect_ratio: "1:1",
      google_search: false,
      resolution: "1k",
      output_format: "jpg",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Image generation request failed (${response.status}).`);
  const data = await response.json() as { request_id?: string };
  if (!data.request_id) throw new Error("Image generation did not return a task id.");
  return data.request_id;
}

export async function pollCommerceImage(taskId: string): Promise<
  { status: "processing" } | { status: "ready"; url: string } | { status: "failed"; error: string }
> {
  const key = apiKey();
  if (!key) throw new Error("Commerce image generation is not configured.");
  const response = await fetch(`${API_BASE}/predictions/${encodeURIComponent(taskId)}/result`, {
    headers: { "Content-Type": "application/json", "x-api-key": key },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { status: "processing" };
  const data = await response.json() as Record<string, unknown>;
  const status = String(data.status ?? data.state ?? "").toLowerCase();
  if (status === "failed") return { status: "failed", error: "Image generation failed." };
  if (status !== "completed" && status !== "succeeded") return { status: "processing" };
  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  const nested = data.output && typeof data.output === "object" ? data.output as Record<string, unknown> : null;
  const nestedUrls = nested?.urls && typeof nested.urls === "object" ? nested.urls as Record<string, unknown> : null;
  const url = typeof outputs[0] === "string" ? outputs[0]
    : typeof data.output === "string" ? data.output
    : typeof nestedUrls?.get === "string" ? nestedUrls.get : null;
  return url ? { status: "ready", url } : { status: "processing" };
}

