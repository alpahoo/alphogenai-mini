"""
Script de validation des variables d'environnement requises
Lance ce script avant de démarrer le worker pour vérifier la configuration
"""
import os
import sys
from typing import List, Tuple


def validate_environment() -> Tuple[bool, List[str]]:
    """Valide que toutes les variables d'environnement requises sont présentes"""
    
    errors = []
    warnings = []
    
    # ========================================
    # VARIABLES CRITIQUES (REQUIRED)
    # ========================================
    
    required_vars = {
        # Supabase
        "SUPABASE_URL": "URL de votre projet Supabase",
        "SUPABASE_SERVICE_ROLE_KEY": "Clé service role Supabase (ou SUPABASE_SERVICE_KEY)",
        
        # AI Services
        "QWEN_API_KEY": "Clé API DashScope pour Qwen",
        "REPLICATE_API_TOKEN": "Clé API Replicate pour images et vidéos",
        "ELEVENLABS_API_KEY": "Clé API ElevenLabs pour TTS",
        
        # Video Engine (au moins un des deux)
        # "PIKA_API_KEY": "Clé API Pika pour génération vidéo",
        # "WAN_VIDEO_API_KEY": "Alternative à Pika",
    }
    
    print("=" * 70)
    print("🔍 VALIDATION DES VARIABLES D'ENVIRONNEMENT")
    print("=" * 70)
    print()
    
    # Vérifier Supabase
    print("📦 Supabase:")
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY") or 
        os.getenv("SUPABASE_SERVICE_KEY") or
        os.getenv("SUPABASE_SUPABASE_SERVICE_ROLE_KEY")
    )
    
    if not supabase_url:
        errors.append("❌ SUPABASE_URL manquante")
        print("  ❌ SUPABASE_URL: MANQUANTE")
    else:
        print(f"  ✅ SUPABASE_URL: {supabase_url[:30]}...")
    
    if not supabase_key:
        errors.append("❌ SUPABASE_SERVICE_ROLE_KEY manquante")
        print("  ❌ SUPABASE_SERVICE_ROLE_KEY: MANQUANTE")
    else:
        print(f"  ✅ SUPABASE_SERVICE_ROLE_KEY: {supabase_key[:20]}...")
    
    print()
    
    # Vérifier Qwen (API native DashScope)
    print("🤖 Qwen LLM:")
    qwen_key = os.getenv("QWEN_API_KEY")
    if not qwen_key:
        errors.append("❌ QWEN_API_KEY manquante")
        print("  ❌ QWEN_API_KEY: MANQUANTE")
    else:
        print(f"  ✅ QWEN_API_KEY: {qwen_key[:15]}...")
        if not qwen_key.startswith("sk-"):
            warnings.append("⚠️  QWEN_API_KEY ne commence pas par 'sk-'")
            print("  ⚠️  Clé ne commence pas par 'sk-' (vérifie que c'est correct)")
    
    print()
    
    # Vérifier Replicate (Images + Vidéos)
    print("🎨 Replicate (SD 3.5 Turbo + WAN i2v):")
    replicate_token = os.getenv("REPLICATE_API_TOKEN")
    if not replicate_token:
        errors.append("❌ REPLICATE_API_TOKEN manquante")
        print("  ❌ REPLICATE_API_TOKEN: MANQUANTE")
    else:
        print(f"  ✅ REPLICATE_API_TOKEN: {replicate_token[:15]}...")
        print("  ℹ️  Utilisé pour : SD 3.5 Turbo (images) + WAN 2.1 i2v (vidéos)")
    
    print()
    
    # Vérifier Pika (optionnel selon VIDEO_ENGINE)
    print("🎥 Pika Video (optionnel):")
    pika_key = os.getenv("PIKA_API_KEY")
    if not pika_key:
        print("  ⚠️  PIKA_API_KEY: MANQUANTE (OK si VIDEO_ENGINE=wan)")
    else:
        print(f"  ✅ PIKA_API_KEY: {pika_key[:15]}...")
    
    print()
    
    # Vérifier ElevenLabs
    print("🎙️  ElevenLabs TTS:")
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
    if not elevenlabs_key:
        errors.append("❌ ELEVENLABS_API_KEY manquante")
        print("  ❌ ELEVENLABS_API_KEY: MANQUANTE")
    else:
        print(f"  ✅ ELEVENLABS_API_KEY: {elevenlabs_key[:15]}...")
    
    print()
    
    # Vérifier Remotion (optionnel pour cloud rendering)
    print("🎞️  Remotion Cloud (optionnel):")
    remotion_site = os.getenv("REMOTION_SITE_ID")
    remotion_key = os.getenv("REMOTION_SECRET_KEY")
    remotion_url = os.getenv("REMOTION_RENDERER_URL")
    
    if not remotion_url:
        warnings.append("⚠️  REMOTION_RENDERER_URL manquante (requis pour assemblage final)")
        print("  ⚠️  REMOTION_RENDERER_URL: MANQUANTE")
    else:
        print(f"  ✅ REMOTION_RENDERER_URL: {remotion_url}")
    
    if remotion_site:
        print(f"  ✅ REMOTION_SITE_ID: {remotion_site[:15]}...")
    if remotion_key:
        print(f"  ✅ REMOTION_SECRET_KEY: {remotion_key[:15]}...")
    
    print()
    
    # Vérifier VIDEO_ENGINE
    print("⚙️  Configuration:")
    video_engine = os.getenv("VIDEO_ENGINE", "wan")
    print(f"  ✅ VIDEO_ENGINE: {video_engine}")
    
    if video_engine == "wan" and not dashscope_key:
        errors.append("❌ VIDEO_ENGINE=wan mais DASHSCOPE_API_KEY manquante")
    elif video_engine == "pika" and not pika_key:
        errors.append("❌ VIDEO_ENGINE=pika mais PIKA_API_KEY manquante")
    
    poll_interval = os.getenv("POLL_INTERVAL", "10")
    max_retries = os.getenv("MAX_RETRIES", "3")
    print(f"  ✅ POLL_INTERVAL: {poll_interval}s")
    print(f"  ✅ MAX_RETRIES: {max_retries}")
    
    print()
    print("=" * 70)
    
    # Résumé
    if errors:
        print("❌ VALIDATION ÉCHOUÉE")
        print()
        print("Erreurs critiques:")
        for error in errors:
            print(f"  {error}")
        print()
        print("👉 Configurez ces variables dans Render.com (onglet Environment)")
        return False, errors
    
    if warnings:
        print("⚠️  VALIDATION PARTIELLE (avec warnings)")
        print()
        print("Warnings:")
        for warning in warnings:
            print(f"  {warning}")
        print()
    else:
        print("✅ VALIDATION RÉUSSIE - Toutes les variables sont présentes!")
        print()
    
    print("=" * 70)
    return True, []


if __name__ == "__main__":
    success, errors = validate_environment()
    
    if not success:
        print("\n🚨 Le worker ne peut PAS démarrer avec cette configuration.")
        print("Corrigez les erreurs ci-dessus avant de continuer.\n")
        sys.exit(1)
    else:
        print("\n✅ Configuration valide - Le worker peut démarrer!\n")
        sys.exit(0)
