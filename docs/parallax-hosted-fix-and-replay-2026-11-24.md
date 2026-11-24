# Parallax #123 : blocage resolu et recette rejouee (2026-11-24, Claude)

Staging `hhearpympdflxyfmszap` uniquement. Remplace la conclusion « blocage » de `parallax-hosted-authenticated-checks-2026-11-24.md`.

## Cause du 500 sur `PATCH /api/admin/modules`
La variable Preview `SUPABASE_SERVICE_ROLE_KEY` de la branche `codex/parallax-coexistence` etait une valeur **tronquee** (141 caracteres,
terminee par le caractere « … », code 8230) au lieu de la cle du staging (219 caracteres). `fetch` la refuse localement
(`TypeError: Cannot convert argument to a ByteString ... character at index 140 has a value of 8230`), donc aucune requete n'atteignait
Supabase. Le `GET` ignorait l'erreur (`maybeSingle()` sans controle) et renvoyait les valeurs par defaut. Ce n'etait ni la table, ni les droits.

## Correction (cette branche Preview uniquement)
Variable remplacee par la cle existante du staging (jamais affichee ni journalisee), #123 redeployee seule. Aucune rotation de cle,
aucune variable globale, production non touchee. Le bundle de la Preview ne contient que `hhearpympdflxyfmszap`.

## Rejeu : 11/11 PASS
- Sauvegarde d'une bascule : PATCH 200 ; retour a `false` : 200.
- Persistance : `/api/modules` public et GET admin apres rechargement refletent la valeur ; la ligne existe dans `app_settings`.
- Non-admin : GET 403 et PATCH 403 ; la valeur stockee reste inchangee.
- Anonyme 401 ; `/api/modules` : booleans seulement ; Shorts desactive : 404 meme pour un admin.

## Nettoyage verifie
Comptes jetables supprimes (SQL : 0), `app_settings` vide, contournement Vercel temporaire revoque (0 secret restant sur le projet),
liste d'admins de la Preview restauree, #123 reconstruite sans l'e-mail jetable (la cle reparee reste en place).

## Reste a faire (visuel, non couvert par l'API)
- [ ] `/admin/modules` : interrupteurs, entrees de navigation, pages Shorts / Audio / Remix, mobile (375 px) et bureau, themes clair et sombre.
- [ ] Suggestion de code (a decider par le proprietaire) : journaliser `error.message` dans le PATCH et verifier `error` dans le GET.
