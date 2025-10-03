"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

type Video = {
  id: string;
  idea: string;
  script: string | null;
  hashtags: string | null;
  description: string | null;
  video_url: string | null;
  status: "pending" | "generating" | "ready" | "error";
  created_at: string;
};

export default function DashboardClient({ initialVideos }: { initialVideos: Video[] }) {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [idea, setIdea] = useState("");
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/videos/list");
    if (res.ok) {
      const json = await res.json();
      setVideos(json.videos as Video[]);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      // background polling while there are pending/generating
      if (videos.some((v) => v.status === "pending" || v.status === "generating")) {
        refresh();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [videos, refresh]);

  const generateScript = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = idea.trim();
      if (!trimmed) return;
      const res = await fetch("/api/videos/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: trimmed }),
      });
      if (res.ok) {
        const json = await res.json();
        const v: Video = json.video;
        setVideos((prev) => [v, ...prev]);
        setIdea("");
        startTransition(() => void refresh());
      }
    },
    [idea, refresh],
  );

  const generateVideo = useCallback(async (id: string) => {
    const res = await fetch("/api/videos/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: id }),
    });
    if (res.ok) {
      startTransition(() => void refresh());
    }
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch("/api/videos/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
    }
  }, []);

  const download = useCallback(async (path: string) => {
    try {
      // The file is private; create a signed URL via API or serve via Storage CDN with signed URL
      const res = await fetch("/api/videos/list");
      if (res.ok) {
        const { videos } = (await res.json()) as { videos: Video[] };
        const match = videos.find((v) => v.video_url === path);
        if (match) {
          // rely on Storage public URL if set up with edge function; for now just attempt fetch then download
          const direct = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${path}`;
          const a = document.createElement("a");
          a.href = direct;
          a.download = `${match.id}.mp4`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      }
    } catch (e) {
      console.error("Download error:", e);
    }
  }, []);

  return (
    <div className="space-y-8">
      <form onSubmit={generateScript} className="flex gap-2">
        <Input
          placeholder="Nouvelle idée de contenu..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending}>Générer script</Button>
      </form>

      {videos.length === 0 ? (
        <EmptyState title="Aucune vidéo" description="Commencez par générer un script à partir d'une idée." />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {videos.map((v) => (
            <li key={v.id} className="border rounded-md p-4 flex flex-col gap-3">
              <div className="text-sm text-foreground/80">{new Date(v.created_at).toLocaleString()}</div>
              <div className="font-medium truncate" title={v.idea}>{v.idea}</div>
              {v.script ? (
                <div className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                  {v.script}
                </div>
              ) : null}
              <div className="text-xs">Statut: <span className="font-medium">{v.status}</span></div>
              <div className="flex gap-2 mt-2">
                {v.status !== "ready" && (
                  <Button size="sm" variant="secondary" onClick={() => generateVideo(v.id)}>
                    Générer vidéo
                  </Button>
                )}
                {v.status === "ready" && v.video_url ? (
                  <Button size="sm" onClick={() => download(v.video_url!)}>Télécharger</Button>
                ) : null}
                <Button size="sm" variant="destructive" onClick={() => handleDelete(v.id)}>
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

