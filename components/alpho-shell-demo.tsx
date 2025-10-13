"use client";

import React, { useState, useEffect } from "react";
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
  Eye
} from "lucide-react";

const Card: React.FC<{ className?: string; children?: React.ReactNode; onClick?: () => void }> = ({
  className = "",
  children,
  onClick,
}) => (
  <div
    className={`rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-md ${className}`}
    onClick={onClick}
  >
    {children}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80">
    {children}
  </span>
);

const Sidebar: React.FC<{ current: string; onNavigate: (key: string) => void }> = ({
  current,
  onNavigate,
}) => {
  const items = [
    { key: "home", label: "Home", Icon: Home },
    { key: "assets", label: "Assets", Icon: Upload },
    { key: "story", label: "Story", Icon: Sparkles },
    { key: "video", label: "Video", Icon: Film },
    { key: "image", label: "Image", Icon: Image },
    { key: "character", label: "Character", Icon: Users },
    { key: "audio", label: "Audio", Icon: Mic2 },
    { key: "more", label: "More", Icon: Settings },
  ];
  return (
    <aside className="fixed left-0 top-0 z-20 h-full w-60 border-r border-white/10 bg-[#0b0c10] px-4 py-6">
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
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
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

const Topbar: React.FC<{ theme: "dark" | "light"; toggle: () => void }> = ({
  theme,
  toggle,
}) => (
  <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
    <div className="flex items-center gap-4">
      <h2 className="text-lg font-semibold text-white/90">Create</h2>
    </div>
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10">
        Profile
      </button>
    </div>
  </div>
);

const Hero: React.FC = () => (
  <Card className="relative overflow-hidden p-8">
    <div className="relative z-10">
      <h1 className="mb-3 bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-3xl font-bold text-transparent">
        Welcome to Alpho Gen AI
      </h1>
      <p className="mb-6 text-sm text-white/60">
        Create stunning stories, videos, images and more with AI-powered tools
      </p>
      <div className="flex gap-3">
        <button className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white">
          Start Creating
        </button>
        <button className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-white">
          Watch Tutorial
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
    className="cursor-pointer p-4 transition hover:border-white/20 hover:bg-white/[0.12]"
    onClick={onClick}
  >
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-indigo-400">
      {icon}
    </div>
    <h3 className="mb-1 text-sm font-semibold text-white">{title}</h3>
    <p className="text-xs text-white/50">{description}</p>
  </Card>
);

const GalleryCard: React.FC<{ title: string; tag?: string }> = ({ title, tag }) => (
  <Card className="aspect-square overflow-hidden">
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-500/10 to-cyan-400/10">
      <Eye className="h-8 w-8 text-white/20" />
    </div>
    <div className="flex items-center justify-between px-3 py-2">
      <div className="text-xs font-medium text-white">{title}</div>
      {tag && <Chip>{tag}</Chip>}
    </div>
  </Card>
);

const SectionTitle: React.FC<{ title: string; action?: string }> = ({ title, action }) => (
  <div className="mb-2 flex items-center justify-between">
    <h2 className="text-sm font-semibold text-white/90">{title}</h2>
    {action && (
      <button className="text-xs text-white/60 hover:text-white">{action}</button>
    )}
  </div>
);

const HomePage: React.FC<{ onGo: (key: string) => void }> = ({ onGo }) => (
  <div className="space-y-6">
    <Hero />

    <SectionTitle title="Create Story" />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <CreateTile title="Music Video" description="Sync visuals to music in a click" icon={<PlayCircle className="h-5 w-5"/>} />
      <CreateTile title="Explainer Video" description="Turn scripts into scenes" icon={<Sparkles className="h-5 w-5"/>} />
      <CreateTile title="Character Vlog" description="Make your avatar speak" icon={<Wand2 className="h-5 w-5"/>} />
      <CreateTile title="ASMR Video" description="Generate calm soundscapes" icon={<Mic2 className="h-5 w-5"/>} />
    </div>

    <SectionTitle title="Video" />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <CreateTile title="Image → Video (Gen‑4)" description="Runway Gen‑4 with ref images" icon={<Film className="h-5 w-5"/>} onClick={() => onGo('video-gen4')} />
      <CreateTile title="Image → Video (Turbo)" description="Gen‑4 Turbo (fast, no refs)" icon={<Film className="h-5 w-5"/>} onClick={() => onGo('video-turbo')} />
    </div>

    <SectionTitle title="Community Stories" action="View All" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <GalleryCard key={i} title={`Story ${i + 1}`} tag={i % 3 === 0 ? 'video' : undefined} />
      ))}
    </div>
  </div>
);

const AssetsPage = () => (
  <div className="space-y-4">
    <SectionTitle title="Assets" />
    <Card className="p-4 text-sm text-white/70">Upload, manage and reuse your images, videos and audios across projects.</Card>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <GalleryCard key={i} title={`Asset #${i + 1}`} />
      ))}
    </div>
  </div>
);

const YouTubeDrawer: React.FC<{ open: boolean; onClose: () => void; onPublish: (p: {title: string; description: string; tags: string[]; privacy: 'private'|'unlisted'|'public'}) => void }> = ({ open, onClose, onPublish }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'private'|'unlisted'|'public'>('private');
  return (
    <div className={`${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} fixed inset-0 z-40 flex justify-end bg-black/40 transition`}>
      <div className={`h-full w-full max-w-md bg-[#0b0c10] border-l border-white/10 p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Publish to YouTube</h3>
          <button onClick={onClose} className="text-sm text-white/70">Close</button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-white/60">Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/60">Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 h-28 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/60">Tags (comma separated)</label>
            <input value={tags} onChange={e=>setTags(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/60">Privacy</label>
            <select value={privacy} onChange={e=>setPrivacy(e.target.value as 'private'|'unlisted'|'public')} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
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
  const form = new FormData();
  form.append('prompt', req.prompt);
  if (req.duration) form.append('duration', String(req.duration));
  if (req.resolution) form.append('resolution', req.resolution);
  if (req.seed !== undefined) form.append('seed', String(req.seed));
  if (req.negativePrompt) form.append('negativePrompt', req.negativePrompt);
  req.references?.forEach((f) => form.append('references', f));
  const res = await fetch('/api/runway/gen4', { method: 'POST', body: form });
  if (!res.ok) throw new Error('Runway Gen‑4 request failed');
  return res.json();
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
  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setRefs(Array.from(files));
  };

  const onCreate = async () => {
    try {
      setLoading(true);
      const data = await createGen4({ prompt, negativePrompt, duration, resolution, seed, references: refs });
      setPreviewUrl(data.videoUrl || null);
      setVideoId(data.videoId || null);
    } catch (e: unknown) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setLoading(false);
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
            <label className="text-xs text-white/60">Prompt</label>
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className="mt-1 h-40 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/40" placeholder={`Describe your video…`} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/60">Negative Prompt</label>
                <input value={negativePrompt} onChange={e=>setNegativePrompt(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/60">Duration</label>
                  <select value={duration} onChange={e=>setDuration(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                    <option value={5}>5s</option>
                    <option value={10}>10s</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60">Resolution</label>
                  <select value={resolution} onChange={e=>setResolution(e.target.value as '720p'|'1080p')} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/60">Seed (optional)</label>
                <input value={seed ?? ''} onChange={e=>setSeed(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
              </div>
              <div>
                <label className="text-xs text-white/60">Reference Images (optional)</label>
                <input type="file" multiple onChange={e=>onFiles(e.target.files)} className="mt-1 block w-full rounded-xl border border-dashed border-white/10 bg-white/5 p-2 text-sm text-white" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={onCreate} disabled={loading} className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60">Preview</label>
            <Card className="mt-1 aspect-video w-full flex items-center justify-center">
              {!previewUrl ? (
                <span className="text-xs text-white/60">Your video will appear here</span>
              ) : (
                <video src={previewUrl} controls className="h-full w-full rounded-2xl" />
              )}
            </Card>
            <div className="mt-3 flex gap-2">
              <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">Download</button>
              <button onClick={() => setOpen(true)} className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white">Publish to YouTube</button>
            </div>
          </div>
        </div>
      </Card>
      <YouTubeDrawer open={open} onClose={() => setOpen(false)} onPublish={onPublish} />
    </div>
  );
};

const SimpleToolPage: React.FC<{ name: string }> = ({ name }) => (
  <div className="space-y-4">
    <SectionTitle title={`${name} Creation`} />
    <Card className="p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs text-white/60">Prompt</label>
          <textarea className="mt-1 h-40 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/40" placeholder={`Describe your ${name.toLowerCase()}…`} />
          <div className="mt-3 flex items-center gap-2">
            <button className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">Advanced</button>
            <button className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white">Create</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/60">Preview</label>
          <Card className="mt-1 aspect-video w-full">
            <div className="flex h-full items-center justify-center">
              <span className="text-xs text-white/60">Preview will appear here</span>
            </div>
          </Card>
        </div>
      </div>
    </Card>
  </div>
);

export default function AlphoShellDemo() {
  const [route, setRoute] = useState<string>("home");
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('alpho-theme') as 'dark' | 'light') || 'dark';
  });
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    localStorage.setItem('alpho-theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-[#0b0c10] dark:text-white">
      <Sidebar current={route} onNavigate={setRoute} />

      <main className="ml-60">
        <Topbar theme={theme} toggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
          {route === "home" && <HomePage onGo={setRoute} />}
          {route === "assets" && <AssetsPage />}
          {route === "story" && <SimpleToolPage name="Story" />}
          {route === "video" && <SimpleToolPage name="Video" />}
          {route === "video-gen4" && <VideoGen4Page />}
          {route === "video-turbo" && <SimpleToolPage name="Video (Turbo)" />}
          {route === "image" && <SimpleToolPage name="Image" />}
          {route === "character" && <SimpleToolPage name="Character" />}
          {route === "audio" && <SimpleToolPage name="Audio" />}
          {route === "more" && (
            <Card className="p-6 text-sm text-white/70">
              Settings & Labs coming soon.
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
