import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

type VideoRow = {
  id: string;
  idea: string;
  script: string | null;
  hashtags: string | null;
  description: string | null;
  video_url: string | null;
  status: "pending" | "generating" | "ready" | "error";
  created_at: string;
};

async function getVideos(): Promise<VideoRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [] as VideoRow[];
  const { data } = await supabase
    .from("videos")
    .select("id, idea, script, hashtags, description, video_url, status, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as VideoRow[];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  const videos = await getVideos();

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">AlphoGenAI Dashboard</h1>
      <DashboardClient initialVideos={videos} />
    </div>
  );
}

