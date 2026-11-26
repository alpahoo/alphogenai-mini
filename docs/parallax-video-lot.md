# Parallax #118 — lot Video

Ce lot ajoute l'écran **Studio · Video** (`/admin/studio/video`), greffé depuis le module Vidéo de Parallax (MIT, révision figée `a98671e3c47fdb12c42789aee821268aa8f23f6c`), et le branche sur ce qu'AlphoGenAI a déjà : comptes admin, jobs H3, historique privé, stockage privé. Il n'ajoute ni route API, ni table, ni migration, ni fournisseur, ni secret, et ne lance aucune génération par lui-même.

## Ce que l'administrateur peut faire

1. Ouvrir **Video** dans le menu admin (ou le badge « Parallax Video » de l'en-tête du Studio).
2. Partir d'un des douze **exemples** de Parallax (par catégorie) ou écrire un prompt. Choisir un exemple ne fait que remplir le formulaire.
3. **Préparer un plan** : première image prise dans la bibliothèque privée de références (ou envoi ponctuel), durée, format, qualité. Le panneau « Review before generating » montre la réservation, le GPU et l'estimation, et les blocages de la porte H3 sont affichés tels quels.
4. **Lancer** : même admission que le Studio (porte, quota, réservation, clé d'idempotence). Une tuile « en cours » apparaît en tête de l'historique, puis devient une vidéo.
5. **Retrouver ses vidéos** en tuiles : lecture muette au survol, détails au clic (lecteur privé, Corrected / Original / Compare, téléchargements, « Reuse settings », « New seed », suppression). Un run en attente d'envoi propose « Retry dispatch » ; un run échoué donne le message du serveur et « Reuse settings », jamais un nouveau run automatique.
6. **Après un rechargement**, l'historique, le lien `?run=<id>` (qui rouvre les détails) et les téléchargements fonctionnent : tout vient des routes privées existantes.

## Éléments Parallax effectivement greffés

| Parallax (`src/…`) | AlphoGenAI | Adaptation |
|---|---|---|
| `components/video/video-studio.tsx` | `components/studio/video/video-studio.tsx` | Disposition à deux volets (plan à gauche, galerie à droite, empilés sur téléphone). L'état est celui du Studio (`useStudio`) ; connexion, crédits et galerie communautaire ne sont pas repris. |
| `components/video/video-form.tsx` | `components/studio/video/video-form.tsx` | Structure : carte du modèle, prompt, emplacement « première image », réglages, barre Generate. Le modèle et les réglages viennent du manifest H3 ; Generate affiche la vraie réservation et les blocages. |
| `components/video/segmented.tsx` | `components/studio/video/segmented.tsx` | Aux couleurs du Studio. |
| `components/video/masonry.tsx` | `components/studio/video/masonry.tsx` | Identique en comportement (1, 2 ou 3 colonnes). |
| `components/video/examples.tsx` + `content/video.ts` (`videoExamples`, catégories) | `components/studio/video/examples.tsx` + `lib/studio/video-examples.ts` | Les douze prompts et les catégories ; tuiles en texte, sans les images de Parallax. |
| `components/video/history.tsx` | `components/studio/video/video-history.tsx` | Tuiles terminée / en cours / échouée, lues dans l'historique privé H3. Un lien de fichier n'est signé que quand la tuile devient visible, puis à nouveau s'il expire, et n'est jamais stocké. |
| `components/video/detail.tsx` | `components/studio/video/video-detail.tsx` | Fenêtre de détails dont le corps est l'étape « résultat » du Studio (liens signés, versions, finance). |

Notice MIT : `components/studio/video/LICENSE-parallax.txt` et un en-tête dans chaque fichier adapté. Le module d'adaptation `lib/studio/parallax-video.ts` (Codex) épingle la révision et le contrat H3 ; son badge dans le Studio renvoie à l'écran.

**Non repris, et pourquoi :** le registre de modèles externes (Veo, Seedance…) et leurs prix en crédits (H3 reste le seul moteur, admin, et aucun crédit client ne finance le GPU) ; le pipeline `/api/jobs` et les crédits ; publication, favoris et communauté ; l'onglet « Edit Video » et le mode avatar ; les images des exemples ; la connexion et la session de Parallax ; SWR.

## Raccordements AlphoGenAI

| Besoin | Raccordement |
|---|---|
| Comptes | Page protégée par `requireAdminPage` ; toutes les routes appelées vérifient `requireAdmin` et le propriétaire. |
| Jobs H3 | `useStudio` : `POST /api/admin/comfy/runs` (porte, quota, réservation, clé idempotente), reprise par `GET …/runs/[id]`, relance d'envoi. |
| Historique | `GET /api/admin/comfy/history` ; l'écran n'affiche que les runs vidéo (les images MOSS restent dans le Studio). |
| Stockage privé | `GET /api/admin/comfy/media/[id]` : URL signée à la demande (10 min), nom de fichier construit par le serveur. |
| Références | Bibliothèque privée existante (`/api/admin/studio/references`) ; une référence n'est jamais copiée ni publique. |

## Recette

**Locale (Supabase local, serveur de dev, simulateur HTTPS de l'exécuteur ; aucun coût, aucun fournisseur).** Réalisée sur ce SHA, avec le compte de test local : ouverture de l'écran ; exemple « harbour at dawn » choisi (prompt rempli, rien lancé) ; image « Luz » choisie dans la bibliothèque privée ; Generate : un run admis, un permis consommé, tuile « Sent to Modal » puis vidéo ; détails (Completed, lecteur, Corrected / Original / Compare) ; téléchargement Corrected : requête `?download=1` en 200, fichier `alphogen-<run>-corrected.mp4`, MP4 de 1,48 Mo, lien de 600 s ; **rechargement complet** : la tuile est dans l'historique, ses détails s'ouvrent, le téléchargement refonctionne ; lien direct `?run=<id>` : les détails s'ouvrent ; « Reuse settings » recharge le prompt et ferme la fenêtre. Côté base : run `done`, référence de bibliothèque, fichiers `final` et `raw`.

**Preview : non réalisée, bloquée.** La Preview de la branche `codex/parallax-video-lot` est reliée au **Supabase de production** (le seul identifiant de projet présent dans son code client est `qbrpzmuedfugbhoeytdj`). Y ouvrir une session et lancer ou rouvrir un run serait une intervention en production. Les Preview de #119 et #120 ont, elles, des variables propres à leur branche vers le staging. Pour débloquer : les mêmes variables pour cette branche (changement Vercel, avec la clé de service du staging) et une session admin sur le staging. La recette à y passer est celle ci-dessus, **sans cliquer sur Generate** (la génération y reste fermée) : ouvrir l'écran, choisir la référence de bibliothèque, ouvrir un run H3 de test déjà terminé du staging, le télécharger, recharger, le retrouver.

## Où se trouve le chemin vidéo H3 admin (sur `main`)

| Rôle | Emplacement |
|---|---|
| Manifest versionné (mode, ratio, durée, qualité, avance audio, première image) | `workflows/comfy/templates/minimax-h3/manifest.json`, graphes `graph.t2v.api.json`, `graph.t2v_full.api.json`, `graph.i2v.api.json` |
| Runtime exécuteur | `workflows/comfy/runtimes/h3-video@1.json`, `modal_app/comfy/` |
| Registre des modèles et liaison serveur des paramètres | `lib/comfy/templates.ts`, `lib/comfy/template.ts` (`resolveTemplate`), `lib/studio/catalog.ts`, `lib/studio/manifest.ts` |
| Admission (porte, quota, réservation, clé d'idempotence) | `app/api/admin/comfy/runs/route.ts`, SQL `admit_comfy_admin_run` dans `supabase/migrations/20261108_comfy_admin_h3.sql` |
| Reprise d'un run par identifiant, relance de l'envoi | `app/api/admin/comfy/runs/[id]/route.ts` |
| Historique | `app/api/admin/comfy/history/route.ts` |
| Fichiers privés et téléchargement | `app/api/admin/comfy/media/[id]/route.ts` |
| Suppression (tombstone) | `lib/comfy/delete-run.ts`, `lib/comfy/tombstone.ts` |
| Montage avec son (#116), composeur de plans (#114) | `app/api/admin/studio/montages/route.ts`, `lib/montage/`, `lib/cinema/` |

La première version de ce document affirmait que `main` n'a pas le manifest H3 ni la route admin : **c'était faux**, la branche avait été créée d'un commit du 31 juillet, 95 commits derrière `main`. `main` a été fusionné (`7226a9c`).

## Matrice d'acceptation

« Couvert » = test automatisé en CI. « Local » = recette sur Supabase local (#119 au SHA `8969f06`, ou la recette de cet écran). Aucune preuve ne vient d'une Preview ou du staging.

| Exigence (#118, ligne Vidéo) | Preuve | Statut |
|---|---|---|
| Admin seulement ; paramètres inconnus, bornes, première image d'un autre compte refusés avant admission | `lib/comfy/template.test.ts`, `templates.test.ts`, `lib/studio/manifest-validation.test.ts`, `runs/route.test.ts` | Couvert |
| Porte, quota et réservation avant tout fournisseur ; relance avec la même clé sans second run | `runs/route.test.ts`, `runs/[id]/route.test.ts`, SQL sur PGlite en CI | Couvert ; reprise après épuisement du quota : Local (#119, G18) |
| Sortie MP4 privée, URL signée à la demande, renouvelée, jamais stockée | `media/[id]/route.test.ts` + `signed-url.test.ts` | Couvert |
| Reprise d'un run après rechargement | `run-recovery.test.ts`, `run-poller.test.ts` ; recette de l'écran | Couvert ; Local |
| Reprise d'un run d'un autre compte ou supprimé : 404 | `runs/[id]/owner-scoping.test.ts` (vérifié par mutation) | Couvert |
| Aucun accès croisé entre comptes (historique, fichiers) | `history/route.test.ts`, `media/[id]/route.test.ts` | Couvert ; base réelle : Local (#119, I1–I17) |
| Tuiles : seuls les runs vidéo, état réel, jamais un lecteur sans fichier, « Retry dispatch » seulement si l'envoi n'est pas acquitté, aucun lien signé au rendu | `lib/studio/video-screen.test.ts`, `components/studio/video/video-history.test.tsx` (vérifiés par mutation) | Couvert |
| Corrected et Original distincts | `media/[id]/route.test.ts` | Couvert ; audio du montage : Local (#119, M6–M8) |
| Navigation mobile | `studio-layout.test.ts` (structure) | Structure couverte ; 375 px sur un vrai appareil : à faire sur une Preview |
| Suppression d'un résultat | `lib/comfy/delete-run.test.ts` (base simulée) | **Échoue sur une base construite depuis le dépôt**, voir ci-dessous |
| Rendu réel, durée, coût, GPU | — | Exige une autorisation explicite ; non fait |

### Défaut connu qui bloque l'étape « supprimer »

`lib/comfy/delete-run.ts` met `jobs.prompt` à `NULL` pour les jobs `comfy:*`, mais `jobs.prompt` est `NOT NULL` (`supabase/migrations/20251004_jobs_table.sql`). La suppression d'un run H3 ou MOSS répond 503 (« Could not clear the prompt from the job record »). Constaté en local et, en lecture seule du catalogue, sur le staging. La production n'a pas été consultée. Le bouton « Delete » de la fenêtre de détails est donc affecté comme celui du Studio.

## Actions bloquées par une dépendance

| Action | Bloquée par | État |
|---|---|---|
| Recette depuis la Preview | Preview reliée à la production (voir Recette) | Variables Vercel de branche vers le staging, à décider |
| Comparer deux rendus côte à côte dans la galerie | #112 | brouillon, non fusionnée |
| Première image de plus de 4,5 Mo | #113 | brouillon, non fusionnée |
| Première image issue d'une image MOSS | #115 | brouillon, non fusionnée |
| Préparer et générer plan par plan, avec prises | #119 | brouillon ; recette locale OK |
| Supprimer un résultat | défaut `jobs.prompt` ci-dessus | non corrigé |

Le reste de l'écran fonctionne sans ces PR : aucun code de #112, #113, #115 ou #119 n'est copié ici.

## Ce que cette PR ne prétend pas

Aucun rendu réel, aucune disponibilité GPU, aucun coût, aucune migration, aucune preuve sur Preview ou staging. La recette locale utilise un simulateur de l'exécuteur et des clips de test.
