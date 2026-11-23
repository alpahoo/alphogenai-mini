# Cinema M1 : vérifications hébergées disponibles sans session (2026-11-23, Claude)

Lecture seule. Aucune écriture, aucun compte créé ou modifié, aucune génération. Staging `hhearpympdflxyfmszap` uniquement.
Preview vérifiée : `feat/cinema-m1-persistence` @ `0761951` (déploiement READY).

## Ce qui a été vérifié

| Contrôle | Résultat |
|---|---|
| La Preview vise bien le staging | Oui. Le code client chargé par `/login` ne contient que `hhearpympdflxyfmszap` (aucun `qbrpzmuedfugbhoeytdj`). Les variables Preview propres à la branche existent. |
| Accès anonyme aux routes admin | `GET /api/admin/comfy/runs`, `/api/admin/comfy/history`, `/api/admin/studio/cinema`, `/api/admin/studio/references` : **401**. `/admin/studio` : redirection vers `/login`. |
| RLS | Les cinq tables `cinema_*` et les tables `comfy_*` ont RLS activée ; une politique par table Cinema. |
| Droits `anon` / `authenticated` | Aucun GRANT sur les tables `cinema_*` ni `comfy_*`. Les fonctions `SECURITY DEFINER` de comfy (`admit_*`, `claim_*`, `finish_*`, `expire_*`) ne sont exécutables ni par `anon` ni par `authenticated`. |
| Buckets | `references` et `comfy-outputs` privés (`public=false`). |
| Données de recette | 1 projet, 3 plans, 4 prises Cinema ; 4 runs H3 + 1 MOSS (fixtures Luz de la recette du 2026-11-23). |
| Migration | `20261122_cinema_m1` appliquée ; compatible avec la migration LongCat de #125 (seul lien : FK `cinema_takes.run_id -> comfy_runs(id)`, non affectée par l'élargissement du CHECK `runtime`). |

## Ce qui n'a pas été rejoué

La recette authentifiée (plans, prises, montage privé) n'est pas rejouée : elle exige une session admin. Le staging contient deux comptes
`@example.com` créés pour cette recette (un admin, un autre) ; leurs mots de passe ne sont pas accessibles et aucune session réutilisable
n'existe dans le navigateur de l'administrateur. Plan de reprise : voir la demande groupée dans la PR #125.

## Point de coordination

L'accès admin est décidé par l'e-mail (`NEXT_PUBLIC_ADMIN_EMAILS`, variable de build). Un compte jetable ne devient administrateur de cette
Preview que si son e-mail est ajouté à la variable Preview de la branche, puis la Preview reconstruite.
