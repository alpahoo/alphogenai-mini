> ⚠️ **ARCHIVED / LEGACY**
>
> Ce document concerne ElevenLabs (pipeline historique).
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# 🎙️ ELEVENLABS SERVICE - UPGRADE COMPLET

## ✅ Changements implémentés

### 1️⃣ Nouveau service robuste (`workers/elevenlabs_service.py`)

**Fonctionnalités** :
- ✅ **Chunking automatique** : Textes longs (> 2200 chars) découpés automatiquement
- ✅ **Concaténation MP3** : Chunks réassemblés avec silence entre eux (120ms)
- ✅ **Génération SRT** : Sous-titres par phrase avec timecodes précis
- ✅ **Fallback voice_id** : Si ELEVENLABS_VOICE_ID absent, prend la 1ère voix dispo via API
- ✅ **Upload Supabase** : MP3 stocké dans `assets/audio/{timestamp}-{hash}.mp3`
- ✅ **URL correcte** : `/v1/text-to-speech/{voice_id}` avec `model_id` dans le body

**Signature rétro-compatible** :
```python
async def generate_elevenlabs_voice(
    text: str,
    *,
    language: str = "fr",
    voice_id: Optional[str] = None,      # Nouveau ! Supporte le paramètre
    model_id: Optional[str] = None,
    voice_settings: Optional[Dict] = None,
) -> Dict:
    # Returns: {"audio_url": str, "srt": str, "duration": float}
```

### 2️⃣ Intégration dans l'orchestrateur

**Changement** :
```python
# Avant (api_services.py)
from .api_services import generate_elevenlabs_voice

# Après (elevenlabs_service.py)
from .elevenlabs_service import generate_elevenlabs_voice
```

**Aucune modification nécessaire** dans les appels existants ! Le paramètre `voice_id` est maintenant supporté ET optionnel.

### 3️⃣ Dépendances ajoutées

```
pydub==0.25.1  # Pour concaténation MP3
```

**Note** : `pydub` nécessite `ffmpeg`. Sur Render, il est généralement disponible par défaut.

---

## 🔧 Configuration (Variables d'environnement)

### Obligatoire
```bash
ELEVENLABS_API_KEY=sk_...
```

### Optionnel (avec fallbacks intelligents)
```bash
ELEVENLABS_VOICE_ID=              # Si vide, prend la 1ère voix dispo
ELEVENLABS_MODEL_ID=eleven_multilingual_v2  # Défaut
ELEVENLABS_CHUNK_MAX_CHARS=2200   # Max chars par chunk
ELEVENLABS_CHUNK_PAUSE_MS=120     # Silence entre chunks (ms)
```

---

## 🧪 Workflow attendu

```
[ElevenLabs] Génération audio...
[ElevenLabs] Texte: 3793 caractères
[ElevenLabs] Modèle: eleven_multilingual_v2
[ElevenLabs] Voice ID: pNInz6obpgDQGcFmaJgB  (ou fallback)
[ElevenLabs] 2 chunk(s) à générer
[ElevenLabs] Chunk 1/2 (2190 chars)...
[ElevenLabs] Chunk 2/2 (1603 chars)...
[ElevenLabs] Audio généré: 45.2s
[ElevenLabs] Upload vers Supabase Storage: audio/1696789123-4567890.mp3
[ElevenLabs] ✓ Audio uploadé: https://qbrpzmuedfugbhoeytdj.supabase.co/storage/v1/object/public/assets/audio/...
```

---

## 🐛 Bugs corrigés

### ❌ Avant
```
[ElevenLabs] ✗ Erreur: TypeError: generate_elevenlabs_voice() 
got an unexpected keyword argument 'voice_id'
```

**Cause** : Ancienne fonction ne supportait pas `voice_id` en paramètre.

### ✅ Après
```python
audio_result = await generate_elevenlabs_voice(
    text=full_narration,
    language="fr",
    voice_id=VOICE_ID or None,  # ✅ Maintenant supporté !
)
```

---

## 💰 Coûts

**ElevenLabs API** :
- ~$0.05 pour 30s de voix
- Chunking transparent (pas de surcoût)

**Supabase Storage** :
- Gratuit jusqu'à 1 GB
- 1 vidéo (~40s audio) = ~400 KB

---

## 🚀 Bonus implémentés

✅ **Logs détaillés** : Chaque chunk loggé avec progression  
✅ **Robustesse** : Fallback data: URL si upload Supabase échoue  
✅ **SRT précis** : Timeline par phrase avec ms exacts  
✅ **Silence intelligent** : Jonctions propres entre chunks  

---

## 📋 TODO (idées pour plus tard)

- [ ] Limiter texte à 8000 chars max (éviter coûts excessifs)
- [ ] Exposer `voice_settings.stability` dans UI (slider 0-1)
- [ ] Pré-écoute voix : endpoint `/voices` pour lister voix curées
- [ ] Cache audio par `prompt_hash` (éviter régénération)

