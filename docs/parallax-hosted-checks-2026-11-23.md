# Parallax #123 : vérifications hébergées disponibles sans session (2026-11-23, Claude)

Lecture seule. Aucune écriture, aucun compte créé ou modifié, aucun interrupteur de module actionné. Staging `hhearpympdflxyfmszap` uniquement.
Preview vérifiée : `codex/parallax-coexistence` @ `325f3ce` (déploiement READY).

## Ce qui a été vérifié

| Contrôle | Résultat |
|---|---|
| La Preview vise bien le staging | Oui. Le code client chargé par `/login` ne contient que `hhearpympdflxyfmszap`. |
| Accès anonyme | `GET /api/admin/modules` : **401** ; `GET /api/admin/comfy/runs`, `/api/admin/comfy/history` : **401** ; `/admin/studio` : redirection `/login`. |
| Lecture publique limitée | `GET /api/modules` : 200, booléens uniquement : `alphogenai_clipping: true`, `alphogenai_podcast: true`, `parallax_shorts: false`, `parallax_audio: false`, `parallax_remix: false`. Rien d'autre n'est exposé. |
| `POST/PATCH` Shorts sans session | `GET /api/parallax/shorts` : 405 (la route n'accepte pas GET). |

## Blocage trouvé pour « activer les modules depuis /admin/modules »

**La table `public.app_settings` n'existe pas sur le staging.** Elle n'a jamais été créée par une migration du dépôt (la migration
`20260609_enable_rls_app_settings.sql` échoue avec `relation "public.app_settings" does not exist`, un des cinq échecs historiques
documentés). `PATCH /api/admin/modules` écrit la clé `parallax_modules` dans cette table : sans elle, les interrupteurs ne peuvent pas
être enregistrés sur le staging, et `/api/modules` ne renvoie que les valeurs par défaut.

DDL minimal proposé (staging seulement, à autoriser séparément) :

```sql
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select, insert, update, delete on public.app_settings to service_role;
```

(Même modèle que la correction R-018 : RLS sans politique, accès par le rôle de service uniquement.)

## Ce qui n'a pas été rejoué

Admin et non-admin (403 sur PATCH), Shorts distinct, historique privé après rechargement et parcours Audio exigent des sessions. L'accès
admin est décidé par l'e-mail (`NEXT_PUBLIC_ADMIN_EMAILS`, variable de build de la Preview) : un compte jetable n'est administrateur que si
son e-mail est ajouté à la variable Preview de la branche, puis la Preview reconstruite. Plan de reprise : demande groupée dans la PR #125.
