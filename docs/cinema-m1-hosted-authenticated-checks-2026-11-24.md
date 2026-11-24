# Cinema M1 : recette hebergee authentifiee (2026-11-24, Claude)

Staging `hhearpympdflxyfmszap` uniquement. Deux comptes jetables (admin + non-admin) crees puis supprimes par le script
`tools/avatar-staging/run-hosted-staging.mjs` (PR #125). Les comptes existants et la production n'ont pas ete touches.
Preview `feat/cinema-m1-persistence` : le bundle client ne contient que `hhearpympdflxyfmszap` (verifie avant tout test authentifie).

## Controles API reussis (9/9)
- anonyme : refuse (401) ; non-admin : refuse (403) en GET et POST ; admin : liste 200.
- isolation : l'admin jetable ne voit pas les projets des comptes de la recette existante.
- project.create / scene.create / shot.create : 201 ; storyboard relu (1 scene, 1 plan) ; le non-admin ne peut pas le lire.

## Nettoyage
Comptes jetables et leurs lignes/fichiers supprimes ; variable Preview restauree ; contournement Vercel temporaire revoque ; aucun residu (verifie par SQL).

## Reste a faire (verification visuelle, non couverte par l'API)
- [ ] Ecran Cinema Studio : storyboard, prises, panneau de montage, sur mobile (375 px) et bureau, themes clair et sombre.
- [ ] Generation de prise et montage prive : non rejoues (aucune generation payante lancee).
