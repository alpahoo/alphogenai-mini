# ✅ Migration vers l'API native DashScope Qwen

## 🎉 Changements effectués

Le worker AlphogenAI utilise maintenant l'**API native DashScope** au lieu de l'endpoint OpenAI-compatible.

### Modifications techniques

1. **Endpoint API changé** :
   - ❌ Ancien : `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
   - ✅ Nouveau : `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

2. **Format de requête adapté** :
   - Utilise le format natif DashScope avec `input.prompt` et `parameters`
   - Modèle : `qwen-plus`

3. **Parsing des scènes amélioré** :
   - Détecte `Scène`, `Scene`, `**Scène**` (markdown)
   - Plus robuste pour différents formats de réponse

4. **Configuration simplifiée** :
   - La variable `QWEN_API_BASE` n'est plus nécessaire (hardcodée dans le code)
   - Seule `QWEN_API_KEY` est requise

## 📋 Variables d'environnement requises

Dans Railway/Render, assurez-vous d'avoir :

```bash
QWEN_API_KEY=sk-519c95b9a8694a59b80aa9c9ef466e51
```

**Note** : Vous pouvez supprimer `QWEN_API_BASE` si elle est définie, elle n'est plus utilisée.

## 🚀 Déploiement

Les changements sont déjà poussés sur `main`. 

### Railway
- Le worker devrait se redéployer automatiquement
- Vérifiez les logs après 1-2 minutes

### Render
- Push ce commit sur votre branche `main`
- Le worker se redéploiera automatiquement

## ✅ Test

Votre clé API a été testée avec succès :

```bash
✅ API native DashScope : 200 OK
✅ Génération de script fonctionnelle
```

## 📝 Prochaines étapes

1. **Attendez 2 minutes** que le worker se redéploie
2. **Créez un nouveau job** depuis votre frontend
3. **Vérifiez les logs** - vous devriez voir :
   ```
   [Qwen] Génération du script pour job ...
   [Qwen] API Base: https://dashscope-intl.aliyuncs.com/api/v1
   [Qwen] API Key configured: True
   [Qwen] ✓ Script généré: 4 scènes
   ```

## 🐛 Dépannage

Si ça ne fonctionne toujours pas :

1. Vérifiez que `QWEN_API_KEY` est bien définie dans Railway/Render
2. Vérifiez que le worker a bien redémarré (check les logs)
3. Envoyez-moi les nouveaux logs pour diagnostic

---

**Commits effectués** :
- `d1187e4` - feat: Switch Qwen to native DashScope API
- `ad0b9ed` - docs: Update render.yaml for native DashScope API
- `64ff34f` - fix: Correct render.yaml indentation
