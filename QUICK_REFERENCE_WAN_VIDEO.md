# 🚀 WAN Video - Référence Rapide

## Configuration (`.env.local`)

```bash
DASHSCOPE_API_KEY=sk-your-api-key-here
VIDEO_ENGINE=wan
```

## Utilisation

### Dans le code Python

```python
from workers.api_services import generate_video_clip

# Générer un clip avec WAN Video
result = await generate_video_clip(
    engine="wan",
    prompt="Un robot explique la lune à un enfant"
)
# Returns: {"engine": "wan", "video_url": "...", "duration": 6}
```

### Via l'orchestrateur (automatique)

Le worker lit `VIDEO_ENGINE` depuis la config et utilise automatiquement le bon moteur.

### Changer de moteur

```bash
VIDEO_ENGINE=wan    # WAN Video (DashScope) - défaut
VIDEO_ENGINE=pika   # Pika (avec --image + seed)
VIDEO_ENGINE=stills # Images fixes
```

## API DashScope

**Endpoint:** `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2video/generation`  
**Model:** `wanx-v1`  
**Polling:** Toutes les 5s, max 10 minutes

## Fichiers Modifiés

- ✅ `workers/config.py` - Config DASHSCOPE_API_KEY
- ✅ `workers/api_services.py` - WANVideoService + router
- ✅ `workers/langgraph_orchestrator.py` - Utilise generate_video_clip()
- ✅ `.env.local` - Variables d'environnement

## Test

```bash
python3 test_wan_video_simple.py
```

## Documentation Complète

Voir `WAN_VIDEO_INTEGRATION.md`
