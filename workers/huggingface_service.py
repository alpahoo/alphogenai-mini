"""
Service Hugging Face Inference API (GRATUIT)
Génération d'images avec FLUX.1-schnell
"""
import httpx
import os
from typing import Dict, Any
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import get_settings


class HuggingFaceImageService:
    """
    Génération d'images via Hugging Face Inference API (GRATUIT)
    Modèle: black-forest-labs/FLUX.1-schnell
    Limite: 1000 requêtes/jour sans token, illimité avec token gratuit
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.api_url = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
        self.headers = {}
        
        # Token optionnel (augmente les limites)
        if self.settings.HUGGINGFACE_API_TOKEN:
            self.headers["Authorization"] = f"Bearer {self.settings.HUGGINGFACE_API_TOKEN}"
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30)
    )
    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str = "blurry, low quality, distorted",
        width: int = 1024,
        height: int = 1024
    ) -> Dict[str, Any]:
        """
        Génère une image avec FLUX.1-schnell (GRATUIT)
        
        Args:
            prompt: Description de l'image
            negative_prompt: Ce qu'on ne veut pas
            width/height: Dimensions (max 1024x1024 en gratuit)
            
        Returns:
            {"image_url": str, "width": int, "height": int}
        """
        print(f"[HuggingFace] Génération image: {prompt[:60]}...")
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                payload = {
                    "inputs": prompt,
                    "parameters": {
                        "negative_prompt": negative_prompt,
                        "width": min(width, 1024),  # Max 1024 en gratuit
                        "height": min(height, 1024),
                        "num_inference_steps": 4,  # Schnell = 4 steps rapides
                    }
                }
                
                response = await client.post(
                    self.api_url,
                    headers=self.headers,
                    json=payload,
                    timeout=120.0
                )
                
                if response.status_code == 503:
                    # Modèle en chargement, réessayer
                    print(f"[HuggingFace] ⏳ Modèle en chargement, attente 20s...")
                    import asyncio
                    await asyncio.sleep(20)
                    response = await client.post(
                        self.api_url,
                        headers=self.headers,
                        json=payload,
                        timeout=120.0
                    )
                
                response.raise_for_status()
                
                # L'API retourne directement l'image en bytes
                image_bytes = response.content
                
                # Upload vers Supabase Storage
                from .supabase_client import SupabaseClient
                supabase_client = SupabaseClient()
                
                import uuid
                filename = f"hf_images/{uuid.uuid4()}.png"
                
                result = supabase_client.client.storage.from_("public").upload(
                    path=filename,
                    file=image_bytes,
                    file_options={"content-type": "image/png"}
                )
                
                # Construire l'URL publique
                image_url = f"{self.settings.SUPABASE_URL}/storage/v1/object/public/public/{filename}"
                
                print(f"[HuggingFace] ✓ Image générée (GRATUIT): {image_url[:60]}...")
                
                return {
                    "image_url": image_url,
                    "width": width,
                    "height": height,
                    "model": "FLUX.1-schnell",
                    "cost": 0.0  # GRATUIT !
                }
                
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
            print(f"[HuggingFace] ✗ Erreur: {error_msg}")
            raise RuntimeError(f"HuggingFace API error: {error_msg}") from e
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[HuggingFace] ✗ Erreur: {error_msg}")
            raise RuntimeError(f"HuggingFace error: {error_msg}") from e
