"""
Sélection automatique de musique de fond selon le ton détecté.
"""
import random
import hashlib
from typing import Optional, List, Dict, Any


# Mapping ton → sous-dossier (conservé pour compatibilité cache)
TONE_DIR = {
    "inspirant": "inspiring",
    "science": "synth",
    "léger": "light",
    "dramatique": "dramatic",
    "épique": "epic",
}

MUSIC_LIBRARY = [
    # Inspirant / Uplifting
    {"tone": "inspiring", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3", "title": "Inspired"},
    {"tone": "inspiring", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wishful%20Thinking.mp3", "title": "Wishful Thinking"},
    {"tone": "inspiring", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Acoustic%20Breeze.mp3", "title": "Acoustic Breeze"},
    
    # Science / Synth / Tech
    {"tone": "synth", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ultralounge.mp3", "title": "Ultralounge"},
    {"tone": "synth", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher.mp3", "title": "Cipher"},
    {"tone": "synth", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Arcadia.mp3", "title": "Arcadia"},
    
    # Léger / Fun / Light
    {"tone": "light", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluffing%20a%20Duck.mp3", "title": "Fluffing a Duck"},
    {"tone": "light", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3", "title": "Wallpaper"},
    {"tone": "light", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Quirky%20Dog.mp3", "title": "Quirky Dog"},
    
    # Dramatique / Tense
    {"tone": "dramatic", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cut%20and%20Run.mp3", "title": "Cut and Run"},
    {"tone": "dramatic", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Volatile%20Reaction.mp3", "title": "Volatile Reaction"},
    {"tone": "dramatic", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Crypto.mp3", "title": "Crypto"},
    
    {"tone": "epic", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Impact%20Prelude.mp3", "title": "Impact Prelude"},
    {"tone": "epic", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Organic%20Meditations%20Two.mp3", "title": "Organic Meditations Two"},
    {"tone": "epic", "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Clash%20Defiant.mp3", "title": "Clash Defiant"},
]


def build_prompt_hash(prompt: str, tone: str = "") -> str:
    """
    Génère un hash unique pour le cache musique.
    Combine le prompt + tone pour unicité.
    """
    key = f"{prompt}|music|{tone}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def pick_music_track(tone: str) -> Optional[Dict[str, str]]:
    """
    Sélectionne aléatoirement une piste musicale selon le ton.
    
    Args:
        tone: Ton détecté (inspirant, science, léger, dramatique, épique)
    
    Returns:
        Dict avec "url" et "title" de la piste, ou None si aucune piste trouvée
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
    return {"url": selected["url"], "title": selected["title"]}


def get_music_url_from_storage(
    supabase_url: str,
    filename: str,
    tone: str = "inspiring"
) -> str:
    """
    DEPRECATED: Fonction conservée pour compatibilité mais non utilisée.
    Les URLs de musique sont maintenant directes depuis MUSIC_LIBRARY.
    
    Args:
        supabase_url: Non utilisé
        filename: Non utilisé
        tone: Non utilisé
    
    Returns:
        URL vide (deprecated)
    """
    return ""


async def select_music_for_job(
    supabase_client,
    prompt: str,
    tone: str,
    supabase_url: str = None
) -> Optional[str]:
    """
    Sélectionne une musique gratuite avec cache.
    Utilise maintenant des URLs directes vers incompetech.com et autres sources libres.
    
    Args:
        supabase_client: Client Supabase
        prompt: Prompt utilisateur
        tone: Ton détecté ou forcé
        supabase_url: Non utilisé (conservé pour compatibilité)
    
    Returns:
        URL directe de la piste musicale ou None
    """
    # Vérifier le cache
    prompt_hash = build_prompt_hash(prompt, tone)
    
    try:
        cache_result = supabase_client.client.table("music_cache").select("*").eq(
            "prompt_hash", prompt_hash
        ).eq("audio_mode", "music").execute()
        
        if cache_result.data and len(cache_result.data) > 0:
            cached_url = cache_result.data[0].get("music_track_url")
            if cached_url and cached_url.startswith("http"):
                print(f"[Music] ✓ Cache hit: {cached_url[:80]}...")
                return cached_url
    except Exception as e:
        print(f"[Music] ⚠️  Cache read error: {e}")
    
    # Sélection aléatoire
    track = pick_music_track(tone)
    if not track:
        print(f"[Music] ✗ Aucune piste trouvée pour tone: {tone}")
        return None
    
    music_url = track["url"]
    music_title = track["title"]
    
    # Sauvegarder dans le cache
    try:
        supabase_client.client.table("music_cache").insert({
            "prompt_hash": prompt_hash,
            "audio_mode": "music",
            "music_track_url": music_url,
            "tone": tone
        }).execute()
        print(f"[Music] ✓ Cache saved: {tone} → {music_title}")
    except Exception as e:
        print(f"[Music] ⚠️  Cache write error: {e}")
    
    print(f"[Music] ✓ Sélection: {tone} → {music_title} ({music_url})")
    print(f"[Music] ℹ️  Attribution: Music by Kevin MacLeod (incompetech.com)")
    return music_url
