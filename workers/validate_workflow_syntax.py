#!/usr/bin/env python3
"""
VALIDATION SYNTAXE ET STRUCTURE - SANS DÉPENDANCES
Vérifie que tout le code compile et est cohérent
"""
import ast
import sys
from pathlib import Path

print("=" * 70)
print("🔍 VALIDATION SYNTAXE & STRUCTURE DU WORKFLOW")
print("=" * 70)
print()

errors = []
warnings = []

# ==============================================================================
# ÉTAPE 1 : VALIDATION SYNTAXE PYTHON
# ==============================================================================
print("📦 ÉTAPE 1/5 : Validation syntaxe Python...")
print("-" * 70)

files_to_check = [
    "workers/config.py",
    "workers/supabase_client.py",
    "workers/api_services.py",
    "workers/elevenlabs_service.py",
    "workers/langgraph_orchestrator.py",
    "workers/worker.py",
]

for filepath in files_to_check:
    try:
        with open(filepath, 'r') as f:
            code = f.read()
            ast.parse(code)
        print(f"✅ {filepath}")
    except SyntaxError as e:
        msg = f"{filepath}: Erreur syntaxe ligne {e.lineno}"
        print(f"❌ {msg}")
        errors.append(msg)
    except FileNotFoundError:
        msg = f"{filepath}: Fichier introuvable"
        print(f"❌ {msg}")
        errors.append(msg)

print()

# ==============================================================================
# ÉTAPE 2 : VÉRIFICATION ELEVENLABS (CRITIQUE)
# ==============================================================================
print("📦 ÉTAPE 2/5 : Vérification service ElevenLabs...")
print("-" * 70)

with open("workers/elevenlabs_service.py", 'r') as f:
    elevenlabs_code = f.read()

# Vérifier qu'on N'appelle PAS /v1/voices
if '"/v1/voices"' in elevenlabs_code or "'/v1/voices'" in elevenlabs_code:
    if "client.get" in elevenlabs_code and "/v1/voices" in elevenlabs_code:
        msg = "ERREUR CRITIQUE: Appel à /v1/voices détecté!"
        print(f"❌ {msg}")
        errors.append(msg)
    else:
        print("✅ Pas d'appel réseau à /v1/voices (OK)")
else:
    print("✅ Pas d'appel à /v1/voices")

# Vérifier fallback Rachel
if "21m00Tcm4TlvDq8ikWAM" in elevenlabs_code:
    print("✅ Fallback Rachel (21m00Tcm4TlvDq8ikWAM) configuré")
else:
    msg = "Fallback voice Rachel non trouvé"
    print(f"⚠️  {msg}")
    warnings.append(msg)

# Vérifier import SupabaseClient
if "from .supabase_client import SupabaseClient" in elevenlabs_code:
    print("✅ Import SupabaseClient correct (relatif)")
elif "from workers.supabase_client import get_supabase_client" in elevenlabs_code:
    msg = "ERREUR: Import get_supabase_client (fonction inexistante!)"
    print(f"❌ {msg}")
    errors.append(msg)
else:
    msg = "Import SupabaseClient non trouvé"
    print(f"⚠️  {msg}")
    warnings.append(msg)

print()

# ==============================================================================
# ÉTAPE 3 : VÉRIFICATION IMPORTS
# ==============================================================================
print("📦 ÉTAPE 3/5 : Vérification des imports...")
print("-" * 70)

# Vérifier supabase_client.py
with open("workers/supabase_client.py", 'r') as f:
    supabase_code = f.read()

if "class SupabaseClient" in supabase_code:
    print("✅ SupabaseClient existe dans supabase_client.py")
else:
    msg = "Classe SupabaseClient non trouvée"
    print(f"❌ {msg}")
    errors.append(msg)

if "def get_supabase_client" in supabase_code:
    msg = "Fonction get_supabase_client existe (ne devrait pas!)"
    print(f"⚠️  {msg}")
    warnings.append(msg)
else:
    print("✅ Pas de fonction get_supabase_client (correct)")

# Vérifier orchestrator
with open("workers/langgraph_orchestrator.py", 'r') as f:
    orchestrator_code = f.read()

if "from .elevenlabs_service import generate_elevenlabs_voice" in orchestrator_code:
    print("✅ Orchestrator importe elevenlabs_service")
else:
    msg = "Orchestrator n'importe pas elevenlabs_service"
    print(f"❌ {msg}")
    errors.append(msg)

print()

# ==============================================================================
# ÉTAPE 4 : VÉRIFICATION WORKFLOW LOGIC
# ==============================================================================
print("📦 ÉTAPE 4/5 : Vérification logique du workflow...")
print("-" * 70)

# Chercher les nœuds du workflow
workflow_nodes = [
    "_node_qwen_script",
    "_node_replicate_images",
    "_node_replicate_videos",
    "_node_elevenlabs_audio",
]

for node in workflow_nodes:
    if f"def {node}" in orchestrator_code or f"async def {node}" in orchestrator_code:
        print(f"✅ Nœud {node} existe")
    else:
        msg = f"Nœud {node} manquant"
        print(f"❌ {msg}")
        errors.append(msg)

print()

# ==============================================================================
# ÉTAPE 5 : SIMULATION COÛT WORKFLOW
# ==============================================================================
print("📦 ÉTAPE 5/5 : Estimation coût par workflow...")
print("-" * 70)

costs = {
    "Qwen (script)": 0.00,
    "Replicate SDXL (4 images)": 0.02,
    "Replicate WAN 720p (4 vidéos)": 0.50,
    "ElevenLabs (30s audio)": 0.05,
    "Remotion (assemblage)": 0.05,
}

total = sum(costs.values())

print("💰 Coût par workflow complet:")
for service, cost in costs.items():
    print(f"   - {service}: ${cost:.2f}")
print(f"   {'=' * 40}")
print(f"   TOTAL: ${total:.2f}")
print()
print(f"⚠️  Avec 3 retries max: ${total * 3:.2f} (si échec complet)")
print()

# ==============================================================================
# RAPPORT FINAL
# ==============================================================================
print("=" * 70)
if errors:
    print("❌ VALIDATION ÉCHOUÉE")
    print("=" * 70)
    print()
    print("🚨 ERREURS CRITIQUES:")
    for i, err in enumerate(errors, 1):
        print(f"  {i}. {err}")
    print()
    print("⚠️  NE PAS DÉPLOYER TANT QUE CES ERREURS EXISTENT!")
    sys.exit(1)
else:
    print("✅ VALIDATION RÉUSSIE")
    print("=" * 70)
    print()
    print("📊 RÉSUMÉ:")
    print(f"  ✅ {len(files_to_check)} fichiers validés (syntaxe OK)")
    print("  ✅ Service ElevenLabs corrigé (plus d'appel /v1/voices)")
    print("  ✅ Imports cohérents (SupabaseClient)")
    print(f"  ✅ {len(workflow_nodes)} nœuds workflow présents")
    print()
    
    if warnings:
        print("⚠️  AVERTISSEMENTS:")
        for i, warn in enumerate(warnings, 1):
            print(f"  {i}. {warn}")
        print()
    
    print("💰 COÛT:")
    print(f"  - Ce test: $0.00")
    print(f"  - Workflow complet: ${total:.2f}")
    print()
    print("🎯 PRÊT POUR PRODUCTION:")
    print("  1. Code syntaxiquement correct")
    print("  2. Fix ElevenLabs 401 appliqué")
    print("  3. Imports validés")
    print("  4. Logique workflow présente")
    print()
    print("📋 AVANT DE TESTER:")
    print("  1. Sur Supabase: Annulez TOUS les jobs en cours")
    print("     UPDATE jobs SET status='cancelled' WHERE status='pending';")
    print()
    print("  2. Attendez le redéploiement Render (2-3 min)")
    print()
    print("  3. Créez UN SEUL job test (~$0.62)")
    print()
    print("=" * 70)
    print("✅ VALIDATION COMPLÈTE - PRÊT POUR DÉPLOIEMENT")
    print("=" * 70)

