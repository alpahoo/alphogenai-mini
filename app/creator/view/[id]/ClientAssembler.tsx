"use client";
import { useEffect, useRef, useState } from "react";

interface Scene { id: string; idx: number; title: string; video_path: string | null; status: string }

function buildPublicUrl(path: string | null | undefined) {
  if (!path) return null;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || process.env.STORAGE_BUCKET || "videos";
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

export default function ClientAssembler({ projectId, scenes, musicPath }: { projectId: string; scenes: Scene[]; musicPath: string | null }) {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const sources = scenes
    .filter((s) => s.video_path)
    .sort((a, b) => a.idx - b.idx)
    .map((s) => buildPublicUrl(s.video_path)!)
    .filter(Boolean);
  const musicUrl = buildPublicUrl(musicPath);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  async function uploadWithSignedUrl(projectId: string, blob: Blob) {
    try {
      // Get session user id via API since this is a client component; we rely on server session in sign-upload
      const filename = `final-${Date.now()}.webm`;
      const contentType = blob.type || "video/webm";
      const signRes = await fetch("/api/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, filename, contentType }),
      });
      const signJson = await signRes.json();
      if (!signRes.ok) throw new Error(signJson.error || "sign-upload failed");

      const { signedUrl, objectPath } = signJson;
      const putRes = await fetch(signedUrl, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
      if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`);

      const confirmRes = await fetch("/api/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, objectPath }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmJson.error || "confirm-upload failed");
      alert("Vidéo finale envoyée et enregistrée ✅");
    } catch (err: any) {
      console.error("Upload error", err);
      alert(`Erreur upload: ${err?.message || String(err)}`);
    }
  }

  const startAssemble = async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stream = canvas.captureStream(30);
    const dest = new AudioContext();
    const destination = dest.createMediaStreamDestination();
    const combinedStream = new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);

    const mediaRecorder = new MediaRecorder(combinedStream, { mimeType: "video/webm;codecs=vp9,opus" });
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordingUrl(url);
      // Upload to Supabase via signed URL
      uploadWithSignedUrl(projectId, blob);
    };

    // Prepare audio
    if (musicUrl) {
      const audio = new Audio(musicUrl);
      audio.crossOrigin = "anonymous";
      const audioSrc = dest.createMediaElementSource(audio);
      audioSrc.connect(dest.destination);
      audioRef.current = audio;
      audio.play();
    }

    mediaRecorder.start();

    for (const src of sources) {
      const v = document.createElement("video");
      v.src = src;
      v.crossOrigin = "anonymous";
      await v.play().catch(() => {});
      await new Promise<void>((resolve) => {
        v.onplaying = () => {
          const draw = () => {
            if (v.paused || v.ended) return;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(draw);
          };
          draw();
        };
        v.onended = () => resolve();
      });
    }

    mediaRecorder.stop();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={startAssemble} className="px-3 py-2 rounded bg-blue-600 text-white">Assembler en WebM</button>
        {recordingUrl && (
          <a href={recordingUrl} download={`project-${projectId}.webm`} className="px-3 py-2 rounded bg-green-600 text-white">Télécharger</a>
        )}
      </div>
      <canvas ref={canvasRef} width={1280} height={720} className="w-full bg-black rounded" />
      <video ref={videoRef} className="hidden" />
    </div>
  );
}
