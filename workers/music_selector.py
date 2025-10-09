"""
Sélection automatique de musique de fond selon le ton détecté.
"""
import random
import hashlib
from typing import Optional, List, Dict, Any


# Mapping ton → sous-dossier dans Supabase Storage
TONE_DIR = {
    "inspirant": "inspiring",
    "science": "synth",
    "léger": "light",
    "dramatique": "dramatic",
    "épique": "epic",
}

# Liste statique des pistes (à adapter selon vos uploads)
# Format: {"tone": "inspiring", "filename": "uplifting-ambient-1.mp3"}
MUSIC_LIBRARY = [
    # Inspirant
    {"tone": "inspiring", "filename": "uplifting-ambient-1.mp3"},
    {"tone": "inspiring", "filename": "hopeful-piano-2.mp3"},
    {"tone": "inspiring", "filename": "motivational-strings-3.mp3"},
    
    # Science / Synth
    {"tone": "synth", "filename": "electronic-research-1.mp3"},
    {"tone": "synth", "filename": "futuristic-synth-2.mp3"},
    {"tone": "synth", "filename": "tech-ambient-3.mp3"},
    
    # Léger / Fun
    {"tone": "light", "filename": "playful-ukulele-1.mp3"},
    {"tone": "light", "filename": "cheerful-piano-2.mp3"},
    {"tone": "light", "filename": "happy-whistling-3.mp3"},
    
    # Dramatique
    {"tone": "dramatic", "filename": "tense-strings-1.mp3"},
    {"tone": "dramatic", "filename": "suspense-piano-2.mp3"},
    
    # Épique
    {"tone": "epic", "filename": "cinematic-orchestra-1.mp3"},
    {"tone": "epic", "filename": "heroic-brass-2.mp3"},
    {"tone": "epic", "filename": "epic-drums-3.mp3"},
]


def build_prompt_hash(prompt: str, tone: str = "") -> str:
    """
    Génère un hash unique pour le cache musique.
    Combine le prompt + tone pour unicité.
    """
    key = f"{prompt}|music|{tone}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def pick_music_track(tone: str) -> Optional[str]:
    """
    Sélectionne aléatoirement une piste musicale selon le ton.
    
    Args:
        tone: Ton détecté (inspirant, science, léger, dramatique, épique)
    
    Returns:
        Nom du fichier relatif (ex: "uplifting-ambient-1.mp3")
        ou None si aucune piste trouvée
    """
    # Normaliser le ton
    tone_key = tone.lower().strip()
    
    # Mapper vers le sous-dossier
    subdir = TONE_DIR.get(tone_key, "inspiring")
    
    # Filtrer les pistes correspondantes
    matching_tracks = [
        track for track in MUSIC_LIBRARY
        if track["tone"] == subdir
    ]
    
    # Fallback: si aucune piste, prendre "inspiring"
    if not matching_tracks:
        matching_tracks = [
            track for track in MUSIC_LIBRARY
            if track["tone"] == "inspiring"
        ]
    
    if not matching_tracks:
        return None
    
    # Sélection aléatoire
    selected = random.choice(matching_tracks)
    return selected["filename"]


def get_music_url_from_storage(
    supabase_url: str,
    filename: str,
    tone: str = "inspiring"
) -> str:
    """
    Construit l'URL publique Supabase Storage pour une piste.
    
    Args:
        supabase_url: URL de base Supabase (ex: https://xxx.supabase.co)
        filename: Nom du fichier (ex: "uplifting-ambient-1.mp3")
        tone: Ton pour le sous-dossier
    
    Returns:
        URL publique complète
    """
    subdir = TONE_DIR.get(tone.lower().strip(), "inspiring")
    
    # Bucket configurable via env (fallback to 'assets')
    import os
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "assets")
    # Format: https://xxx.supabase.co/storage/v1/object/public/<bucket>/music/<subdir>/file.mp3
    return f"{supabase_url}/storage/v1/object/public/{bucket}/music/{subdir}/{filename}"


async def select_music_for_job(
    supabase_client,
    prompt: str,
    tone: str,
    supabase_url: str
) -> Optional[str]:
    """
    Sélectionne une musique avec cache.
    
    Args:
        supabase_client: Client Supabase
        prompt: Prompt utilisateur
        tone: Ton détecté ou forcé
        supabase_url: URL Supabase pour construire l'URL publique
    
    Returns:
        URL publique de la piste musicale ou None
    """
    # Vérifier le cache
    prompt_hash = build_prompt_hash(prompt, tone)
    
    try:
        cache_result = supabase_client.client.table("music_cache").select("*").eq(
            "prompt_hash", prompt_hash
        ).eq("audio_mode", "music").execute()
        
        if cache_result.data and len(cache_result.data) > 0:
            cached_url = cache_result.data[0].get("music_track_url")
            if cached_url:
                print(f"[Music] ✓ Cache hit: {cached_url[:80]}...")
                return cached_url
    except Exception as e:
        print(f"[Music] ⚠️  Cache read error: {e}")
    
    # Sélection aléatoire
    filename = pick_music_track(tone)
    if not filename:
        print(f"[Music] ✗ Aucune piste trouvée pour tone: {tone}")
        return None
    
    # Construire URL publique
    music_url = get_music_url_from_storage(supabase_url, filename, tone)
    
    # Sauvegarder dans le cache
    try:
        supabase_client.client.table("music_cache").insert({
            "prompt_hash": prompt_hash,
            "audio_mode": "music",
            "music_track_url": music_url,
            "tone": tone
        }).execute()
        print(f"[Music] ✓ Cache saved: {tone} → {filename}")
    except Exception as e:
        print(f"[Music] ⚠️  Cache write error: {e}")
    
    print(f"[Music] ✓ Sélection: {tone} → {filename}")
    return music_url
