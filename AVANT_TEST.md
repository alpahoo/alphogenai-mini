> ⚠️ **ARCHIVED / LEGACY (checklist historique)**
>
> Cette checklist correspond à une phase antérieure du projet.
> Référence canonique: `STATUS.txt` + `QUICK_START.md`.

# ✅ PRÊT POUR TEST - CHECKLIST

## 🔍 Code vérifié

✅ Syntaxe Python validée
✅ `render_with_remotion` existe (ligne 872)
✅ `generate_elevenlabs_voice` refactorisé
✅ `ReplicateSDService` (SDXL)
✅ `ReplicateWANVideoService` (WAN i2v-720p)
✅ Imports validés

## ⏳ Prochaines étapes

1. **Render va redéployer** (2-3 min)
2. **Worker va démarrer**
3. **Logs attendus** :
   ```
   ✅ VALIDATION RÉUSSIE
   🎬 AlphogenAI Mini Worker
   Démarré: 2025-10-07T23:XX:XX  ← Nouveau timestamp
   En attente de jobs...
   ```

## 🧪 Workflow attendu

Quand vous créerez un job, vous devriez voir :

```
[Qwen] ✓ Script généré: 4 scènes
[Replicate Images] ✓ 4 images SDXL générées
[Replicate Videos] ✓ 4 vidéos WAN 720p générées
[ElevenLabs] ✓ Audio généré avec Rachel (voix par défaut)
[Remotion] ✓ Vidéo finale assemblée
✅ Workflow terminé
```

## 💰 Coût d'un test complet

- SDXL (4 images) : ~$0.02
- WAN i2v (4 vidéos) : ~$0.50
- ElevenLabs : ~$0.05
- Remotion : ~$0.05
- **Total : ~$0.62**

## ⚠️ Ne testez QUE quand le worker affiche "En attente de jobs..."

