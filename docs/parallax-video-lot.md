# Parallax #118 — lot Video

Ce lot ne lance aucune génération fournisseur, ne touche aucune base hébergée et n'ajoute aucune migration. Il intègre le parcours vidéo Parallax au Studio H3 existant et le vérifie avec un run staging déjà terminé.

## Correction de la première version de ce document

La première version affirmait que `main` ne contient ni manifest H3/MiniMax ni route admin dédiée, et proposait donc de « porter » ce contrat. **C'était faux.** La branche avait été créée à partir du commit `01cdc54` (31 juillet 2026), 95 commits derrière `main`, avant l'arrivée du chemin H3 admin (`7d3e7e2` le 8 novembre, `47ac9d2` le 9 novembre). Les vérifications avaient été faites sur cette base périmée, dans un worktree sans dépendances installées. `main` a été fusionné dans la branche (`7226a9c`) et Vitest y tourne désormais.

Conséquence : il n'y a pas de port H3 à écrire. Le lot Vidéo fournit un petit adaptateur produit (`lib/studio/parallax-video.ts`) et rend explicite le parcours compatible : référence → préparation contrôlée par manifest → historique/reprise → résultat privé.

## Où se trouve le chemin vidéo H3 admin (sur `main`)

| Rôle | Emplacement |
|---|---|
| Manifest versionné (mode, ratio, durée, qualité, avance audio, première image) | `workflows/comfy/templates/minimax-h3/manifest.json`, graphes `graph.t2v.api.json`, `graph.t2v_full.api.json`, `graph.i2v.api.json` |
| Runtime exécuteur | `workflows/comfy/runtimes/h3-video@1.json`, `modal_app/comfy/` |
| Registre des modèles et liaison serveur des paramètres | `lib/comfy/templates.ts`, `lib/comfy/template.ts` (`resolveTemplate`), `lib/studio/catalog.ts`, `lib/studio/manifest.ts` |
| Admission (porte, quota, réservation, clé d'idempotence) | `app/api/admin/comfy/runs/route.ts` (POST, GET de disponibilité), SQL `admit_comfy_admin_run` dans `supabase/migrations/20261108_comfy_admin_h3.sql` |
| Reprise d'un run par identifiant, relance de l'envoi | `app/api/admin/comfy/runs/[id]/route.ts` (GET, POST, DELETE) |
| Historique | `app/api/admin/comfy/history/route.ts` |
| Fichiers privés et téléchargement (URL signée à la demande) | `app/api/admin/comfy/media/[id]/route.ts` |
| Suppression (tombstone) | `lib/comfy/delete-run.ts`, `lib/comfy/tombstone.ts` |
| Interface Studio et reprise après rechargement | `app/(admin)/admin/studio/page.tsx`, `components/studio/`, `lib/studio/run-poller.ts` |
| Montage avec son (déjà fusionné, #116) | `app/api/admin/studio/montages/route.ts`, `lib/montage/` |
| Composeur de plans (déjà fusionné, #114) | `lib/cinema/` |

Le chemin générique `app/api/jobs/*` cité dans la première version est un autre pipeline (moteurs EvoLink, BytePlus, Modal). Il n'est pas le chemin H3 admin et ne doit pas servir à le contourner.

## Matrice d'acceptation du lot Vidéo

« Couvert » = test automatisé exécuté en CI. « Local » = recette sur Supabase local de la PR #119 au SHA `8969f06` (pas encore sur `main`). Aucune preuve de ce tableau ne vient d'une Preview ou du staging.

| Exigence (#118, ligne Vidéo) | Preuve | Statut |
|---|---|---|
| Admin seulement ; paramètres inconnus, bornes, première image d'un autre compte refusés avant admission | `lib/comfy/template.test.ts`, `lib/comfy/templates.test.ts`, `lib/studio/manifest-validation.test.ts`, `app/api/admin/comfy/runs/route.test.ts` | Couvert |
| Porte, quota et réservation avant tout fournisseur ; relance avec la même clé sans second run | `runs/route.test.ts`, `runs/[id]/route.test.ts` ; SQL exécuté sur PGlite en CI | Couvert ; reprise après épuisement du quota : Local (#119, G18) |
| Sortie MP4 privée, URL signée à la demande, renouvelée, jamais stockée, nom de fichier construit par le serveur | `media/[id]/route.test.ts` + `media/[id]/signed-url.test.ts` (ajouté ici) | Couvert |
| Reprise d'un run après rechargement (run actif rouvert, polling) | `components/studio/run-recovery.test.ts`, `lib/studio/run-poller.test.ts` | Couvert |
| Reprise par identifiant d'un autre compte ou d'un run supprimé : 404, aucun fichier lu | `runs/[id]/owner-scoping.test.ts` (ajouté ici ; vérifié par mutation) | Couvert |
| Aucun accès croisé entre comptes sur l'historique et les fichiers | `history/route.test.ts`, `media/[id]/route.test.ts` | Couvert ; sur base réelle : Local (#119, I1–I17) |
| Téléchargement Corrected et Original distincts | `media/[id]/route.test.ts`, `signed-url.test.ts` | Couvert ; contenu audio du montage : Local (#119, M6–M8) |
| Navigation mobile Create / Result / History | `components/studio/studio-layout.test.ts` (structure) | Structure couverte ; rendu à 375 px sur un vrai appareil : à faire sur une Preview |
| Suppression d'un résultat | `lib/comfy/delete-run.test.ts` (base simulée) | **Échoue sur une base construite depuis le dépôt**, voir ci-dessous |
| Rendu réel, durée, coût, disponibilité GPU | — | Exige une autorisation explicite ; non fait |

### Adaptateur livré dans #121

`lib/studio/parallax-video.ts` épingle la révision MIT réutilisée et le contrat
admin H3. Il ne transporte ni l'authentification, ni SQLite, ni les crédits du
démonstrateur Parallax : les contrôles AlphoGenAI restent ceux des routes
`/api/admin/comfy/*`. Le bandeau `Parallax Video` du Studio n'est affiché que
pour `minimax-h3`; le bouton de génération reste soumis à la porte serveur et
au quota.

### Défaut connu qui bloque l'étape « supprimer »

`lib/comfy/delete-run.ts` met `jobs.prompt` à `NULL` pour les jobs `comfy:*`, mais `jobs.prompt` est `NOT NULL` (`supabase/migrations/20251004_jobs_table.sql`). La suppression Studio d'un run H3 ou MOSS répond alors 503 (« Could not clear the prompt from the job record »). Constaté sur Supabase local (recette #119, `D6a`) et, en lecture seule du catalogue, sur le staging `alphogenai-staging` (`is_nullable = NO`). La nullité en production n'a pas été vérifiée. Tant que ce point n'est pas traité (PR séparée), toute recette hébergée qui supprime un résultat échouera.

## Dépendances

| PR | Apport au lot Vidéo | État |
|---|---|---|
| #112 comparaison vidéo | comparer deux rendus, lecture, recherche temporelle | brouillon, non fusionnée |
| #113 limite d'envoi | première image volumineuse via la bibliothèque | brouillon, non fusionnée |
| #115 image MOSS vers bibliothèque | première image issue de MOSS pour H3 | brouillon, non fusionnée |
| #119 Cinema | génération « un plan à la fois », sélection de prises, montage | brouillon ; recette locale OK, recette hébergée en cours |

Aucun code de ces PR n'est copié ici : cette branche part de `main` et ne dépend d'aucune. Les points qui exigent leur code (comparaison, promotion d'image, plan par plan) restent à livrer après leur fusion.

## Ce que cette branche ne prétend pas

Aucun rendu, aucune disponibilité GPU, aucun coût, aucune migration, aucun test sur Preview ou staging. Les tests ajoutés portent sur des garanties du code existant ; ils ne changent aucun comportement.
