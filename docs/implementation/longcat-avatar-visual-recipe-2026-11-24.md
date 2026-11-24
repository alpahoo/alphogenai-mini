# Recette visuelle hebergee (2026-11-24, Claude)

Staging `hhearpympdflxyfmszap` uniquement, trois Previews (#119, #123, #125), compte admin jetable cree et supprime par
`tools/avatar-staging/visual-session.mjs`. **Aucun mot de passe saisi par un humain** : la session est ouverte par l'API et ses cookies sont
poses dans un Chromium pilote par Playwright (Chromium deja installe, rien telecharge) ; la protection SSO des Previews est franchie par un
secret d'automatisation temporaire, revoque a la fin (0 secret restant). 375 px (mobile) et 1366 px (bureau), themes clair et sombre.
Les captures et planches restent sur l'ordinateur de test (`tmp/avatar-staging/shots/`, hors Git).

## Resultat par PR (derniere passe : 275/293 controles)

| PR | Resultat | Detail |
|---|---|---|
| #125 Avatar | **tous les controles passent** | parcours complet par l'interface (televersement portrait et audio, rendu simule, statut, lecteur prive, telechargement, rechargement, bibliotheque), suppression depuis l'UI a 375 px, themes clair et sombre, aucun debordement, contraste du titre, defilement dans le cadre admin |
| #119 Cinema | **tous les controles passent** | liste de projets, storyboard (scene, plan, formulaire), panneau de montage, 4 combinaisons, aucun debordement |
| #123 Parallax | 18 echecs, **aucun dans le code de la PR** (voir ci-dessous) | bascules enregistrees depuis l'UI et conservees apres rechargement, pages ouvertes avec leur message de garde quand le module est desactive |

## Defauts trouves et corriges dans #125
1. L'ecran Avatar ne defilait pas dans le cadre admin (`h-[100dvh]`) : sur mobile, le contenu au-dela du premier ecran passait sur un fond clair. Conteneur defilant ajoute.
2. Pas de bascule de theme Studio (cle `alphogen.studio.theme`) : ajoutee comme dans le Studio ; teintes rouge/vert lisibles en clair.
3. Debordement de quelques pixels a droite a 375 px : grille a une colonne `minmax(0,1fr)` et `min-w-0`.
4. Suppression d'un rendu termine : 503 (`jobs.prompt NOT NULL`), corrige comme dans #119, bouton reaffiche.

## Defauts constates qui ne viennent pas des PR (a decider par les proprietaires)
- `/admin/modules` et l'espace de travail en theme **sombre** : fond clair avec texte clair, titres quasi invisibles (contraste 1,1:1). Le theme sombre est atteignable (`enableSystem`).
- Espace de travail a 375 px : la barre laterale reste ouverte (~270 px) et ecrase le contenu des pages, dont Parallax Shorts, Audio et Remix (boutons qui depassent a droite). #123 n'ajoute que 15 lignes d'entrees de navigation a cette barre.
- `401 /api/podcasts` sur les pages Parallax avec une session par cookie seul (ces pages semblent attendre un jeton Bearer) : non verifie plus loin.

## Reste a faire par une personne
- Regarder le rendu sur un vrai telephone (la recette emule 375 px mais pas le tactile ni le clavier virtuel).
- Rendu GPU reel Luz : non lance, en attente d'un accord explicite (voir la section suivante).

## Rendu reel Luz (prepare, non lance)
`node tools/avatar-staging/real-render-luz.mjs` = test a blanc (rien ne change, rien ne se depense) ; `--confirm-gpu-spend` lance le GPU.
Cout : attendu ~0,55 USD (chargement a froid ~170 s + 3 segments ~185 s + 60 s avant arret), plafond ~0,96 USD (arret force a 720 s),
reservation applicative 0,75 USD pour 1 rendu. Entrees : portrait Luz (copie 1152x1536 du meme visage, 460 Ko, car l'original de 8 Mo depasse
la limite d'envoi de 4,5 Mo) et voix FR validee (WAV 16 kHz, 9,68 s, donc 3 segments), prompt valide du POC. Le clip n'est conserve que sur
l'ordinateur de test ; compte, fichiers et contournement sont supprimes ensuite et l'app Modal repasse en mode simulation.
