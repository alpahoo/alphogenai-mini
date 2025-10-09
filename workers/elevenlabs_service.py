# workers/elevenlabs_service.py
"""
Service ElevenLabs robuste avec :
- Chunking automatique pour textes longs (> 2500 chars)
- Concaténation MP3 avec pydub
- Génération SRT par phrase
- Fallback automatique si voice_id absent
- Upload Supabase Storage
"""
import os
import io
import re
import json
import time
import httpx
from typing import Dict, List, Optional, Tuple

try:
    from pydub import AudioSegment
except ImportError:
    raise RuntimeError(
        "pydub n'est pas installé. Ajoutez 'pydub==0.25.1' à requirements.txt"
    )

from workers.supabase_client import get_supabase_client

ELEVEN_API = os.getenv("ELEVENLABS_API_BASE", "https://api.elevenlabs.io")
ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# Defaults
DEFAULT_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
DEFAULT_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "").strip()  # laissé vide → fallback auto
CHUNK_MAX_CHARS = int(os.getenv("ELEVENLABS_CHUNK_MAX_CHARS", "2200"))  # marge de sécurité < 2500
CHUNK_PAUSE_MS = int(os.getenv("ELEVENLABS_CHUNK_PAUSE_MS", "120"))     # silence entre chunks

# --- utils ---

def _split_into_sentences(text: str) -> List[str]:
    """Split texte en phrases (sur .!?)"""
    text = re.sub(r"\s+", " ", text).strip()
    # coupe sur .!? en gardant les ponctuations
    parts = re.split(r"(?<=[\.\!\?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _chunks_by_char_limit(sentences: List[str], limit: int) -> List[str]:
    """Regroupe les phrases en chunks respectant la limite de caractères"""
    chunks, cur = [], ""
    for s in sentences:
        if not cur:
            cur = s
        elif len(cur) + 1 + len(s) <= limit:
            cur += " " + s
        else:
            chunks.append(cur)
            cur = s
    if cur:
        chunks.append(cur)
    return chunks


async def _ensure_voice_id(client: httpx.AsyncClient, requested: Optional[str]) -> str:
    """Fallback: si voice_id absent, prendre la première voix disponible"""
    if requested:
        return requested
    
    print("[ElevenLabs] ELEVENLABS_VOICE_ID non défini, récupération d'une voix par défaut...")
    resp = await client.get(
        f"{ELEVEN_API}/v1/voices", 
        headers={"xi-api-key": ELEVEN_KEY}
    )
    resp.raise_for_status()
    data = resp.json()
    voices = data.get("voices", [])
    if not voices:
        raise RuntimeError("ElevenLabs: aucune voix disponible et ELEVENLABS_VOICE_ID non fourni.")
    
    fallback_voice = voices[0]["voice_id"]
    print(f"[ElevenLabs] Utilisation de la voix par défaut: {fallback_voice}")
    return fallback_voice


def _build_srt(items: List[Tuple[str, int, int]]) -> str:
    """Génère un fichier SRT à partir de (texte, start_ms, end_ms)"""
    lines = []
    for i, (t, start, end) in enumerate(items, 1):
        def fmt(ms: int) -> str:
            s = ms // 1000
            ms_rem = ms % 1000
            hh = s // 3600
            mm = (s % 3600) // 60
            ss = s % 60
            return f"{hh:02}:{mm:02}:{ss:02},{ms_rem:03}"
        
        lines.append(str(i))
        lines.append(f"{fmt(start)} --> {fmt(end)}")
        lines.append(t)
        lines.append("")
    return "\n".join(lines)


# --- main API ---

async def generate_elevenlabs_voice(
    text: str,
    *,
    language: str = "fr",
    voice_id: Optional[str] = None,
    model_id: Optional[str] = None,
    voice_settings: Optional[Dict] = None,
) -> Dict:
    """
    Génère un audio avec ElevenLabs TTS.
    
    Args:
        text: Texte à synthétiser
        language: Langue (fr, en, etc.)
        voice_id: ID de la voix (optionnel, fallback auto si absent)
        model_id: Modèle TTS (défaut: eleven_multilingual_v2)
        voice_settings: Paramètres de voix (stability, similarity_boost)
    
    Returns:
        {
            "audio_url": str,      # URL publique Supabase Storage
            "srt": str,            # Sous-titres SRT
            "duration": float      # Durée en secondes
        }
    
    Fonctionnalités:
        - Chunking automatique si texte > 2200 chars
        - Concaténation MP3 avec silence entre chunks
        - Upload Supabase Storage
        - Génération SRT par phrase
        - Fallback automatique si voice_id absent
    """
    if not ELEVEN_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY manquant")

    model = (model_id or DEFAULT_MODEL_ID).strip()
    
    print(f"[ElevenLabs] Génération audio...")
    print(f"[ElevenLabs] Texte: {len(text)} caractères")
    print(f"[ElevenLabs] Modèle: {model}")
    
    async with httpx.AsyncClient(timeout=60) as client:
        vid = await _ensure_voice_id(client, (voice_id or DEFAULT_VOICE_ID or None))
        print(f"[ElevenLabs] Voice ID: {vid}")

        # 1) Préparer chunks
        sentences = _split_into_sentences(text)
        chunks = _chunks_by_char_limit(sentences, CHUNK_MAX_CHARS)
        print(f"[ElevenLabs] {len(chunks)} chunk(s) à générer")

        timeline: List[Tuple[str, int, int]] = []  # pour SRT
        combined = AudioSegment.silent(duration=0)
        cur_ms = 0

        # 2) Génération par chunk
        for idx, ch in enumerate(chunks, 1):
            print(f"[ElevenLabs] Chunk {idx}/{len(chunks)} ({len(ch)} chars)...")
            
            payload = {
                "model_id": model,
                "text": ch,
                "voice_settings": voice_settings or {
                    "stability": 0.4,
                    "similarity_boost": 0.8,
                }
            }
            
            # endpoint correct: /v1/text-to-speech/{voice_id}
            tts_url = f"{ELEVEN_API}/v1/text-to-speech/{vid}"
            headers = {
                "xi-api-key": ELEVEN_KEY,
                "accept": "audio/mpeg",
                "content-type": "application/json",
            }
            
            resp = await client.post(tts_url, headers=headers, data=json.dumps(payload))
            resp.raise_for_status()
            mp3_bytes = resp.content

            segment = AudioSegment.from_file(io.BytesIO(mp3_bytes), format="mp3")
            
            # SRT timecodes par phrase approx (uniformément réparties dans le chunk)
            ch_sent = _split_into_sentences(ch)
            approx = max(1, len(ch_sent))
            per = int(len(segment) / approx)

            loc_start = cur_ms
            for sent_idx, sent in enumerate(ch_sent):
                s_start = loc_start + sent_idx * per
                s_end = min(loc_start + (sent_idx + 1) * per, loc_start + len(segment))
                timeline.append((sent, s_start, s_end))

            combined += segment
            
            # ajouter un petit silence de jonction
            if CHUNK_PAUSE_MS > 0 and idx < len(chunks):
                combined += AudioSegment.silent(duration=CHUNK_PAUSE_MS)
            
            cur_ms = len(combined)

        duration_seconds = round(len(combined) / 1000.0, 2)
        srt_text = _build_srt(timeline)
        
        print(f"[ElevenLabs] Audio généré: {duration_seconds}s")

        # 3) Export + upload
        out_buf = io.BytesIO()
        combined.export(out_buf, format="mp3")
        out_bytes = out_buf.getvalue()

        # Upload vers Supabase Storage
        try:
            supabase = get_supabase_client()
            ts = int(time.time())
            key = f"audio/{ts}-{abs(hash(text)) % 10_000_000}.mp3"
            
            print(f"[ElevenLabs] Upload vers Supabase Storage: {key}")
            
            # Upload via supabase-py
            result = supabase.storage.from_("assets").upload(
                path=key,
                file=out_bytes,
                file_options={"content-type": "audio/mpeg"}
            )
            
            # Construire l'URL publique
            public_url = supabase.storage.from_("assets").get_public_url(key)
            
            print(f"[ElevenLabs] ✓ Audio uploadé: {public_url}")
            
            return {
                "audio_url": public_url,
                "srt": srt_text,
                "duration": duration_seconds
            }
            
        except Exception as e:
            print(f"[ElevenLabs] ⚠️ Échec upload Supabase ({e}), fallback data: URL")
            
            # fallback data URL (dev)
            import base64
            dataurl = "data:audio/mpeg;base64," + base64.b64encode(out_bytes).decode("utf-8")
            return {
                "audio_url": dataurl,
                "srt": srt_text,
                "duration": duration_seconds
            }
