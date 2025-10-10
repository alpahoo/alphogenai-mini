import { NextResponse } from "next/server";

const QWEN_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation";

function requireEnv(name: string) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env ${name}`);
  return val;
}

async function callQwen(prompt: string) {
  const apiKey = requireEnv("QWEN_API_KEY");
  const res = await fetch(QWEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-plus",
      input: { prompt },
      parameters: { result_format: "json", temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Qwen error ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text: string = data?.output?.text || "";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Qwen returned non-JSON body");
    parsed = JSON.parse(m[0]);
  }
  return parsed;
}

function clampScene(s: any) {
  const d = Math.min(10, Math.max(6, Number(s?.duration_s) || 8));
  return {
    title: String(s?.title || "Scene"),
    prompt: String(s?.prompt || ""),
    duration_s: d,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tone = String(body?.tone || "fun");
    const scenesInput = Array.isArray(body?.scenes) ? body.scenes : [];
    const topic = String(body?.topic || body?.title || "Sujet");

    let scenes = scenesInput;
    if (!scenes || scenes.length === 0) {
      const prompt = `Crée un script vidéo en français avec 8 à 12 scènes (6-10 secondes chacune) sur le thème: "${topic}". Réponds strictement en JSON au format {"scenes":[{"title":"...","prompt":"...","duration_s":8}]}. Le ton doit être ${tone}. N'inclus pas de texte hors JSON.`;
      const parsed = await callQwen(prompt);
      scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    }

    scenes = scenes.map(clampScene);
    const total = scenes.reduce((a: number, s: any) => a + (s?.duration_s || 0), 0);

    // Guardrails: duration caps by plan tier
    const planTier = (process.env.DEFAULT_PLAN_TIER || "pro").toLowerCase();
    const limit = planTier === "unlimited" ? 600 : 120;
    if (total > limit) {
      let acc = 0;
      const trimmed: any[] = [];
      for (const s of scenes) {
        if (acc + s.duration_s > limit) break;
        trimmed.push(s);
        acc += s.duration_s;
      }
      scenes = trimmed;
    }

    // Checksums for idempotency
    const encoder = new TextEncoder();
    async function sha256Hex(input: string) {
      const hash = await crypto.subtle.digest("SHA-256", encoder.encode(input));
      return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    const withChecksums = await Promise.all(
      scenes.map(async (s: any, idx: number) => ({
        ...s,
        idx,
        checksum: await sha256Hex(JSON.stringify({ tone, topic, s })),
      }))
    );

    return NextResponse.json({ tone, topic, scenes: withChecksums, total_duration_s: withChecksums.reduce((a: number, s: any) => a + s.duration_s, 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
