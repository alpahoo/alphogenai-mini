"use client";

import { useState } from "react";
import Link from "next/link";
import { truncate } from "./utils";

interface VideoCardProps {
  id: string;
  final_url: string;
  prompt: string;
}

export default function VideoCard({ id, final_url, prompt }: VideoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${window.location.origin}/creator/view/${id}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Extraire la première phrase du prompt
  const title = truncate(prompt.split(/[.!?]/)[0] || prompt, 80);

  return (
    <div className="group bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-slate-200 dark:border-slate-700">
      {/* Miniature vidéo */}
      <Link href={`/creator/view/${id}`} className="block">
        <div className="relative aspect-video bg-slate-900 overflow-hidden">
          <video
            src={final_url}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onMouseEnter={(e) => {
              const video = e.currentTarget;
              video.currentTime = 2; // Sauter au début
            }}
          />

          {/* Overlay hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 rounded-full p-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          </div>
        </div>
      </Link>

      {/* Contenu */}
      <div className="p-4 space-y-3">
        {/* Titre */}
        <Link href={`/creator/view/${id}`}>
          <h3 className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
            {title}
          </h3>
        </Link>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/creator/view/${id}`}
            className="flex-1 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-center"
          >
            Voir
          </Link>

          <button
            onClick={handleCopyLink}
            className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            title="Copier le lien"
          >
            {copied ? "✓ Copié" : "📋 Copier"}
          </button>
        </div>
      </div>
    </div>
  );
}
