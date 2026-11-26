# Parallax #123 : plan de mise en ligne (2026-11-24)

Code vérifié sur le staging : `05f53e0` (30/30 contrôles, voir plus bas). Cette page est la seule différence ajoutée après ce SHA (documentation).
Rien n'a été fusionné ni touché en production : la base de production n'a été lue qu'en lecture seule.

## Ce que la mise en ligne apporte, concrètement
| Module | Ce qu'un admin peut faire | Première activation |
|---|---|---|
| **Shorts** | Écrire une idée (3 à 2000 caractères), choisir 5 ou 10 s : crée un vrai job vidéo vertical 9:16 par le circuit `/api/jobs` existant (moteur, quota et coût habituels), suivi sur `/jobs/<id>`. | **Admin seul** |
| **Remix** | Voir ses vidéos terminées, en choisir une et ouvrir le compositeur existant en mode Remix avec cette vidéo comme référence : crée un nouveau job séparé. | **Admin seul** |
| **Audio** | « Texte → Voix » crée seulement un **brouillon de podcast** (pas de fichier audio) ; l'onglet Musique n'est raccordé à aucun moteur. | **Désactivé** (rien d'abouti à offrir) |
| Clipping, Podcast Studio | Inchangés (actifs par défaut). | — |

Les trois modules Parallax sont désactivés tant qu'aucune ligne `parallax_modules` n'existe : la production n'en a pas aujourd'hui (seule la clé `providers` existe), donc **la fusion seule n'active rien**.

## Contrôles hors production déjà faits
- GitHub : PR #123 brouillon, `mergeable: clean`, check `free-tests` et `Vercel` verts, aucune revue, aucun commentaire en ligne. `main` est déjà dans la branche.
- Production `app_settings` (lecture seule) : colonnes `key text PK`, `value jsonb not null default '{}'`, `updated_at timestamptz default now()` ; RLS activée, 0 politique ; `service_role` a tous les droits ; une seule ligne (`providers`). Compatible avec la migration de #123 (`create table if not exists` sans effet). La migration retire en plus les droits de `anon`/`authenticated`, aujourd'hui présents mais bloqués par la RLS : tous les lecteurs du code utilisent la clé de service (modules, providers, engines, pipeline Modal), donc aucun effet de comportement.
- Vitest 1615/1615, `tsc` propre, lint sans erreur sur les fichiers modifiés.

## Preuves staging du SHA `05f53e0` (30/30)
Défaut sans réglage : Parallax off, Clipping/Podcast on. Non-admin : 403 sur la modification. Mode « Admin seul » : l'admin voit Shorts + Remix (pas Audio), un utilisateur normal ou anonyme ne voit rien, aucun job créé par les appels refusés (404 / 400), Shorts « page » : formulaire pour l'admin, message de désactivation pour les autres. Menu et page « Créer » : l'entrée Remix suit maintenant le module. Écran admin : 15 boutons d'état, sans débordement à 375 px, enregistrement par clic réel. Audio : l'appel d'historique envoie le jeton et reçoit 200. Interrupteur coupé et suppression SQL de la ligne : retour aux défauts.

## Le 401 Podcast : reproduit, deux causes
1. **Code (corrigé)** : la page Audio appelait `/api/podcasts` sans jeton, alors que cette route n'accepte que `Authorization: Bearer`. Reproduit avec une session normale : 401, `auth: false`. Corrigé : la page envoie le jeton de session, comme le Podcast Studio.
2. **Configuration de la Preview (corrigée sur cette branche seulement)** : `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_ANON_KEY` de la Preview pointaient vers la clé du **projet de production** alors que l'URL visait le staging, donc tous les appels à jeton échouaient (même avec un jeton valide). Remplacées par la clé anonyme du staging pour la branche `codex/parallax-coexistence` uniquement. À vérifier sur les autres Previews qui utilisent des routes à jeton.

## Ordre d'exécution (à lancer après votre accord)
1. Passer #123 de brouillon à « prête », vérifier que `free-tests` et `Vercel` sont verts sur le SHA final.
2. Fusionner #123 dans `main` (commit de fusion, comme les PR précédentes). Vercel déploie `main` en production automatiquement.
3. Attendre « READY », puis contrôles en lecture seule : `GET /api/modules` doit renvoyer `parallax_*: false`, `/login` et la page Créer répondent, les parcours Clipping et Podcast s'ouvrent.
4. (Facultatif, durcissement) appliquer `supabase/migrations/20261124_create_app_settings.sql` en production : sans effet fonctionnel, retire les droits résiduels de `anon`/`authenticated`. Non bloquant ; retour arrière : `grant ... on public.app_settings to anon, authenticated;` (la RLS continue de refuser).
5. Activation admin : `/admin/modules` → Shorts « Admin seul », Remix « Admin seul », Audio « Désactivé ». Vérifier connecté en admin que les entrées apparaissent, puis qu'un compte non admin ne les voit pas.
6. Recette réelle par vous (coûte un rendu) : un Short de 5 s, puis un Remix d'une vidéo terminée. Rien de cela n'a été lancé avant la mise en ligne, par prudence de coût.
7. Plus tard seulement : « Activé » pour tout le monde.

## Désactiver Parallax si un problème apparaît (du plus rapide au plus lourd)
1. **Écran admin** : `/admin/modules`, mettre les modules sur « Désactivé » (effet immédiat, pas de redéploiement, `no-store`).
2. **SQL** : `delete from public.app_settings where key = 'parallax_modules';` (retour aux défauts : tout Parallax off, Clipping et Podcast on). Testé sur le staging.
3. **Code** : retour instantané Vercel au déploiement de production précédent (`dpl_9F5RY1HNd5BiXb93pSsyRW3kJfGS`, `main` @ `1a73e65`, candidat de retour) ou `git revert -m 1` du commit de fusion. La ligne `parallax_modules` peut rester : l'ancien code l'ignore.

## Non validé (à savoir avant d'activer pour tous)
- Aucun rendu réel Shorts ou Remix (coût), ni la lecture d'une vidéo Remix source en production.
- Audio : brouillon seulement ; Musique non raccordée (module laissé désactivé).
- Vrai téléphone et tactile ; l'écran « Créer » en mode sombre n'a pas été revu.
- La variable de production `NEXT_PUBLIC_SUPABASE_ANON_KEY` n'a pas été lue (hors périmètre « lecture seule schéma ») ; les routes à jeton existantes fonctionnent déjà en production, ce qui suggère qu'elle est cohérente.
