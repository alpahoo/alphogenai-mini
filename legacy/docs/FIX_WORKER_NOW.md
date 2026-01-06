# 🚨 CORRECTION RAPIDE - Worker qui plante

## Problème
```
Could not find the 'updated_at' column of 'jobs' in the schema cache
Could not find the 'error_message' column of 'jobs' in the schema cache
```

## ✅ Solution (2 minutes)

### Étape 1: Ouvrir Supabase SQL Editor

1. Aller sur https://app.supabase.com
2. Sélectionner votre projet
3. Cliquer sur **"SQL Editor"** dans le menu de gauche
4. Cliquer sur **"New Query"**

### Étape 2: Copier-coller ce SQL

Copier **TOUT** le code ci-dessous et le coller dans l'éditeur SQL :

```sql
-- Ajouter error_message
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Ajouter updated_at
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ajouter current_stage
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS current_stage TEXT;

-- Ajouter retry_count
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Ajouter app_state
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS app_state JSONB DEFAULT '{}'::jsonb;

-- Créer la fonction de mise à jour automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Mettre à jour les jobs existants
UPDATE public.jobs SET updated_at = created_at WHERE updated_at IS NULL;
```

### Étape 3: Exécuter

Cliquer sur **"Run"** ou appuyer sur **Ctrl+Enter**

### Étape 4: Redémarrer le worker

Sur **Railway** :
- Le worker se redémarrera automatiquement en quelques secondes

Sur **Render** :
- Aller dans votre service worker
- Cliquer sur **"Manual Deploy"** → **"Deploy latest commit"**

---

## ✅ Vérifier que ça marche

1. **Vérifier les colonnes** :
   - Aller dans "Table Editor" → "jobs"
   - Vous devriez voir les nouvelles colonnes

2. **Vérifier les logs du worker** :
   - Railway : Onglet "Logs"
   - Render : Onglet "Logs"
   - Vous ne devriez **PLUS voir** l'erreur "Could not find the column"

3. **Tester une génération** :
   - Créer une nouvelle vidéo depuis votre frontend
   - Le job devrait passer de `pending` à `in_progress`

---

## 🎯 Résultat attendu

Dans les logs du worker, vous devriez maintenant voir :

```
============================================================
🎬 AlphogenAI Mini Worker
============================================================
En attente de jobs...

============================================================
🎬 Traitement du job: xxx-xxx-xxx
Prompt: Explique la photosynthèse...
============================================================

[Node qwen_script] Starting...
[Node qwen_script] Generated script with 4 scenes
[Node wan_image] Starting...
...
```

**Au lieu de** :
```
❌ Job échoué avec exception: Could not find the 'updated_at' column
```

---

## 📚 Documentation complète

Pour plus de détails, voir `supabase/APPLY_MIGRATIONS.md`
