#!/bin/bash
# Script pour démarrer le worker AlphogenAI Mini dans Docker

set -e

echo "🎬 Démarrage du Worker AlphogenAI Mini (Docker)"
echo "================================================"

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé. Installez Docker d'abord."
    exit 1
fi

# Vérifier que le fichier .env.local existe
if [ ! -f "../.env.local" ] && [ ! -f ".env.local" ]; then
    echo "❌ Fichier .env.local introuvable."
    echo "Créez un fichier .env.local avec vos variables d'environnement."
    echo "Voir .env.example pour un modèle."
    exit 1
fi

# Construire l'image
echo "📦 Construction de l'image Docker..."
docker build -f ../Dockerfile.worker -t alphogenai-worker:latest ..

# Arrêter et supprimer le container existant si présent
if [ "$(docker ps -aq -f name=alphogenai-worker)" ]; then
    echo "🛑 Arrêt du container existant..."
    docker stop alphogenai-worker 2>/dev/null || true
    docker rm alphogenai-worker 2>/dev/null || true
fi

# Démarrer le container
echo "🚀 Démarrage du worker..."
docker run -d \
    --name alphogenai-worker \
    --env-file ../.env.local \
    --restart unless-stopped \
    alphogenai-worker:latest

echo ""
echo "✅ Worker démarré avec succès!"
echo ""
echo "📊 Commandes utiles:"
echo "  - Voir les logs:    docker logs -f alphogenai-worker"
echo "  - Arrêter:          docker stop alphogenai-worker"
echo "  - Redémarrer:       docker restart alphogenai-worker"
echo "  - Supprimer:        docker rm -f alphogenai-worker"
echo ""
echo "📺 Affichage des logs (Ctrl+C pour quitter):"
echo ""

# Suivre les logs
docker logs -f alphogenai-worker
