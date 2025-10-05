# 🔧 Appliquer les migrations Supabase

## Problème actuel

Le worker échoue avec l'erreur :
```
Could not find the 'updated_at' column of 'jobs' in the schema cache
Could not find the 'error_message' column of 'jobs' in the schema cache
```

**Cause** : La table `jobs` n'a pas les colonnes nécessaires au worker Python.

---

## ✅ Solution Rapide (5 minutes)

### Option 1: Via l'interface Supabase (Recommandé)

1. **Aller sur Supabase Dashboard**
   - https://app.supabase.com/project/YOUR_PROJECT/editor

2. **Ouvrir le SQL Editor**
   - Cliquer sur "SQL Editor" dans la barre latérale
   - Cliquer sur "New Query"

3. **Copier-coller ce SQL** :

```sql
-- Migration pour corriger la table jobs si les colonnes manquent
-- Cette migration est idempotente (peut être exécutée plusieurs fois sans erreur)

-- Ajouter la colonne error_message si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'error_message'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN error_message TEXT;
        COMMENT ON COLUMN public.jobs.error_message IS 'Error message if job failed';
    END IF;
END $$;

-- Ajouter la colonne updated_at si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        COMMENT ON COLUMN public.jobs.updated_at IS 'Timestamp of last update';
    END IF;
END $$;

-- Ajouter la colonne current_stage si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'current_stage'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN current_stage TEXT;
        COMMENT ON COLUMN public.jobs.current_stage IS 'Current pipeline stage: qwen, wan_image, pika, elevenlabs, remotion';
    END IF;
END $$;

-- Ajouter la colonne retry_count si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN retry_count INTEGER DEFAULT 0;
        COMMENT ON COLUMN public.jobs.retry_count IS 'Number of retry attempts';
    END IF;
END $$;

-- Ajouter la colonne app_state si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'app_state'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN app_state JSONB NOT NULL DEFAULT '{}'::jsonb;
        COMMENT ON COLUMN public.jobs.app_state IS 'Complete LangGraph workflow state (JSON)';
    END IF;
END $$;

-- Créer ou remplacer la fonction de mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger si il n'existe pas déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_jobs_updated_at'
    ) THEN
        CREATE TRIGGER update_jobs_updated_at
            BEFORE UPDATE ON public.jobs
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Mettre à jour updated_at pour tous les jobs existants
UPDATE public.jobs SET updated_at = created_at WHERE updated_at IS NULL;
```

4. **Exécuter le script**
   - Cliquer sur "Run" (ou Ctrl+Enter)
   - Vous devriez voir un message de succès

5. **Vérifier les colonnes**
   - Aller dans "Table Editor" → "jobs"
   - Vous devriez maintenant voir les colonnes : `error_message`, `updated_at`, `current_stage`, `retry_count`, `app_state`

---

### Option 2: Via Supabase CLI

Si vous avez le CLI Supabase installé :

```bash
# Se connecter à votre projet
supabase link --project-ref YOUR_PROJECT_REF

# Appliquer la migration
supabase db push

# Ou exécuter directement le fichier
psql $DATABASE_URL < supabase/migrations/20251005_fix_jobs_table.sql
```

---

### Option 3: Via psql (ligne de commande)

```bash
# Récupérer votre DATABASE_URL depuis Supabase Dashboard
# Settings → Database → Connection string

psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres" \
  -f supabase/migrations/20251005_fix_jobs_table.sql
```

---

## 🔍 Vérifier que ça a marché

### Dans Supabase Dashboard :

1. Aller sur "Table Editor" → "jobs"
2. Vérifier que ces colonnes existent :
   - ✅ `error_message` (text)
   - ✅ `updated_at` (timestamptz)
   - ✅ `current_stage` (text)
   - ✅ `retry_count` (integer)
   - ✅ `app_state` (jsonb)

### Via SQL :

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND table_schema = 'public'
ORDER BY ordinal_position;
```

---

## 🚀 Après la migration

1. **Redémarrer le worker** sur Railway/Render
   - Railway : Le worker se redémarrera automatiquement
   - Render : Cliquer sur "Manual Deploy" → "Clear build cache & deploy"

2. **Tester la génération** :
   - Aller sur votre frontend
   - Créer une nouvelle vidéo
   - Le worker devrait maintenant traiter le job sans erreur

3. **Vérifier les logs** :
   - Vous devriez voir : "🎬 Traitement du job..."
   - Puis les différentes étapes : qwen_script, wan_image, etc.

---

## 🎯 Structure finale de la table `jobs`

Après la migration, votre table aura :

```
jobs
├── id (uuid, primary key)
├── user_id (uuid, foreign key)
├── prompt (text)
├── status (text) - pending, in_progress, done, failed, cancelled
├── app_state (jsonb) - État complet LangGraph
├── current_stage (text) - Étape actuelle
├── error_message (text) - Message d'erreur si échec
├── retry_count (integer) - Nombre de tentatives
├── final_url (text) - URL vidéo finale
├── video_url (text) - Alias pour compatibilité
├── webhook_url (text) - Webhook de notification
├── created_at (timestamptz)
└── updated_at (timestamptz) - Mis à jour auto
```

---

## ❓ FAQ

### La migration est-elle sûre ?
✅ Oui ! Elle est **idempotente** : vous pouvez l'exécuter plusieurs fois sans problème. Elle ne fera rien si les colonnes existent déjà.

### Vais-je perdre mes données ?
❌ Non ! La migration ajoute seulement des colonnes. Toutes vos données existantes sont préservées.

### Et si j'ai déjà des jobs en cours ?
✅ Pas de problème ! Les colonnes auront des valeurs par défaut pour les jobs existants.

---

## 🐛 Dépannage

### Erreur "permission denied"
→ Assurez-vous d'être connecté en tant qu'admin dans Supabase Dashboard

### Erreur "table jobs does not exist"
→ La table n'existe pas. Exécutez d'abord `supabase/migrations/20251004_jobs_table.sql`

### Le worker continue à échouer après la migration
→ Redémarrez le worker sur Railway/Render pour vider le cache

---

## 📞 Besoin d'aide ?

Si vous rencontrez des problèmes :
1. Vérifiez les logs du worker sur Railway/Render
2. Vérifiez la structure de la table dans Supabase
3. Assurez-vous que `SUPABASE_SERVICE_ROLE_KEY` est correcte dans les variables d'environnement
