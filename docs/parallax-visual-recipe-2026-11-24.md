# Parallax #123 : recette visuelle hebergee (2026-11-24, Claude)

Staging `hhearpympdflxyfmszap` uniquement. Preview `codex/parallax-coexistence` (bundle : seul `hhearpympdflxyfmszap`, cle de service reparee, voir
`parallax-hosted-fix-and-replay-2026-11-24.md`). Compte admin jetable, supprime ; aucun mot de passe saisi par un humain ; contournement SSO temporaire revoque
(0 secret restant). 375 px et 1366 px, themes clair et sombre. Aucune generation lancee.

## Ce qui fonctionne
- `/admin/modules` : cinq modules, trois Parallax « Désactivé » par defaut ; une bascule cliquee depuis l'UI est enregistree et **conservee apres rechargement** (3 puis 2 desactives).
- Modules desactives : `/parallax/shorts`, `/parallax/audio` et `/remix` s'ouvrent (HTTP 200) avec le titre « Parallax — … désactivé » et le message de garde.
- Modules actives (via l'API admin) : les trois pages s'ouvrent ; les entrees « Parallax — Shorts », « Parallax — Audio » (et Remix) apparaissent dans la navigation.
- Theme clair et bureau : lisibles.

## Constats (18 echecs automatiques, aucun dans le code de cette PR)
1. **Theme sombre** : sur `/admin/modules` et sur les pages de l'espace de travail, le fond reste clair alors que le texte devient clair : titres a 1,1:1 de contraste (quasi invisibles). Le theme sombre est atteignable (`enableSystem`). Constat general de l'application, vu sur ces ecrans.
2. **375 px, espace de travail** : la barre laterale reste ouverte (~270 px) et ecrase le contenu ; sur Shorts/Audio/Remix, des boutons depassent a droite (jusqu'a +150 px sur Audio). Cette PR n'ajoute que 15 lignes d'entrees de navigation a la barre (`components/workspace/sidebar.tsx`) ; la barre toujours ouverte sur mobile est anterieure. A decider : une barre repliable sur mobile, ou des pages Parallax pensees pour largeur reduite.
3. `401 /api/podcasts` sur ces pages avec une session par cookie seul (probablement un jeton Bearer attendu) : non explore.

## Reste a faire par une personne
- Verification sur un vrai telephone ; parcours reel de Shorts, Audio et Remix avec generation (aucune lancee ici).
