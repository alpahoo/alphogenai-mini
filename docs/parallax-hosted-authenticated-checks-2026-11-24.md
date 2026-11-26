# Parallax #123 : recette hebergee authentifiee (2026-11-24, Claude)

Staging `hhearpympdflxyfmszap` uniquement. Deux comptes jetables (admin + non-admin), supprimes a la fin. Comptes existants et
production non touches. Preview `codex/parallax-coexistence` : bundle client = `hhearpympdflxyfmszap` uniquement.
Migration `20261124_create_app_settings.sql` appliquee sur le staging avant la recette (table, RLS sans politique, droits `service_role` seuls).

## Controles API reussis
- anonyme : `/api/admin/modules` refuse (401) ; `/api/modules` public : booleens uniquement.
- non-admin : GET 403 et PATCH 403 ; admin : GET 200 avec les cinq modules.
- Shorts desactive : 404 meme pour un admin connecte (garde avant toute creation de job).
- Le drapeau public est revenu a `false` apres la recette.

## BLOCAGE : l'enregistrement d'un interrupteur echoue (3 controles FAIL)
`PATCH /api/admin/modules` renvoie **500 "Could not save module setting"** sur cette Preview.
- La base n'est pas en cause : une ecriture `insert ... on conflict (key) do update` executee en tant que `service_role` sur
  `public.app_settings` reussit (test annule, 0 ligne restante). La table existe, RLS activee, droits attendus presents.
- Les logs API du staging ne montrent AUCUNE requete de cette Preview vers `app_settings` pendant le test, alors que les Previews
  Cinema et LongCat y apparaissent normalement. L'appel du client de service echoue donc avant d'atteindre Supabase.
- Piste la plus probable (non confirmee) : la valeur de `SUPABASE_SERVICE_ROLE_KEY` propre a la branche `codex/parallax-coexistence`
  (creee avant cette recette, valeur illisible depuis ici) est invalide pour fetch (par exemple un retour a la ligne final).
  Le GET masque l'erreur (`maybeSingle()` sans controle d'erreur) et renvoie les valeurs par defaut, d'ou un GET 200 trompeur.
- Aucune variable de cette Preview n'a ete modifiee hors liste d'admins (restauree). Correction proposee, a autoriser :
  recreer la variable de branche avec la cle de service du staging, sans retour a la ligne, puis rejouer ces 3 controles.
- Suggestion de code (hors perimetre, a decider par le proprietaire de #123) : journaliser `error.message` dans le PATCH et verifier
  `error` dans le GET.

## Reste a faire (verification visuelle)
- [ ] `/admin/modules` : interrupteurs, entrees de navigation qui apparaissent/disparaissent, pages Shorts / Audio / Remix, mobile (375 px) et bureau, themes clair et sombre.
