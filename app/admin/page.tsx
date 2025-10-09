import "server-only";
import { revalidatePath } from "next/cache";

async function getSettings() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/admin/settings`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    enable_elevenlabs: boolean;
    default_audio_mode: "voice" | "music" | "none";
    music_source: "youtube" | "freepd" | "pixabay";
    default_voice_id: string | null;
    music_volume: number;
    updated_at: string | null;
  };
}

async function saveSettings(formData: FormData) {
  "use server";
  const body: any = {
    enable_elevenlabs: formData.get("enable_elevenlabs") === "on",
    default_audio_mode: formData.get("default_audio_mode") || undefined,
    music_source: formData.get("music_source") || undefined,
    default_voice_id: (formData.get("default_voice_id") as string) || undefined,
    music_volume: formData.get("music_volume") ? Number(formData.get("music_volume")) : undefined,
  };

  // Call internal API with ADMIN_TOKEN injected on the server
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/admin/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": process.env.ADMIN_TOKEN || "",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  revalidatePath("/admin");
}

export default async function AdminPage() {
  const settings = await getSettings();

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Admin Audio Settings</h1>

      <form action={saveSettings} className="space-y-6">
        <div className="flex items-center gap-3">
          <input
            id="enable_elevenlabs"
            name="enable_elevenlabs"
            type="checkbox"
            defaultChecked={!!settings?.enable_elevenlabs}
            className="h-4 w-4"
          />
          <label htmlFor="enable_elevenlabs" className="text-sm font-medium">
            Activer ElevenLabs
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Mode audio par défaut</label>
          <select
            name="default_audio_mode"
            defaultValue={settings?.default_audio_mode || "music"}
            className="w-full border rounded p-2"
          >
            <option value="voice">Voix</option>
            <option value="music">Musique</option>
            <option value="none">Aucun</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Source musique</label>
          <select
            name="music_source"
            defaultValue={settings?.music_source || "youtube"}
            className="w-full border rounded p-2"
          >
            <option value="youtube">YouTube</option>
            <option value="freepd">FreePD</option>
            <option value="pixabay">Pixabay</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Voice ID (optionnel)</label>
          <input
            type="text"
            name="default_voice_id"
            defaultValue={settings?.default_voice_id || ""}
            className="w-full border rounded p-2"
            placeholder="ELEVENLABS_VOICE_ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Volume musique (0..1)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            name="music_volume"
            defaultValue={settings?.music_volume ?? 0.7}
            className="w-full border rounded p-2"
          />
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Enregistrer
        </button>
      </form>
    </main>
  );
}
