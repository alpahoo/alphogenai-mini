# Remotion - AlphogenAI Mini

Composition vidéo Remotion pour assembler les clips générés par le pipeline.

## 🎬 Composition

Le fichier `VideoComposition.tsx` assemble:

- **4 clips vidéo** (séquencés avec durées configurables)
- **Audio** (voix-off générée par ElevenLabs)
- **Watermark/Logo** (optionnel, coin supérieur droit)
- **Sous-titres SRT** (à implémenter)

## 📦 Installation

```bash
cd remotion
npm install
```

## 🚀 Utilisation

### Studio Remotion (prévisualisation)

```bash
npm start
```

Ouvre http://localhost:3000 pour prévisualiser et éditer la composition.

### Rendu local

```bash
npm run build
```

Génère la vidéo dans `out/video.mp4`.

### Rendu via API

```bash
# Avec paramètres personnalisés
npx remotion render AGM_Video out/video.mp4 \
  --props='{"clips":[{"url":"...","durationSec":4}],"audioUrl":"..."}'
```

## 🔧 Configuration

### Props de VideoComposition

```typescript
{
  clips: Array<{
    url: string;           // URL du clip vidéo
    durationSec: number;   // Durée en secondes
  }>;
  audioUrl: string;        // URL de l'audio
  srt?: string;           // Contenu SRT des sous-titres
  logoUrl?: string;       // URL du logo/watermark
  fps?: number;           // FPS (défaut: 30)
  width?: number;         // Largeur (défaut: 1080)
  height?: number;        // Hauteur (défaut: 1920)
  stretchTo?: number;     // Durée forcée par clip
}
```

### Exemple d'utilisation depuis Python

```python
import httpx
import json

async def render_with_remotion(clips, audio_url, srt_content):
    props = {
        "clips": clips,
        "audioUrl": audio_url,
        "srt": srt_content,
        "logoUrl": "https://example.com/logo.png",
        "fps": 30,
        "width": 1080,
        "height": 1920,
    }
    
    response = await httpx.post(
        "http://localhost:3000/render",
        json={
            "composition": "AGM_Video",
            "props": props
        }
    )
    
    return response.json()
```

## 🎨 Personnalisation

### Ajouter des effets de transition

Modifier `VideoComposition.tsx` pour ajouter des transitions entre clips:

```tsx
import { interpolate, useCurrentFrame } from "remotion";

const Transition: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1]);
  
  return <div style={{ opacity }}>{/* contenu */}</div>;
};
```

### Ajouter les sous-titres SRT

```tsx
import { parseSRT } from "./utils/srt-parser";

const Subtitles: React.FC<{ srt: string }> = ({ srt }) => {
  const frame = useCurrentFrame();
  const fps = useVideoConfig().fps;
  
  const currentTime = frame / fps;
  const subtitles = parseSRT(srt);
  const current = subtitles.find(
    s => currentTime >= s.start && currentTime <= s.end
  );
  
  if (!current) return null;
  
  return (
    <div style={{
      position: "absolute",
      bottom: 100,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 48,
      color: "white",
      textShadow: "2px 2px 4px black",
    }}>
      {current.text}
    </div>
  );
};
```

## 🌐 Déploiement

### Remotion Lambda (AWS)

```bash
# Setup
npx remotion lambda sites create

# Deploy
npx remotion lambda render AGM_Video \
  --props='{"clips":[...],"audioUrl":"..."}'
```

### Docker

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
```

## 📚 Ressources

- [Remotion Docs](https://www.remotion.dev/docs)
- [Remotion Lambda](https://www.remotion.dev/docs/lambda)
- [API Reference](https://www.remotion.dev/docs/api)

---

**Version:** 1.0.0  
**Dernière mise à jour:** 2025-10-04