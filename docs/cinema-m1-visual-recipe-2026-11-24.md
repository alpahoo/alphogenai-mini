# Cinema M1 : recette visuelle hebergee (2026-11-24, Claude)

Staging `hhearpympdflxyfmszap` uniquement. Preview `feat/cinema-m1-persistence` (bundle : seul `hhearpympdflxyfmszap`). Compte admin jetable cree puis
supprime ; aucun mot de passe saisi par un humain (session par API + cookies dans un Chromium pilote par Playwright ; contournement SSO temporaire
revoque, 0 secret restant). 375 px et 1366 px, themes clair et sombre (le Studio a son propre theme, cle `alphogen.studio.theme`).

## Resultat : tous les controles passent (4 combinaisons)
- `/admin/studio` s'ouvre sans redirection ; la vue Cinema (« Projects and takes ») s'affiche.
- Un projet, une scene et un plan crees par l'API s'ouvrent dans la liste deroulante : storyboard, formulaire du plan (direction, duree, premiere image), « Save plan », « Preview prompt », « Generate this plan only », « Attach take », panneau « Final montage · Corrected audio » atteignable.
- Aucun defilement horizontal, aucun element qui franchit le bord droit, theme conforme, aucun controle de contraste en echec, aucune erreur de console ni requete en echec.

## Non couvert
- Une prise avec media et un montage reel : aucune generation payante n'a ete lancee (les donnees de la recette locale appartiennent a d'autres comptes, que cette recette ne touche pas).
- Tactile, clavier virtuel, vrai telephone : a faire par une personne.

## Correctif partage
Le correctif « redact deleted job prompts without 503 » de cette PR a ete repris **a l'identique** dans #125 (suppression d'un rendu Avatar) : il s'applique tel quel, la fusion des deux branches ne cree pas de conflit. Verifie sur la Preview de #125 : suppression depuis l'UI, `jobs.prompt = [deleted]`.
