# Parallax #118 — lot Video (préparation)

Cette branche part de `main` et prépare le lot Video sans soumettre de rendu. L’objectif est de réutiliser le contrat déjà éprouvé du Studio et d’isoler le futur chemin H3 admin avant toute activation de fournisseur.

## Réutilisation identifiée

| Besoin | Fichier / route existant | Contrôle à conserver |
| --- | --- | --- |
| création et reprise d’un job | `app/api/jobs/route.ts`, `app/api/jobs/[id]/route.ts` | session, propriétaire, état persistant et reprise après rechargement |
| références image privées | `app/api/upload/route.ts`, `lib/r2.ts`, `app/api/jobs/[id]/reference-image/route.ts` | bucket privé, chemin canonique, URL signée à la demande |
| paramètres moteur | `lib/engine-templates.ts`, `lib/engine-intentions.ts`, `lib/jobs/guard.ts` | moteur déclaré, bornes et plan avant appel fournisseur |
| relance / échecs partiels | `app/api/jobs/[id]/retry/route.ts`, `retry-scenes/route.ts` | propriétaire, idempotence côté job et conservation des scènes déjà prêtes |
| UI mobile | `app/(workspace)/create/[mode]/page.tsx`, `components/create/` | mêmes contrôles et mêmes références à petit écran |

## Constat vérifié sur `main`

Le dépôt de base contient le chemin général de création vidéo et les garde-fous de références, mais aucun manifest H3/MiniMax admin ni route `/admin/workflows/minimax-h3` n’est présent dans cette base. Le plus petit prochain PR de code est donc un port séparé du contrat H3 : manifest versionné (mode, ratio, durée, audio advance, première image), admission admin-only, quota/réservation avant provider, sortie MP4 privée et polling idempotent. Il devra réutiliser les helpers ci-dessus plutôt que créer une seconde machine `jobs`.

## Périmètre de vérification du prochain PR

- tests unitaires des bornes du manifest et du rejet des paramètres inconnus ;
- tests route-level admin / autre compte / anonyme, avec propriétaire du job et des références ;
- test de signed URL expirée puis renouvelée sans persister l’URL ;
- test de reprise après rechargement et de relance d’une scène sans effacer les scènes déjà prêtes ;
- recette mobile simulée à 375 px avec fournisseur simulé uniquement ;
- CI, Preview reliée à la base staging, puis une génération réelle seulement après autorisation explicite.

Cette branche ne prétend pas valider une disponibilité GPU, un coût, une migration ou un rendu hébergé.
