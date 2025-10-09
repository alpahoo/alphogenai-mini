#!/bin/bash
# Script d'installation pour Render (si ffmpeg manque)
# À ajouter dans Render Settings > Build Command

# Install ffmpeg si nécessaire
if ! command -v ffmpeg &> /dev/null; then
    echo "📦 Installation de ffmpeg..."
    apt-get update -qq && apt-get install -y -qq ffmpeg
    echo "✅ ffmpeg installé"
else
    echo "✅ ffmpeg déjà disponible"
fi
