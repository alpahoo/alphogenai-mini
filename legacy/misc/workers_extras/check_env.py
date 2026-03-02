#!/usr/bin/env python3
"""
Script pour vérifier que toutes les variables d'environnement requises sont définies
"""
import os
import sys
from typing import List, Tuple

# Variables d'environnement requises
REQUIRED_VARS = [
    "SUPABASE_URL",
    "QWEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "ELEVENLABS_API_KEY",
]

# Variables d'environnement requises (au moins une)
REQUIRED_ONE_OF = [
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"],
    ["REMOTION_SITE_ID", "REMOTION_RENDERER_URL"],
]

# Variables optionnelles mais recommandées
OPTIONAL_VARS = [
    "WAN_IMAGE_API_KEY",
    "PIKA_API_KEY",
    "REMOTION_SECRET_KEY",
    "VIDEO_ENGINE",
]


def check_env_vars() -> Tuple[bool, List[str]]:
    """Vérifie les variables d'environnement"""
    missing = []
    warnings = []
    
    print("🔍 Vérification des variables d'environnement")
    print("=" * 60)
    
    # Vérifier les variables requises
    print("\n✅ Variables requises:")
    for var in REQUIRED_VARS:
        value = os.getenv(var)
        if value:
            # Masquer partiellement la valeur
            masked = value[:8] + "..." if len(value) > 8 else "***"
            print(f"  ✓ {var}: {masked}")
        else:
            print(f"  ✗ {var}: MANQUANT")
            missing.append(var)
    
    # Vérifier les variables "au moins une de"
    print("\n✅ Variables requises (au moins une):")
    for group in REQUIRED_ONE_OF:
        found = False
        for var in group:
            value = os.getenv(var)
            if value:
                masked = value[:8] + "..." if len(value) > 8 else "***"
                print(f"  ✓ {var}: {masked}")
                found = True
                break
        
        if not found:
            print(f"  ✗ Aucune de ces variables n'est définie: {', '.join(group)}")
            missing.extend(group)
    
    # Vérifier les variables optionnelles
    print("\n⚠️  Variables optionnelles:")
    for var in OPTIONAL_VARS:
        value = os.getenv(var)
        if value:
            masked = value[:8] + "..." if len(value) > 8 else "***"
            print(f"  ✓ {var}: {masked}")
        else:
            print(f"  - {var}: non défini")
            warnings.append(var)
    
    # Vérifier VIDEO_ENGINE
    video_engine = os.getenv("VIDEO_ENGINE", "wan")
    print(f"\n🎬 Moteur vidéo configuré: {video_engine}")
    
    if video_engine == "pika" and not os.getenv("PIKA_API_KEY"):
        print("  ⚠️  VIDEO_ENGINE=pika mais PIKA_API_KEY n'est pas défini")
        warnings.append("PIKA_API_KEY (requis pour VIDEO_ENGINE=pika)")
    
    # Résumé
    print("\n" + "=" * 60)
    if not missing:
        print("✅ Toutes les variables requises sont définies!")
        if warnings:
            print(f"⚠️  {len(warnings)} variable(s) optionnelle(s) manquante(s)")
        return True, []
    else:
        print(f"❌ {len(missing)} variable(s) requise(s) manquante(s)")
        return False, missing


def print_help(missing: List[str]):
    """Affiche l'aide pour configurer les variables manquantes"""
    print("\n📝 Pour configurer les variables manquantes:")
    print("\n1. Créez un fichier .env.local à la racine du projet")
    print("2. Ajoutez les variables suivantes:\n")
    
    for var in set(missing):
        print(f"   {var}=your_value_here")
    
    print("\n3. Pour obtenir les clés API:")
    print("   - Supabase: https://app.supabase.com/project/_/settings/api")
    print("   - Qwen: https://dashscope.console.aliyun.com/")
    print("   - DashScope (WAN Video): https://dashscope.console.aliyun.com/")
    print("   - ElevenLabs: https://elevenlabs.io/app/settings/api-keys")
    print("   - Remotion: https://remotion.pro/dashboard")
    
    print("\n4. Voir .env.example pour un modèle complet")


def main():
    """Point d'entrée principal"""
    print("🎬 AlphogenAI Mini - Vérification de la configuration")
    print()
    
    success, missing = check_env_vars()
    
    if not success:
        print_help(missing)
        sys.exit(1)
    
    print("\n🚀 Configuration valide! Vous pouvez démarrer le worker.")
    sys.exit(0)


if __name__ == "__main__":
    main()
