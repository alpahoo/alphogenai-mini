# 🔍 DIAGNOSTIC RENDER - COMMENT VÉRIFIER

## 1. Vérifier les logs complets

Dans Render Dashboard → Votre service → **Logs** :

1. Scrollez tout en BAS
2. Cherchez la ligne APRÈS `22:27:13 ==> Running 'python -m workers.worker'`
3. Y a-t-il du texte après ? Copiez TOUT

## 2. Vérifier le statut du service

Dans Render Dashboard → Votre service :

- Status: **Active** (vert) ou **Failed** (rouge) ?
- Events: Dernier événement "Deploy succeeded" ou "Deploy failed" ?

## 3. Créer un job test

Allez sur https://nextjs-with-supabase-l5zv.vercel.app/generate

Créez un nouveau job :
```
Prompt: "Test système solaire"
Audio: Voice
```

Retournez sur les logs Render :
- Voyez-vous apparaître `🎬 Traitement du job: ...` ?
- Ou rien ne change ?

## 4. Forcer un refresh des logs

Dans Render Dashboard :
- Cliquez sur "Logs"
- Appuyez sur F5 (refresh)
- Scrollez en bas

## 5. Vérifier les métriques

Dans Render Dashboard → Metrics :
- CPU usage > 0% ?
- Memory usage > 0% ?

Si CPU/Memory = 0%, le worker est probablement crashé.

---

**Faites ces 5 checks et dites-moi ce que vous voyez !**
