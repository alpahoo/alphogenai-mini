"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  Home,
  Image,
  Film,
  Mic2,
  Users,
  Settings,
  Sparkles,
  Moon,
  Sun,
  PlayCircle,
  Wand2,
  Upload,
  Eye,
  History,
  LogOut,
  Shield
} from "lucide-react";

const Card: React.FC<{ className?: string; children?: React.ReactNode; onClick?: () => void }> = ({
  className = "",
  children,
  onClick,
}) => (
  <div
    className={`rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-white/[0.08] dark:to-white/[0.02] backdrop-blur-md ${className}`}
    onClick={onClick}
  >
    {children}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-zinc-300 dark:border-white/20 bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-700 dark:text-white/80">
    {children}
  </span>
);

const Sidebar: React.FC<{ current: string; onNavigate: (key: string) => void; isAdmin: boolean }> = ({
  current,
  onNavigate,
  isAdmin,
}) => {
  const items = [
    { key: "home", label: "Home", Icon: Home },
    { key: "assets", label: "Assets", Icon: Upload },
    { key: "video", label: "Video", Icon: Film },
    { key: "history", label: "History", Icon: History },
    ...(isAdmin ? [{ key: "admin", label: "Admin", Icon: Shield }] : []),
  ];
  return (
    <aside className="fixed left-0 top-0 z-20 h-full w-60 border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0b0c10] px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <h1 className="bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-lg font-bold text-transparent">
          Alpho Gen AI
        </h1>
      </div>
      <nav className="space-y-1">
        {items.map(({ key, label, Icon }) => {
          const active = key === current;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-white/60 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

const Topbar: React.FC<{ theme: "dark" | "light"; toggle: () => void; user: User | null }> = ({
  theme,
  toggle,
  user,
}) => {
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <div className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-white/10 px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-white/90">Create</h2>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-2 text-zinc-600 dark:text-white/70 transition hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {user && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-600 dark:text-white/70 transition hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        )}
      </div>
    </div>
  );
};

const Hero: React.FC<{ onGo: (route: string) => void }> = ({ onGo }) => (
  <Card className="relative overflow-hidden p-8">
    <div className="relative z-10">
      <h1 className="mb-3 bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-3xl font-bold text-transparent">
        Welcome to Alpho Gen AI
      </h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-white/60">
        Create stunning videos with AI-powered Runway Gen-4 technology
      </p>
      <div className="flex gap-3">
        <button 
          onClick={() => onGo('video')}
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
        >
          Start Creating
        </button>
      </div>
    </div>
    <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-indigo-500/20 to-transparent blur-3xl" />
  </Card>
);

const CreateTile: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick?: () => void;
}> = ({ title, description, icon, onClick }) => (
  <Card
    className="cursor-pointer p-4 transition hover:border-zinc-300 dark:hover:border-white/20 hover:bg-zinc-100 dark:hover:bg-white/[0.12]"
    onClick={onClick}
  >
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-indigo-400">
      {icon}
    </div>
    <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
    <p className="text-xs text-zinc-500 dark:text-white/50">{description}</p>
  </Card>
);

const GalleryCard: React.FC<{ title: string; tag?: string }> = ({ title, tag }) => (
  <Card className="aspect-square overflow-hidden">
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-500/10 to-cyan-400/10">
      <Eye className="h-8 w-8 text-zinc-300 dark:text-white/20" />
    </div>
    <div className="flex items-center justify-between px-3 py-2">
      <div className="text-xs font-medium text-zinc-900 dark:text-white">{title}</div>
      {tag && <Chip>{tag}</Chip>}
    </div>
  </Card>
);

const SectionTitle: React.FC<{ title: string; action?: string }> = ({ title, action }) => (
  <div className="mb-2 flex items-center justify-between">
    <h2 className="text-sm font-semibold text-zinc-800 dark:text-white/90">{title}</h2>
    {action && (
      <button className="text-xs text-zinc-600 dark:text-white/60 hover:text-zinc-900 dark:hover:text-white">{action}</button>
    )}
  </div>
);

const HomePage: React.FC<{ onGo: (key: string) => void }> = ({ onGo }) => (
  <div className="space-y-6">
    <Hero onGo={onGo} />

    <SectionTitle title="Video" />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <CreateTile 
        title="Image → Video (Gen‑4)" 
        description="Runway Gen‑4 with reference images" 
        icon={<Film className="h-5 w-5"/>} 
        onClick={() => onGo('video')} 
      />
    </div>
  </div>
);

const AssetsPage = () => (
  <div className="space-y-4">
    <SectionTitle title="Assets" />
    <Card className="p-4 text-sm text-zinc-600 dark:text-white/70">Upload, manage and reuse your images, videos and audios across projects.</Card>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <GalleryCard key={i} title={`Asset #${i + 1}`} />
      ))}
    </div>
  </div>
);

const MyJobsView: React.FC<{ userId: string | null }> = ({ userId }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch("/api/admin/list-jobs");
        const data = await res.json();
        const userJobs = userId ? data.jobs?.filter((job: any) => job.user_id === userId) : data.jobs || [];
        setJobs(userJobs);
      } catch (err) {
        console.error("Error fetching jobs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "in_progress":
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle title="My Video Jobs" />
      {loading ? (
        <Card className="p-8 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-zinc-600 dark:text-white/60">
          No jobs yet. Start creating videos!
        </Card>
      ) : (
        jobs.map((job) => (
          <Card key={job.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                  {job.current_stage && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {job.current_stage}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-900 dark:text-white mb-2">{job.prompt}</p>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(job.created_at).toLocaleString("fr-FR")}
                </div>
              </div>
              {job.video_url && (
                <button className="ml-4 rounded-lg bg-zinc-100 dark:bg-white/10 px-3 py-2 text-sm text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20">
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
};

const AdminJobsView: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/admin/list-jobs");
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error("Error fetching jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: string) => {
    if (!confirm("Retry this job?")) return;
    try {
      const res = await fetch("/api/admin/retry-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      setMessage(data.message || "✅ Job retried");
      fetchJobs();
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm("Cancel this job?")) return;
    try {
      const res = await fetch("/api/admin/cancel-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      setMessage(data.message || "✅ Job cancelled");
      fetchJobs();
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "cancelled":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      case "in_progress":
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle title="📊 Admin - All Jobs" />
      {message && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">{message}</p>
        </Card>
      )}
      {loading ? (
        <Card className="p-8 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-zinc-600 dark:text-white/60">
          No jobs found
        </Card>
      ) : (
        jobs.map((job) => (
          <Card key={job.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                  {job.current_stage && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {job.current_stage}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-900 dark:text-white mb-1">{job.prompt}</p>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  ID: {job.id} | Created: {new Date(job.created_at).toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                {job.status === "failed" && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    className="rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 text-xs hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  >
                    🔄 Retry
                  </button>
                )}
                {(job.status === "pending" || job.status === "in_progress") && (
                  <button
                    onClick={() => handleCancel(job.id)}
                    className="rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 text-xs hover:bg-red-200 dark:hover:bg-red-900/50"
                  >
                    🛑 Cancel
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};

const YouTubeDrawer: React.FC<{ open: boolean; onClose: () => void; onPublish: (p: {title: string; description: string; tags: string[]; privacy: 'private'|'unlisted'|'public'}) => void }> = ({ open, onClose, onPublish }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'private'|'unlisted'|'public'>('private');
  return (
    <div className={`${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} fixed inset-0 z-40 flex justify-end bg-black/40 transition`}>
      <div className={`h-full w-full max-w-md bg-white dark:bg-[#0b0c10] border-l border-zinc-200 dark:border-white/10 p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Publish to YouTube</h3>
          <button onClick={onClose} className="text-sm text-zinc-600 dark:text-white/70">Close</button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-zinc-600 dark:text-white/60">Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
          </div>
          <div>
            <label className="text-xs text-zinc-600 dark:text-white/60">Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 h-28 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
          </div>
          <div>
            <label className="text-xs text-zinc-600 dark:text-white/60">Tags (comma separated)</label>
            <input value={tags} onChange={e=>setTags(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
          </div>
          <div>
            <label className="text-xs text-zinc-600 dark:text-white/60">Privacy</label>
            <select value={privacy} onChange={e=>setPrivacy(e.target.value as 'private'|'unlisted'|'public')} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white">
              <option value="private">private</option>
              <option value="unlisted">unlisted</option>
              <option value="public">public</option>
            </select>
          </div>
          <button onClick={() => onPublish({ title, description, tags: tags.split(',').map(t=>t.trim()).filter(Boolean), privacy })} className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white">
            Publish
          </button>
        </div>
      </div>
    </div>
  );
};

async function createGen4(req: { prompt: string; references?: File[]; duration?: number; resolution?: '720p'|'1080p'; seed?: number; negativePrompt?: string; }) {
  console.log('🚀 createGen4 called with:', req);
  const form = new FormData();
  form.append('prompt', req.prompt);
  if (req.duration) form.append('duration', String(req.duration));
  if (req.resolution) form.append('resolution', req.resolution);
  if (req.seed !== undefined) form.append('seed', String(req.seed));
  if (req.negativePrompt) form.append('negativePrompt', req.negativePrompt);
  req.references?.forEach((f) => form.append('references', f));
  console.log('📤 Sending POST request to /api/runway/gen4');
  const res = await fetch('/api/runway/gen4', { method: 'POST', body: form });
  console.log('📥 Response status:', res.status, res.statusText);
  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ API error response:', errorText);
    throw new Error(`Runway Gen‑4 request failed: ${res.status} ${errorText}`);
  }
  const jsonData = await res.json();
  console.log('✅ API response data:', jsonData);
  return jsonData;
}

async function publishYouTube(req: { videoIdOrUrl: string; title: string; description: string; tags: string[]; privacy: 'private'|'unlisted'|'public'; }) {
  const res = await fetch('/api/youtube/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error('YouTube publish failed');
  return res.json();
}

const VideoGen4Page: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<'720p'|'1080p'>('720p');
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [refs, setRefs] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('VideoGen4Page state updated:', { prompt: prompt.substring(0, 50) + '...', loading, previewUrl: !!previewUrl, videoId });
  }, [prompt, loading, previewUrl, videoId]);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setRefs(Array.from(files));
  };

  const onCreate = async () => {
    console.log('🎬 onCreate called - starting video generation');
    console.log('Prompt:', prompt);
    console.log('Negative Prompt:', negativePrompt);
    console.log('Duration:', duration);
    console.log('Resolution:', resolution);
    
    if (!prompt || prompt.trim().length === 0) {
      alert('Please enter a prompt to generate a video.');
      console.error('❌ Prompt is empty');
      return;
    }
    
    try {
      setLoading(true);
      console.log('⏳ Loading state set to true');
      const data = await createGen4({ prompt, negativePrompt, duration, resolution, seed, references: refs });
      console.log('✅ Video generation response:', data);
      setPreviewUrl(data.videoUrl || null);
      setVideoId(data.videoId || null);
    } catch (e: unknown) {
      console.error('❌ Video generation error:', e);
      alert(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
      console.log('✅ Loading state set to false');
    }
  };

  const onPublish = async (p: {title: string; description: string; tags: string[]; privacy: 'private'|'unlisted'|'public'}) => {
    if (!videoId && !previewUrl) {
      alert('Generate a video first.');
      return;
    }
    try {
      await publishYouTube({ videoIdOrUrl: videoId ?? previewUrl!, ...p });
      alert('Published to YouTube');
      setOpen(false);
    } catch (e: unknown) {
      console.error(e);
      alert((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle title="Image → Video (Runway Gen‑4)" />
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-zinc-600 dark:text-white/60">Prompt</label>
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className="mt-1 h-40 w-full resize-none rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/40" placeholder={`Describe your video…`} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-600 dark:text-white/60">Negative Prompt</label>
                <input value={negativePrompt} onChange={e=>setNegativePrompt(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-600 dark:text-white/60">Duration</label>
                  <select value={duration} onChange={e=>setDuration(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                    <option value={5}>5s</option>
                    <option value={10}>10s</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-600 dark:text-white/60">Resolution</label>
                  <select value={resolution} onChange={e=>setResolution(e.target.value as '720p'|'1080p')} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-600 dark:text-white/60">Seed (optional)</label>
                <input value={seed ?? ''} onChange={e=>setSeed(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white"/>
              </div>
              <div>
                <label className="text-xs text-zinc-600 dark:text-white/60">Reference Images (optional)</label>
                <input type="file" multiple onChange={e=>onFiles(e.target.files)} className="mt-1 block w-full rounded-xl border border-dashed border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-2 text-sm text-zinc-900 dark:text-white" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={onCreate} disabled={loading} className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-600 dark:text-white/60">Preview</label>
            <Card className="mt-1 aspect-video w-full flex items-center justify-center">
              {!previewUrl ? (
                <span className="text-xs text-zinc-600 dark:text-white/60">Your video will appear here</span>
              ) : (
                <video src={previewUrl} controls className="h-full w-full rounded-2xl" />
              )}
            </Card>
            <div className="mt-3 flex gap-2">
              <button className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-white">Download</button>
              <button onClick={() => setOpen(true)} className="rounded-xl bg-zinc-100 dark:bg-white/10 px-3 py-2 text-sm text-zinc-900 dark:text-white">Publish to YouTube</button>
            </div>
          </div>
        </div>
      </Card>
      <YouTubeDrawer open={open} onClose={() => setOpen(false)} onPublish={onPublish} />
    </div>
  );
};


export default function AlphoShellDemo() {
  const [route, setRoute] = useState<string>("home");
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const savedTheme = localStorage.getItem('alpho-theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);
  
  useEffect(() => {
    async function getUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsAdmin(user?.user_metadata?.role === 'admin');
    }
    getUser();
  }, []);
  
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    localStorage.setItem('alpho-theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-[#0b0c10] dark:text-white">
      <Sidebar current={route} onNavigate={setRoute} isAdmin={isAdmin} />

      <main className="ml-60">
        <Topbar theme={theme} toggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} user={user} />
        <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
          {route === "home" && <HomePage onGo={setRoute} />}
          {route === "assets" && <AssetsPage />}
          {route === "video" && <VideoGen4Page />}
          {route === "history" && <MyJobsView userId={user?.id || null} />}
          {route === "admin" && isAdmin && <AdminJobsView />}
        </div>
      </main>
    </div>
  );
}
