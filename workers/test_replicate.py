#!/usr/bin/env python3
"""
Test simple de génération d'image Replicate
"""
import os
import sys

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workers.api_services import generate_image_with_replicate

def test_image_generation():
    """Test unitaire basique"""
    print("🧪 Test de génération d'image Replicate...")
    print()
    
    # Vérifier le token
    token = os.getenv("REPLICATE_API_TOKEN")
    if not token:
        print("❌ REPLICATE_API_TOKEN manquant")
        return False
    
    print(f"✅ Token présent: {token[:15]}...")
    print()
    
    try:
        prompt = "A cute robot in a classroom, 16:9, cinematic"
        print(f"📝 Prompt: {prompt}")
        print()
        
        url = generate_image_with_replicate(
            prompt,
            width=1280,
            height=720,
            seed=42
        )
        
        print(f"✅ URL générée: {url}")
        print()
        
        # Vérifier que c'est une URL valide
        if not url.startswith("http"):
            print(f"❌ URL invalide (ne commence pas par http): {url}")
            return False
        
        print("✅ Test réussi!")
        return True
        
    except Exception as e:
        print(f"❌ Erreur: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_image_generation()
    sys.exit(0 if success else 1)
