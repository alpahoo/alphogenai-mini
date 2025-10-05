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
    if (!prompt || prompt.length < 5) {
      alert("Please enter a prompt (minimum 5 characters)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      
      if (data.error) {
        alert(`Error: ${data.error}`);
        setLoading(false);
        return;
      }

      if (data.jobId) {
        router.push(`/v/${data.jobId}`);
      }
    } catch (error) {
      console.error("Error generating video:", error);
      alert("Failed to generate video. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-xl mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">🎬 Generate your AI Video</h1>
      <textarea
        className="w-full h-40 border rounded p-3 mb-4 text-black"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your video idea..."
      />
      <button
        onClick={generate}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-3 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? "Generating..." : "Generate Video"}
      </button>
    </main>
  );
}