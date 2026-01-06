# Ajouter les colonnes manquantes à la table jobs

## Problème

Le worker essaie d'écrire dans des colonnes qui n'existent pas:
- `updated_at`
- `error_message`
- `current_stage`
- `retry_count`
- `video_url`
- `final_url`

## Solution

Exécutez ce SQL dans votre Supabase SQL Editor:

```sql
-- Add missing columns to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS current_stage TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS final_url TEXT;

-- Create index on status for faster queries
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC);

-- Update existing rows to have updated_at set
UPDATE jobs SET updated_at = created_at WHERE updated_at IS NULL;
```

## Étapes

1. Allez dans Supabase Dashboard
2. Ouvrez le SQL Editor
3. Copiez-collez le SQL ci-dessus
4. Exécutez la query
5. Le worker devrait maintenant fonctionner correctement!

## Vérification

Après avoir exécuté le SQL, vous pouvez vérifier que les colonnes ont été ajoutées:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'jobs'
ORDER BY ordinal_position;
```
