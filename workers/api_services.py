"""
Wrappers API pour les services IA AlphogenAI Mini
"""
import httpx
import replicate
from typing import Dict, Any, List, Optional
from tenacity import retry, stop_after_attempt, wait_exponential
from .config import get_settings
import os


class QwenService:
    """Qwen LLM pour génération de scripts (API native DashScope)"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.QWEN_API_KEY
        # API native DashScope (pas l'endpoint OpenAI-compatible)
        self.base_url = "https://dashscope-intl.aliyuncs.com/api/v1"
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_script(
        self,
        prompt: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Génère un script vidéo avec Qwen (4 scènes) - API native DashScope"""
        
        # Construire le prompt système complet
        full_prompt = f"""Tu es un scénariste créatif. Génère un script vidéo engageant avec exactement 4 scènes.

Chaque scène doit avoir:
- Un titre (Scène X: ...)
- Une description visuelle détaillée
- Une narration engageante

Prompt utilisateur: {prompt}

Format attendu:
Scène 1: [Titre]
[Description visuelle]
[Narration]

Scène 2: [Titre]
[Description visuelle]
[Narration]

... (4 scènes au total)"""
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/services/aigc/text-generation/generation",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "qwen-plus",
                        "input": {
                            "prompt": full_prompt
                        },
                        "parameters": {
                            "result_format": "text",
                            "max_tokens": 2000,
                            "temperature": 0.8,
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as e:
                error_detail = e.response.text[:500] if e.response.text else "No details"
                print(f"[Qwen] HTTP Error {e.response.status_code}: {error_detail}")
                print(f"[Qwen] Request URL: {e.request.url}")
                raise RuntimeError(f"Qwen API error {e.response.status_code}: {error_detail}") from e
            except httpx.TimeoutException as e:
                print(f"[Qwen] Timeout after 60s")
                raise RuntimeError("Qwen API timeout after 60 seconds") from e
            except Exception as e:
                print(f"[Qwen] Unexpected error: {type(e).__name__}: {str(e)}")
                raise
            
            # API native DashScope retourne le texte dans data["output"]["text"]
            script_text = data["output"]["text"]
            
            return {
                "script": script_text,
                "scenes": self._parse_scenes(script_text),
                "metadata": {
                    "model": data.get("model"),
                    "tokens": data.get("usage", {}),
                }
            }
    
    def _parse_scenes(self, script: str) -> List[Dict[str, str]]:
        """Parse le script en 4 scènes"""
        scenes = []
        lines = script.split("\n")
        current_scene = {"description": "", "narration": ""}
        
        for line in lines:
            line = line.strip()
            # Détecter les marqueurs de scène (Scène, Scene, SCÈNE, SCENE)
            if line.lower().startswith("scène") or line.lower().startswith("scene") or line.startswith("**Scène"):
                if current_scene["description"] or current_scene["narration"]:
                    scenes.append(current_scene)
                current_scene = {"description": line, "narration": ""}
            elif line and not line.startswith("**Titre"):
                # Ajouter à la narration (ignorer les titres markdown)
                current_scene["narration"] += " " + line
        
        if current_scene["description"] or current_scene["narration"]:
            scenes.append(current_scene)
        
        # Limiter à exactement 4 scènes
        return scenes[:4]


class WANImageService:
    """DashScope WANX Image pour génération d'images clés"""
    
    def __init__(self):
        self.settings = get_settings()
        # Utiliser DashScope (même clé que Qwen)
        self.api_key = self.settings.DASHSCOPE_API_KEY
        self.base_url = "https://dashscope-intl.aliyuncs.com/api/v1"
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_image(
        self,
        prompt: str,
        style: str = "cinematic"
    ) -> Dict[str, Any]:
        """Génère une image clé avec DashScope WANX Image"""
        
        # Adapter le prompt avec le style
        full_prompt = f"{prompt}, {style} style, high quality, detailed, 8k"
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                print(f"[WANX Image] Génération avec DashScope...")
                
                response = await client.post(
                    f"{self.base_url}/services/aigc/text2image/image-synthesis",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "X-DashScope-Async": "enable",  # Mode async
                    },
                    json={
                        "model": "wanx-1.0",  # Nom correct du modèle DashScope
                        "input": {
                            "prompt": full_prompt
                        },
                        "parameters": {
                            "size": "1024*1024",  # DashScope format
                            "n": 1
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                # Vérifier si on a un task_id pour polling
                output = data.get("output", {})
                task_id = output.get("task_id")
                
                if task_id:
                    # Mode async - attendre la génération
                    print(f"[WANX Image] Task ID: {task_id}, attente génération...")
                    image_url = await self._poll_image_generation(client, task_id)
                else:
                    # Mode sync - l'image est déjà prête
                    results = output.get("results", [])
                    if not results or not results[0].get("url"):
                        raise RuntimeError(f"No image URL in response: {data}")
                    image_url = results[0]["url"]
                
                print(f"[WANX Image] ✓ Image générée: {image_url[:50]}...")
                
                return {
                    "image_url": image_url,
                    "image_id": task_id or "sync",
                    "metadata": {
                        "model": "wanx-1.0",
                        "provider": "dashscope"
                    },
                }
            except httpx.HTTPStatusError as e:
                error_detail = e.response.text[:500] if e.response.text else "No details"
                print(f"[WANX Image] HTTP Error {e.response.status_code}: {error_detail}")
                raise RuntimeError(f"DashScope WANX Image API error {e.response.status_code}: {error_detail}") from e
            except httpx.TimeoutException as e:
                print(f"[WANX Image] Timeout after 120s")
                raise RuntimeError("DashScope WANX Image API timeout") from e
            except Exception as e:
                print(f"[WANX Image] Unexpected error: {type(e).__name__}: {str(e)}")
                raise
    
    async def _poll_image_generation(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        max_attempts: int = 60
    ) -> str:
        """Poll DashScope pour attendre la génération d'image"""
        import asyncio
        
        for attempt in range(max_attempts):
            await asyncio.sleep(2)  # 2s entre chaque tentative
            
            try:
                response = await client.get(
                    f"{self.base_url}/services/aigc/text2image/image-synthesis/{task_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                )
                response.raise_for_status()
                data = response.json()
                
                output = data.get("output", {})
                task_status = output.get("task_status", "UNKNOWN")
                
                if task_status == "SUCCEEDED":
                    results = output.get("results", [])
                    if not results or not results[0].get("url"):
                        raise RuntimeError(f"No image URL in completed task: {output}")
                    
                    return results[0]["url"]
                elif task_status in ["FAILED", "CANCELED"]:
                    error_msg = output.get("message", "Unknown error")
                    raise RuntimeError(f"Image generation {task_status}: {error_msg}")
                
                # Afficher progression tous les 10 tentatives
                if (attempt + 1) % 10 == 0:
                    print(f"[WANX Image] Toujours en attente... ({attempt + 1}/{max_attempts})")
            
            except httpx.HTTPStatusError as e:
                print(f"[WANX Image] Erreur polling {task_id}: {e.response.status_code}")
                if attempt == max_attempts - 1:
                    raise
        
        raise RuntimeError(f"Image generation timeout after {max_attempts * 2}s")


class PikaService:
    """Pika pour génération de clips vidéo (4s avec --image + seed)"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.PIKA_API_KEY
        self.base_url = self.settings.PIKA_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_clip(
        self,
        prompt: str,
        image_url: Optional[str] = None,
        seed: Optional[int] = None,
        duration: int = 4
    ) -> Dict[str, Any]:
        """Génère un clip vidéo de 4s avec Pika (options --image + seed)"""
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": "16:9",
                "options": {
                    "image": True,  # Flag --image pour utiliser image de référence
                }
            }
            
            # Image de référence (seed visuel)
            if image_url:
                payload["image_url"] = image_url
            
            # Seed pour cohérence visuelle
            if seed is not None:
                payload["seed"] = seed
            
            response = await client.post(
                f"{self.base_url}/videos/generate",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            # Attendre la génération
            video_id = data["id"]
            video_url = await self._poll_video_status(client, video_id)
            
            return {
                "video_url": video_url,
                "video_id": video_id,
                "duration": duration,
            }
    
    async def _poll_video_status(
        self,
        client: httpx.AsyncClient,
        video_id: str,
        max_attempts: int = 60
    ) -> str:
        """Poll l'API Pika pour attendre la génération"""
        import asyncio
        
        print(f"[Pika] Attente génération vidéo {video_id}...")
        
        for attempt in range(max_attempts):
            try:
                response = await client.get(
                    f"{self.base_url}/videos/{video_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                )
                response.raise_for_status()
                data = response.json()
                
                status = data.get("status", "unknown")
                
                if status == "completed":
                    print(f"[Pika] ✓ Vidéo {video_id} prête ({attempt + 1} tentatives)")
                    return data["url"]
                elif status == "failed":
                    error_msg = data.get('error', 'Unknown error')
                    raise RuntimeError(f"Pika video generation failed: {error_msg}")
                
                # Afficher progression tous les 10 tentatives
                if (attempt + 1) % 10 == 0:
                    print(f"[Pika] Toujours en attente... ({attempt + 1}/{max_attempts})")
                
                await asyncio.sleep(5)
            
            except httpx.HTTPStatusError as e:
                print(f"[Pika] Erreur polling {video_id}: {e.response.status_code}")
                if attempt == max_attempts - 1:
                    raise
                await asyncio.sleep(5)
        
        raise RuntimeError(f"Pika video generation timeout after {max_attempts * 5}s")


class WANVideoService:
    """DashScope WAN Video pour génération de clips (4-8s)"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.DASHSCOPE_API_KEY
        self.base_url = self.settings.DASHSCOPE_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_clip(
        self,
        prompt: str,
        duration: int = 6
    ) -> Dict[str, Any]:
        """Génère un clip vidéo de 4-8s avec WAN Video via DashScope"""
        async with httpx.AsyncClient(timeout=600.0) as client:
            payload = {
                "model": "wanx-v1",
                "input": {
                    "text": prompt
                },
                "parameters": {}
            }
            
            response = await client.post(
                f"{self.base_url}/services/aigc/text2video/generation",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "X-DashScope-Async": "enable"  # Mode async
                },
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            # Récupérer task_id pour polling
            if data.get("output") and data["output"].get("task_id"):
                task_id = data["output"]["task_id"]
            elif data.get("request_id"):
                task_id = data["request_id"]
            else:
                raise Exception(f"No task_id in response: {data}")
            
            # Poll pour la génération
            video_result = await self._poll_generation_status(client, task_id)
            
            return {
                "engine": "wan",
                "prompt": prompt,
                "video_url": video_result["video_url"],
                "duration": video_result.get("duration", duration),
                "task_id": task_id
            }
    
    async def _poll_generation_status(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        max_attempts: int = 120
    ) -> Dict[str, Any]:
        """Poll DashScope pour attendre la génération"""
        import asyncio
        
        for attempt in range(max_attempts):
            await asyncio.sleep(5)
            
            response = await client.get(
                f"{self.base_url}/services/aigc/text2video/generation/{task_id}",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()
            data = response.json()
            
            output = data.get("output", {})
            task_status = output.get("task_status", "UNKNOWN")
            
            if task_status == "SUCCEEDED":
                video_url = output.get("video_url")
                if not video_url:
                    raise Exception(f"No video_url in completed task: {output}")
                
                return {
                    "video_url": video_url,
                    "duration": output.get("video_duration", 6)
                }
            elif task_status in ["FAILED", "CANCELED"]:
                error_msg = output.get("message", "Unknown error")
                raise Exception(f"WAN Video generation {task_status}: {error_msg}")
            
            # Continue polling pour PENDING, RUNNING, etc.
        
        raise Exception(f"WAN Video generation timeout after {max_attempts * 5}s")


class ElevenLabsService:
    """ElevenLabs pour text-to-speech + SRT"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.ELEVENLABS_API_KEY
        self.base_url = self.settings.ELEVENLABS_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_speech(
        self,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    ) -> Dict[str, Any]:
        """Génère voix + sous-titres SRT"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    }
                }
            )
            response.raise_for_status()
            
            audio_bytes = response.content
            srt_content = self._generate_srt(text)
            
            return {
                "audio_bytes": audio_bytes,
                "audio_url": None,  # À uploader vers Supabase Storage
                "srt_content": srt_content,
                "duration": len(audio_bytes) / 44100 / 2,  # Estimation
            }
    
    def _generate_srt(self, text: str) -> str:
        """Génère fichier SRT avec timing estimé"""
        words = text.split()
        words_per_second = 2.5
        srt_lines = []
        
        for i in range(0, len(words), 5):
            chunk = " ".join(words[i:i+5])
            start_time = i / words_per_second
            end_time = (i + 5) / words_per_second
            
            srt_lines.append(f"{len(srt_lines) + 1}")
            srt_lines.append(
                f"{self._format_srt_time(start_time)} --> {self._format_srt_time(end_time)}"
            )
            srt_lines.append(chunk)
            srt_lines.append("")
        
        return "\n".join(srt_lines)
    
    def _format_srt_time(self, seconds: float) -> str:
        """Formate timestamp SRT"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


class RemotionService:
    """Remotion pour assemblage final"""
    
    def __init__(self):
        self.settings = get_settings()
        self.renderer_url = self.settings.REMOTION_RENDERER_URL
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def render_video(
        self,
        clips: List[Dict[str, Any]],
        audio_url: str,
        srt_content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Assemble la vidéo finale avec Remotion"""
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                f"{self.renderer_url}/render",
                json={
                    "composition": "VideoComposition",
                    "inputProps": {
                        "clips": clips,
                        "audio": audio_url,
                        "subtitles": srt_content,
                        "metadata": metadata or {},
                    },
                    "codec": "h264",
                    "outputFormat": "mp4",
                }
            )
            response.raise_for_status()
            data = response.json()
            
            # Attendre le rendu
            render_id = data["renderId"]
            video_url = await self._poll_render_status(client, render_id)
            
            return {
                "video_url": video_url,
                "render_id": render_id,
            }
    
    async def _poll_render_status(
        self,
        client: httpx.AsyncClient,
        render_id: str,
        max_attempts: int = 120
    ) -> str:
        """Poll Remotion pour attendre le rendu"""
        import asyncio
        
        for _ in range(max_attempts):
            response = await client.get(
                f"{self.renderer_url}/render/{render_id}"
            )
            response.raise_for_status()
            data = response.json()
            
            if data["status"] == "completed":
                return data["url"]
            elif data["status"] == "failed":
                raise Exception(f"Remotion render failed: {data.get('error')}")
            
            await asyncio.sleep(5)
        
        raise Exception("Remotion render timeout")


# ============================================================================
# Fonctions d'aiguillage pour choix du moteur vidéo
# ============================================================================

async def generate_wan_video_clip(prompt: str) -> Dict[str, Any]:
    """
    Génère un clip vidéo avec WAN Video (DashScope)
    
    Args:
        prompt: Description textuelle du clip vidéo à générer
        
    Returns:
        Dict avec: engine, prompt, video_url, duration
    """
    wan_service = WANVideoService()
    result = await wan_service.generate_clip(prompt)
    return result


async def generate_pika_video_clip(
    prompt: str,
    image_url: Optional[str] = None,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Génère un clip vidéo avec Pika
    
    Args:
        prompt: Description textuelle du clip vidéo
        image_url: URL d'image de référence (optionnel)
        seed: Seed pour cohérence visuelle (optionnel)
        
    Returns:
        Dict avec: engine, prompt, video_url, duration
    """
    pika_service = PikaService()
    result = await pika_service.generate_clip(
        prompt=prompt,
        image_url=image_url,
        seed=seed,
        duration=4
    )
    
    return {
        "engine": "pika",
        "prompt": prompt,
        "video_url": result["video_url"],
        "duration": result["duration"],
        "video_id": result.get("video_id")
    }


async def generate_still_image(prompt: str) -> Dict[str, Any]:
    """
    Génère une image fixe avec WAN Image
    (Pour mode "stills" - image statique au lieu de vidéo)
    
    Args:
        prompt: Description de l'image
        
    Returns:
        Dict avec: engine, prompt, video_url (image), duration (0)
    """
    wan_image_service = WANImageService()
    result = await wan_image_service.generate_image(prompt, style="cinematic")
    
    return {
        "engine": "stills",
        "prompt": prompt,
        "video_url": result["image_url"],  # Image au lieu de vidéo
        "duration": 0,  # Image statique
        "image_id": result["image_id"]
    }


async def generate_video_clip(
    engine: str,
    prompt: str,
    image_url: Optional[str] = None,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Fonction d'aiguillage pour générer un clip vidéo avec le moteur choisi
    
    Args:
        engine: Moteur à utiliser ("wan", "pika", ou "stills")
        prompt: Description du clip à générer
        image_url: URL d'image de référence (pour Pika)
        seed: Seed pour cohérence visuelle (pour Pika)
        
    Returns:
        Dict avec: engine, prompt, video_url, duration
        
    Raises:
        ValueError: Si le moteur n'est pas reconnu
    """
    if engine == "wan":
        return await generate_wan_video_clip(prompt)
    elif engine == "pika":
        return await generate_pika_video_clip(prompt, image_url, seed)
    elif engine == "stills":
        return await generate_still_image(prompt)
    else:
        raise ValueError(f"Unknown VIDEO_ENGINE: {engine}. Must be 'wan', 'pika', or 'stills'.")


async def generate_elevenlabs_voice(
    text: str,
    voice_id: str = "eleven_multilingual_v2",
    language: str = "fr"
) -> Dict[str, Any]:
    """
    Utilise l'API ElevenLabs pour générer un MP3 + SRT à partir du texte.
    Upload l'audio sur Supabase Storage et retourne l'URL publique.
    
    Args:
        text: Texte à convertir en voix
        voice_id: ID de la voix ElevenLabs (défaut: multilingual v2)
        language: Code langue (fr, en, es, etc.)
        
    Returns:
        {
            "audio_url": str,      # URL publique du MP3 sur Supabase Storage
            "srt": str,           # Contenu SRT synchronisé
            "duration": float     # Durée en secondes
        }
    """
    import os
    from datetime import datetime, timezone
    
    settings = get_settings()
    api_key = settings.ELEVENLABS_API_KEY
    base_url = settings.ELEVENLABS_API_BASE
    
    # Créer client Supabase pour upload
    from .supabase_client import SupabaseClient
    supabase_client = SupabaseClient()
    
    # Générer l'audio avec ElevenLabs
    async with httpx.AsyncClient(timeout=120.0) as client:
        # Pour multilingual v2, on peut spécifier la langue
        response = await client.post(
            f"{base_url}/text-to-speech/{voice_id}",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.0,
                    "use_speaker_boost": True
                },
                "language_code": language  # fr, en, es, etc.
            }
        )
        response.raise_for_status()
        audio_bytes = response.content
    
    # Calculer la durée de l'audio
    # ElevenLabs retourne généralement ~24kHz, 16-bit mono
    # Formule: bytes / (sample_rate * bytes_per_sample * channels)
    # Estimation: ~48000 bytes par seconde pour 24kHz mono 16-bit
    estimated_duration = len(audio_bytes) / 48000.0
    
    # Alternative: estimer par nombre de caractères
    # Français: ~14 caractères par seconde de parole
    char_based_duration = len(text) / 14.0
    
    # Utiliser la moyenne pour plus de précision
    duration = (estimated_duration + char_based_duration) / 2.0
    
    # Upload sur Supabase Storage
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"audio_{timestamp}.mp3"
    
    # Upload vers le bucket 'uploads' (ou créer bucket 'audio')
    upload_result = supabase_client.client.storage.from_("uploads").upload(
        filename,
        audio_bytes,
        file_options={"content-type": "audio/mpeg"}
    )
    
    # Obtenir l'URL publique
    audio_url = supabase_client.client.storage.from_("uploads").get_public_url(filename)
    
    # Générer SRT synchronisé
    srt_content = _generate_advanced_srt(text, duration)
    
    return {
        "audio_url": audio_url,
        "srt": srt_content,
        "duration": duration
    }


def _generate_advanced_srt(text: str, total_duration: float) -> str:
    """
    Génère un fichier SRT synchronisé basé sur la durée totale.
    Découpe le texte en segments de ~5-8 mots avec timing précis.
    """
    # Découper par phrases ou segments logiques
    sentences = text.replace('!', '.').replace('?', '.').split('.')
    sentences = [s.strip() for s in sentences if s.strip()]
    
    # Si peu de phrases, découper par mots
    if len(sentences) < 3:
        words = text.split()
        # Grouper en chunks de 5-8 mots
        sentences = []
        chunk_size = 6
        for i in range(0, len(words), chunk_size):
            chunk = " ".join(words[i:i+chunk_size])
            sentences.append(chunk)
    
    srt_lines = []
    segment_duration = total_duration / len(sentences) if sentences else 1.0
    
    for idx, sentence in enumerate(sentences):
        start_time = idx * segment_duration
        end_time = (idx + 1) * segment_duration
        
        # Numéro du sous-titre
        srt_lines.append(f"{idx + 1}")
        
        # Timecodes
        srt_lines.append(
            f"{_format_srt_timestamp(start_time)} --> {_format_srt_timestamp(end_time)}"
        )
        
        # Texte
        srt_lines.append(sentence)
        
        # Ligne vide
        srt_lines.append("")
    
    return "\n".join(srt_lines)


def _format_srt_timestamp(seconds: float) -> str:
    """Formate les secondes en timestamp SRT (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


async def render_with_remotion(
    clips: List[Dict[str, Any]],
    audio_url: str,
    srt: str | None = None,
    logo_url: str | None = None
) -> Dict[str, Any]:
    """
    Déclenche un rendu Remotion Cloud (Lambda) et retourne l'URL finale.
    
    Args:
        clips: Liste de clips avec video_url et duration
        audio_url: URL publique du fichier audio MP3
        srt: Contenu SRT des sous-titres (optionnel)
        logo_url: URL du logo watermark (optionnel)
        
    Returns:
        {
            "final_video_url": str,  # URL de la vidéo finale MP4
            "render_id": str         # ID du rendu Remotion
        }
    """
    import os
    from datetime import datetime, timezone
    
    settings = get_settings()
    
    # Vérifier si on utilise Remotion Cloud ou Local
    use_cloud = settings.REMOTION_SITE_ID and settings.REMOTION_SECRET_KEY
    
    if not use_cloud:
        raise ValueError(
            "Remotion Cloud credentials not configured. "
            "Please set REMOTION_SITE_ID and REMOTION_SECRET_KEY"
        )
    
    site_id = settings.REMOTION_SITE_ID
    secret_key = settings.REMOTION_SECRET_KEY
    
    # Formater les clips pour Remotion
    formatted_clips = [
        {
            "video_url": clip.get("video_url") or clip.get("url"),
            "duration": clip.get("duration", 6)
        }
        for clip in clips
    ]
    
    # Calculer durée totale
    total_duration = sum(clip["duration"] for clip in formatted_clips)
    total_frames = int(total_duration * 30)  # 30 FPS
    
    print(f"[Remotion Cloud] 🎬 Démarrage rendu...")
    print(f"[Remotion Cloud] Clips: {len(formatted_clips)}")
    print(f"[Remotion Cloud] Durée: {total_duration}s ({total_frames} frames)")
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        # Démarrer le rendu
        render_payload = {
            "compositionId": "VideoComposition",
            "serveUrl": f"https://remotion.pro/api/sites/{site_id}",
            "inputProps": {
                "clips": formatted_clips,
                "audioUrl": audio_url,
                "srt": srt,
                "logoUrl": logo_url,
            },
            "codec": "h264",
            "imageFormat": "jpeg",
            "scale": 1,
            "everyNthFrame": 1,
            "numberOfGifLoops": 0,
            "frameRange": None,
        }
        
        response = await client.post(
            "https://api.remotion.pro/lambda/render",
            headers={
                "Authorization": f"Bearer {secret_key}",
                "Content-Type": "application/json",
            },
            json=render_payload
        )
        response.raise_for_status()
        data = response.json()
        
        render_id = data.get("renderId")
        if not render_id:
            raise Exception(f"No renderId in Remotion response: {data}")
        
        print(f"[Remotion Cloud] 📡 Render ID: {render_id}")
        print(f"[Remotion Cloud] ⏳ Polling status...")
        
        # Poller jusqu'à ce que le rendu soit terminé
        final_video_url = await _poll_remotion_render(
            client,
            render_id,
            secret_key
        )
        
        print(f"[Remotion Cloud] ✅ Rendu terminé!")
        print(f"[Remotion Cloud] URL: {final_video_url}")
        
        return {
            "final_video_url": final_video_url,
            "render_id": render_id
        }


async def _poll_remotion_render(
    client: httpx.AsyncClient,
    render_id: str,
    secret_key: str,
    max_attempts: int = 240  # 20 minutes max
) -> str:
    """
    Polle le statut du rendu Remotion Cloud jusqu'à completion
    """
    import asyncio
    
    for attempt in range(max_attempts):
        await asyncio.sleep(5)  # Check toutes les 5 secondes
        
        response = await client.get(
            f"https://api.remotion.pro/lambda/render/{render_id}",
            headers={"Authorization": f"Bearer {secret_key}"}
        )
        response.raise_for_status()
        data = response.json()
        
        status = data.get("status")
        progress = data.get("overallProgress", 0)
        
        if attempt % 6 == 0:  # Log toutes les 30s
            print(f"[Remotion Cloud] Status: {status} ({progress * 100:.0f}%)")
        
        if status == "done":
            video_url = data.get("outputFile") or data.get("url")
            if not video_url:
                raise Exception(f"No outputFile in completed render: {data}")
            return video_url
        
        elif status in ["error", "failed"]:
            error_msg = data.get("errors", data.get("error", "Unknown error"))
            raise Exception(f"Remotion render failed: {error_msg}")
    
    raise Exception(f"Remotion render timeout after {max_attempts * 5} seconds")


# ========================================
# REPLICATE SERVICES (SD 3.5 Turbo + WAN i2v)
# ========================================

def _to_url(x):
    """
    Normalise n'importe quelle sortie Replicate en URL str.
    Gère: str, FileOutput (url/path), dict, liste, etc.
    """
    try:
        # cas déjà str
        if isinstance(x, str):
            return x
        # nouveaux SDK: FileOutput => .url ou .path
        url = getattr(x, "url", None) or getattr(x, "path", None)
        if url:
            return str(url)
        # parfois les modèles renvoient un dict {"images": [...]} ou {"image": "..."}
        if isinstance(x, dict):
            if "images" in x:
                v = x["images"]
            elif "image" in x:
                v = x["image"]
            elif "output" in x:
                v = x["output"]
            else:
                v = x
            # re-normalise récursivement
            if isinstance(v, list):
                return _to_url(v[0]) if v else None
            return _to_url(v)
        # liste/tuple => prends le premier
        if isinstance(x, (list, tuple)):
            return _to_url(x[0]) if x else None
        # fallback
        return str(x)
    except Exception:
        return None


def generate_image_with_replicate(
    prompt: str,
    *,
    aspect_ratio: str = "16:9",
    width: int = 1280,
    height: int = 720,
    seed: int | None = None,
    model: str | None = None
) -> str:
    """
    Retourne TOUJOURS une URL d'image (str) ou lève une Exception claire.
    Par défaut utilise FLUX.1-schnell (rapide) pour un MVP.
    """
    import os
    
    api_token = os.getenv("REPLICATE_API_TOKEN")
    if not api_token:
        raise RuntimeError("REPLICATE_API_TOKEN manquant")
    
    client = replicate.Client(api_token=api_token)
    
    # Modèle par défaut: FLUX.1-schnell (rapide et pas cher)
    model_id = model or "black-forest-labs/flux-schnell"
    
    # Beaucoup de modèles acceptent "width/height" + "num_outputs"
    # Ne PAS utiliser len() sur le résultat: normaliser via _to_url
    inputs = {
        "prompt": prompt,
        "num_outputs": 1,
        "width": width,
        "height": height,
        # mets un seed si dispo; sinon le modèle l'ignore
        "seed": seed or 42,
    }
    
    # Utilise la méthode la plus simple et fiable
    result = client.run(f"{model_id}:latest", input=inputs)
    
    # Normalise en URL
    url = _to_url(result)
    if not url:
        # si le modèle renvoie une liste d'images, essaye de les aplatir
        if isinstance(result, (list, tuple)) and result:
            url = _to_url(result[0])
    if not url:
        raise RuntimeError(f"Impossible d'extraire une URL d'image depuis la sortie Replicate: {result}")
    
    return url


def generate_scene_images_with_replicate(scenes: list[str]) -> list[str]:
    """
    scenes: liste de prompts (4 scènes).
    Retourne une liste de 4 URLs d'images.
    En cas d'échec ponctuel, lève une Exception (gérée par le retry existant).
    """
    urls = []
    for idx, s in enumerate(scenes, start=1):
        # Option: enrichir le prompt pour cohérence style
        prompt_img = f"{s}, cinematic, high quality, detailed, 16:9, sharp focus, soft lighting, no text, no watermark"
        url = generate_image_with_replicate(
            prompt_img,
            aspect_ratio="16:9",
            width=1280,
            height=720,
            seed=1000 + idx
        )
        urls.append(url)
    return urls


class ReplicateSDService:
    """Replicate Images via FLUX.1-schnell (rapide et robuste)"""
    
    def __init__(self):
        self.settings = get_settings()
        # Configurer Replicate
        os.environ["REPLICATE_API_TOKEN"] = self.settings.REPLICATE_API_TOKEN
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_image(
        self,
        prompt: str,
        style: str = "cinematic"
    ) -> Dict[str, Any]:
        """Génère une image avec Replicate (FLUX.1-schnell)"""
        
        try:
            # Améliorer le prompt avec le style
            full_prompt = f"{prompt}, {style} style, high quality, detailed, 16:9, sharp focus, soft lighting, no text, no watermark"
            
            print(f"[Replicate Images] Génération image...")
            print(f"[Replicate Images] Prompt: {full_prompt[:80]}...")
            
            # Appel synchrone dans async context
            import asyncio
            image_url = await asyncio.to_thread(
                generate_image_with_replicate,
                full_prompt,
                aspect_ratio="16:9",
                width=1280,
                height=720
            )
            
            if not image_url or not image_url.startswith("http"):
                raise RuntimeError(f"URL d'image invalide: {image_url}")
            
            print(f"[Replicate Images] ✓ Image générée: {image_url[:60]}...")
            
            return {
                "image_url": image_url,
                "image_id": "replicate-flux",
                "metadata": {
                    "model": "flux-schnell",
                    "provider": "replicate"
                }
            }
        
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[Replicate Images] ✗ Erreur: {error_msg}")
            raise RuntimeError(f"Replicate Images error: {error_msg}") from e


class ReplicateWANVideoService:
    """WAN 2.1 i2v-720p via Replicate pour image-to-video"""
    
    def __init__(self):
        self.settings = get_settings()
        os.environ["REPLICATE_API_TOKEN"] = self.settings.REPLICATE_API_TOKEN
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_video_from_image(
        self,
        prompt: str,
        image_url: str,
        duration: int = 4
    ) -> Dict[str, Any]:
        """Génère une vidéo 720p à partir d'une image avec WAN 2.1 i2v"""
        
        try:
            print(f"[Replicate WAN] Génération vidéo 720p...")
            print(f"[Replicate WAN] Image source: {image_url[:60]}...")
            print(f"[Replicate WAN] Duration: {duration}s")
            
            # Appel Replicate WAN i2v
            import asyncio
            
            # Essayer 720p d'abord, fallback sur 480p
            try:
                print(f"[Replicate WAN] Essai résolution 720p...")
                output = await asyncio.to_thread(
                    replicate.run,
                    "wavespeedai/wan-2.1-i2v-720p",
                    input={
                        "image": image_url,
                        "prompt": prompt,
                        "duration": duration,
                    }
                )
                resolution = "720p"
            except Exception as e:
                # Fallback sur 480p si 720p n'existe pas
                print(f"[Replicate WAN] 720p non disponible, fallback 480p")
                output = await asyncio.to_thread(
                    replicate.run,
                    "wavespeedai/wan-2.1-i2v-480p",
                    input={
                        "image": image_url,
                        "prompt": prompt,
                        "duration": duration,
                    }
                )
                resolution = "480p"
            
            # output peut être une URL, une liste, ou un FileOutput
            if isinstance(output, str):
                video_url = output
            elif isinstance(output, list) and len(output) > 0:
                video_url = str(output[0])
            elif hasattr(output, 'url'):
                video_url = output.url
            else:
                video_url = str(output)
            
            print(f"[Replicate WAN] ✓ Vidéo {resolution} générée: {video_url[:60]}...")
            
            return {
                "engine": "replicate_wan",
                "video_url": video_url,
                "duration": duration,
                "resolution": resolution,
                "metadata": {
                    "provider": "replicate",
                    "source_image": image_url,
                    "model": f"wan-2.1-i2v-{resolution}"
                }
            }
        
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[Replicate WAN] ✗ Erreur: {error_msg}")
            raise RuntimeError(f"Replicate WAN i2v error: {error_msg}") from e
