"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const generate = async () => {
    setLoading(true);
    const res = await fetch("/api/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (data.jobId) router.push(`/v/${data.jobId}`);
  };

  return (
    <main className="p-6 max-w-xl mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">🎬 Generate your AI Video</h1>
      <textarea
        className="w-full h-40 border rounded p-3 mb-4"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your video idea..."
      />
      <button
        onClick={generate}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-3 rounded"
      >
        {loading ? "Generating..." : "Generate Video"}
      </button>
    </main>
  );
}