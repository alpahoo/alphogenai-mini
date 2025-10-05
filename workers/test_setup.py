"""
Script de vérification de la configuration AlphogenAI Mini
"""
import asyncio
import sys
from typing import Dict, Any

from .config import get_settings, Settings
from .supabase_client import SupabaseClient


def test_env_vars():
    """Vérifie que les variables d'environnement sont configurées"""
    print("\n" + "="*60)
    print("Test des variables d'environnement")
    print("="*60)
    
    try:
        settings = get_settings()
        
        required_vars = [
            ("SUPABASE_URL", settings.SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", settings.SUPABASE_SERVICE_KEY),
            ("QWEN_API_KEY", settings.QWEN_API_KEY),
            ("WAN_IMAGE_API_KEY", settings.WAN_IMAGE_API_KEY),
            ("PIKA_API_KEY", settings.PIKA_API_KEY),
            ("ELEVENLABS_API_KEY", settings.ELEVENLABS_API_KEY),
        ]
        
        all_set = True
        for name, value in required_vars:
            if not value or value.startswith("your-") or "xxxx" in value:
                print(f"❌ {name}: NON CONFIGURÉ ou placeholder")
                all_set = False
            else:
                masked = value[:10] + "..." if len(value) > 10 else value
                print(f"✅ {name}: {masked}")
        
        print("\nOptionnel:")
        print(f"   WEBHOOK_URL: {settings.WEBHOOK_URL or 'Non configuré'}")
        print(f"   REMOTION_RENDERER_URL: {settings.REMOTION_RENDERER_URL}")
        
        if all_set:
            print("\n✅ Toutes les variables requises sont configurées!")
            return True
        else:
            print("\n❌ Certaines variables sont manquantes.")
            print("Mettez à jour .env.local avec vos clés API.")
            return False
            
    except Exception as e:
        print(f"❌ Erreur de chargement: {str(e)}")
        return False


async def test_supabase_connection():
    """Test la connexion Supabase et la table jobs"""
    print("\n" + "="*60)
    print("Test de connexion Supabase")
    print("="*60)
    
    try:
        supabase = SupabaseClient()
        
        # Test table jobs existe
        result = supabase.client.table("jobs").select("id").limit(1).execute()
        print("✅ Table 'jobs' accessible")
        
        print("\n✅ Connexion Supabase réussie!")
        return True
        
    except Exception as e:
        print(f"❌ Connexion Supabase échouée: {str(e)}")
        print("\nAssurez-vous d'avoir exécuté la migration SQL:")
        print("  Fichier: supabase/migrations/20251004_alphogenai_jobs_table.sql")
        return False


async def test_create_test_job():
    """Test la création d'un job"""
    print("\n" + "="*60)
    print("Test de création de job")
    print("="*60)
    
    try:
        supabase = SupabaseClient()
        
        job_id = await supabase.create_job(
            user_id="test_user_id",
            prompt="Test de configuration AlphogenAI Mini"
        )
        
        print(f"✅ Job de test créé: {job_id}")
        
        # Récupérer le job
        job = await supabase.get_job(job_id)
        print(f"✅ Job de test récupéré: {job['status']}")
        
        # Nettoyer
        supabase.client.table("jobs").delete().eq("id", job_id).execute()
        print("✅ Job de test nettoyé")
        
        print("\n✅ Création et récupération de job fonctionnent!")
        return True
        
    except Exception as e:
        print(f"❌ Création de job échouée: {str(e)}")
        return False


def print_summary(results: Dict[str, bool]):
    """Affiche le résumé des tests"""
    print("\n" + "="*60)
    print("Résumé des tests")
    print("="*60)
    
    all_passed = all(results.values())
    
    for test_name, passed in results.items():
        status = "✅ PASSÉ" if passed else "❌ ÉCHOUÉ"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*60)
    
    if all_passed:
        print("🎉 Tous les tests sont passés ! Configuration prête.")
        print("\nProchaines étapes:")
        print("1. Démarrer le worker:")
        print("   python -m workers.worker")
        print("\n2. Créer un job de test:")
        print("   python -m workers.langgraph_orchestrator 'Votre prompt ici'")
    else:
        print("⚠️  Certains tests ont échoué. Corrigez les problèmes ci-dessus.")
        print("\nSolutions courantes:")
        print("- Mettez à jour .env.local avec des clés API valides")
        print("- Exécutez la migration SQL dans l'éditeur Supabase")
        print("- Vérifiez que la service key a les bonnes permissions")
    
    print("="*60 + "\n")
    
    return all_passed


async def main():
    """Lance tous les tests de configuration"""
    print("\n🔧 Vérification de la configuration AlphogenAI Mini\n")
    
    results = {}
    
    # Test 1: Variables d'environnement
    results["Variables d'environnement"] = test_env_vars()
    
    # Test 2: Connexion Supabase
    if results["Variables d'environnement"]:
        results["Connexion Supabase"] = await test_supabase_connection()
        
        # Test 3: Création de job
        if results["Connexion Supabase"]:
            results["Création de job"] = await test_create_test_job()
    
    # Résumé
    all_passed = print_summary(results)
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
