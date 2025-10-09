# 🐛 FIX: Python 3.13 Compatibility

## Problème détecté

```
ModuleNotFoundError: No module named 'pyaudioop'
RuntimeError: pydub n'est pas installé
```

**Cause** : Render utilise Python 3.13 qui a **supprimé le module `audioop`** (déprécié depuis Python 3.11). `pydub` dépend de ce module.

---

## ✅ Solution implémentée

### Remplacement de pydub par ffmpeg direct

**Avant** (pydub) :
```python
from pydub import AudioSegment
segment = AudioSegment.from_file(io.BytesIO(mp3_bytes), format="mp3")
combined += segment
```

**Après** (ffmpeg subprocess) :
```python
import subprocess
import tempfile

# Sauver chunks en fichiers temp
temp_file = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
temp_file.write(mp3_bytes)

# Concaténer avec ffmpeg
subprocess.run([
    "ffmpeg", "-f", "concat", "-safe", "0", 
    "-i", list_file.name, "-c", "copy", output_file.name
])
```

---

## 📋 Avantages

✅ **Python 3.13 compatible** : Pas de dépendance sur audioop  
✅ **Pas de dépendances Python** : Utilise ffmpeg système  
✅ **Plus robuste** : Outil mature et stable  
✅ **Déjà disponible** : ffmpeg pré-installé sur Render  
✅ **Meilleure précision** : ffprobe pour durées exactes  

---

## 🔧 Fonctionnalités conservées

✅ Chunking automatique (> 2200 chars)  
✅ Concaténation MP3  
✅ Génération SRT par phrase  
✅ Fallback voice_id  
✅ Upload Supabase Storage  
✅ Endpoint correct `/v1/text-to-speech/{voice_id}`  

---

## 🚀 Déploiement

**Commit** : Poussé sur `main`

**Action** : Render va auto-déployer (Auto-Deploy peut être réactivé maintenant)

**Logs attendus** :
```
✅ VALIDATION RÉUSSIE
🎬 AlphogenAI Mini Worker
En attente de jobs...
```

**Pas de** :
- ❌ `ModuleNotFoundError: pyaudioop`
- ❌ `RuntimeError: pydub n'est pas installé`

---

## 🧪 Test

Une fois déployé :

1. **Vérifiez** : "En attente de jobs..." (pas de Signal 15)
2. **Créez** : UN nouveau job test
3. **Attendez** : Workflow complet
4. **Coût** : ~$0.62

---

## 📊 Différences techniques

| Aspect | pydub | ffmpeg subprocess |
|--------|-------|-------------------|
| Python 3.13 | ❌ Incompatible | ✅ Compatible |
| Dépendances | audioop (supprimé) | Aucune (Python std) |
| Performance | RAM (tout en mémoire) | Fichiers temp (+ efficace) |
| Précision durée | Estimation | ffprobe exact |
| Robustesse | Peut crasher | Fallback intégré |

---

## ⏭️ Prochaine étape

**Attendez 2-3 minutes** que Render redéploie automatiquement, puis testez avec un nouveau job.

