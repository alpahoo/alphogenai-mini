# 5. Plan d'implémentation progressif

Règles valables pour chaque phase :

- Une phase = une PR (ou une petite série), revue avant fusion. Pas de push direct sur `main` pour ce chantier :
  `modal_app/**` déclenche un déploiement Modal de production.
- Aucune dépense GPU sans accord explicite du propriétaire, avec le montant annoncé. Les plafonds ci-dessous sont
  des maxima à faire valider (D10).
- Aucune migration appliquée en production sans validation. Migrations additives, GRANT + RLS dans le même fichier.
- Tous les tests existants restent verts (`npm run test`, `npx tsc --noEmit`, `npm run lint`, `next build`).
- Le garde-fou anti-fuite des fournisseurs reste vert ; il est étendu à chaque phase qui ajoute des libellés.

## Phase 0 : décisions (ce dossier)

Livrable : décisions D1 à D11 tranchées par le propriétaire.
Acceptation : chaque décision a une réponse écrite dans `00-README.md`.

## Phase 1 : socle sans GPU (runtime, templates, validateur, résolveur)

| Livrable | Détail |
|---|---|
| Format de runtime | `workflows/comfy/runtimes/h3-video@1.yaml` (ComfyUI v0.42.0, aucun custom node, catalogue des 6 fichiers du labo avec source HF et SHA-256, GPU H100, options de lancement de sécurité) |
| Template H3 | `workflows/comfy/templates/minimax-h3/{graph.api.json, manifest.json, object_info.snapshot.json, README.md}` |
| Schéma | `lib/comfy/manifest-schema.ts` (types + validation de structure) |
| Validateur | `lib/comfy/validate-params.ts` (4.1 à 4.5) |
| Résolveur | `lib/comfy/resolve-graph.ts` (variantes, valeurs, dérivés, empreinte SHA-256) |
| Dérivés | `lib/comfy/derived.ts` (`frames_from_seconds`, `dims_from_aspect`, `random_seed`) |
| Sécurité du graphe | `lib/comfy/graph-policy.ts` (liste blanche de `class_type`, refus des chemins, modèles hors catalogue) |
| Tests | `lib/comfy/__tests__/*.test.ts` |

Critères d'acceptation :

1. Pour les 3 cas du labo (`t2v_ugc_fr`, `i2v_celimax_lifestyle`, `t2v_product_macro`, mêmes valeurs, largeur et hauteur passées explicitement en mode Advanced), le graphe
   résolu est **identique** (JSON normalisé, clés triées) au graphe produit par `h3-lab/app.py::build_workflow`
   en mode `turbo=v4, te=int8`. Test automatisé avec les graphes de référence en fixtures.
2. `frames_from_seconds` : 5 s → 124 images et 7 s → 175 images (valeurs du labo).
3. Le validateur rejette, avec un code d'erreur stable, au moins : clé inconnue, valeur hors plage, option hors
   liste, paramètre verrouillé modifié, paramètre réservé à un autre plan, modèle hors catalogue, `class_type`
   hors liste blanche, valeur de type chemin (`../`, `/`, `\`), prompt vide. ≥ 20 cas de test.
4. Couverture des lignes de `lib/comfy/` ≥ 90 %.
5. Aucun fichier ajouté sous `modal_app/` dans cette phase. 0 $ dépensé.

## Phase 2 : runner Modal + intégration jobs (admin uniquement)

| Livrable | Détail |
|---|---|
| App Modal | `modal_app/comfy/app.py` (`alphogenai-comfy`) : dispatcher web (secret), classe `ComfyRunner` générée par runtime, volume de modèles, `retries=0`, `max_containers=1` au départ |
| Client ComfyUI | `modal_app/comfy/comfy_client.py` (`/prompt`, `/ws`, `/view`, `/upload/image`, `/interrupt`, `/history` clear) |
| Post-traitement | `modal_app/comfy/postprocess.py` : `audio_shift` (portage de `h3-lab/app.py::shift_audio`), `keep_raw` |
| Téléchargement modèles | `modal_app/comfy/models.py` : lit le catalogue du runtime, vérifie les SHA-256 |
| Migrations | `comfy_templates`, `comfy_template_versions`, `comfy_runs` ; CHECK `engines.type` élargi à `comfy_workflow` |
| API | branche comfy dans `app/api/jobs/route.ts` ; lecture `comfy_runs` dans `app/api/jobs/[id]/route.ts` ; `POST /api/jobs/[id]/cancel` |
| Registre | ligne `engines` `comfy:minimax-h3`, `status = coming_soon`, plans vides : visible seulement des admins |
| Déploiement | manuel (`python -m modal deploy modal_app/comfy/app.py`), après accord ; `deploy-modal.yml` non modifié dans cette phase |

Critères d'acceptation :

1. Smoke test payant (accord préalable, plafond **0,30 $**) : 3 runs H3 lancés depuis l'UI admin réussissent.
   Chaque MP4 a une piste vidéo H.264 et une piste audio, une durée de 5,17 s ± 0,05 s pour 5 s demandées.
2. `audio_shift` appliqué : `lipsync_measure.py` donne un décalage global dans ±150 ms sur le clip UGC
   (le brut donnait +330 à +540 ms). Le fichier brut est conservé quand `keep_raw = true`.
3. `comfy_runs.cost_usd` diffère de moins de 10 % du coût facturé par Modal pour ces runs.
4. Démarrage à froid ≤ 120 s et génération à chaud ≤ 35 s pour 5 s en 480x832 (référence labo : 50 s à froid,
   22 s à chaud).
5. Une valeur invalide est rejetée en 4xx **avant** tout appel Modal (vérifié par un test : aucun appel réseau).
6. L'annulation pendant l'exécution passe le run à `cancelled` et libère le GPU en moins de 30 s.
7. Un utilisateur non admin ne voit pas le moteur et reçoit 403 s'il force `preferred_engine = comfy:minimax-h3`.
8. Le job apparaît dans la bibliothèque ; les boutons existants overlay et voix fonctionnent sur la sortie.
9. Aucune régression : moteurs existants inchangés, `alphogenai-v2` non redéployé.

## Phase 3 : formulaires générés (Simple / Advanced)

| Livrable | Détail |
|---|---|
| Composant | `components/comfy/manifest-form.tsx` + `components/comfy/widgets/*` (prompt via le composer existant, upload via le panneau d'assets existant) |
| Page | `app/(workspace)/create/comfy/[slug]/page.tsx` (ou intégration dans `create/[mode]`, à décider à l'implémentation selon le code de `origin/main`) |
| Progression | barre par étape (`progress` de `comfy_runs` via realtime), aperçu intermédiaire si ComfyUI en envoie |
| Presets | sauvegarde de jeux de valeurs par utilisateur (réutiliser le pattern `saved-look-payload.ts` s'il convient) |

Critères d'acceptation :

1. Aucun code propre à H3 dans `components/comfy/` (test : recherche de `minimax`, `h3` → 0 résultat).
2. Mode Simple H3 : exactement les 4 champs du manifeste. Mode Advanced : tous les champs déclarés, les champs
   verrouillés en lecture seule.
3. Une requête falsifiée (valeur verrouillée, hors plage, clé inconnue) est rejetée par le serveur (test API).
4. Le libellé « MiniMax H3 » est visible sur la page et sur le job (test qui l'impose), et le test anti-fuite reste vert.
5. Progression visible et mise à jour au moins toutes les 2 s pendant le sampling.

## Phase 4 : conformité H3 (porte obligatoire avant tout utilisateur non admin)

Détail des obligations : annexe A.

| Livrable | Critère d'acceptation |
|---|---|
| Signalement : bouton « Signaler » sur page job, page publique `/v/[id]`, galerie ; table `content_reports` ; file admin `/admin/reports` | Un signalement crée une ligne et notifie l'admin (e-mail Resend existant) ; l'admin peut retirer le contenu (URL désactivée, job masqué) en 1 action |
| Sanctions : compteur d'infractions, suspension | Un utilisateur suspendu reçoit 403 sur `POST /api/jobs` (test) |
| Contrat de modération interchangeable (02 §2.7) : `ModerationProvider`, politiques versionnées, `moderation_events` | Deux adaptateurs au moins (un d'API externe, un auto-hébergé sur Modal, ou un faux fournisseur de test) passent la **même** suite de tests de contrat ; changer de fournisseur = changer une configuration, sans modifier le code appelant |
| Modération des entrées : prompt (existant + contrat) + images d'entrée | Jeu de tests interne : 100 % des cas `block` refusés avant tout appel GPU ; taux de faux positifs mesuré et documenté |
| Modération des sorties : images, ou échantillon d'images de la vidéo | `block` → statut `failed`, code `MODERATION`, sortie non livrée ; `review` → livrée en privé, publication publique refusée jusqu'à revue (test sur galerie, page publique, export social) ; panne du fournisseur → comportement du profil (`fail_closed` pour H3) |
| Liberté créative | Jeu de tests « contenus légitimes » (fiction, horreur, violence non graphique, contenu artistique) : taux de blocage ≤ 2 %, mesuré et publié dans la PR |
| CGU : répercussion de la politique d'usage H3 et lien vers la licence | Texte validé par le propriétaire (D9) ; acceptation enregistrée (date, version) avant le premier run H3 |
| Notice en UI à côté du modèle | « MiniMax H3 » + lien licence + rappel « contenu généré par IA » |
| Mention IA sur les publications | Toute publication sociale d'une sortie H3 contient une mention « généré par IA » (test sur `social-metadata`) ; métadonnée de fichier indiquant la génération par IA (recommandé par la licence) |
| Revue périodique des garde-fous | Procédure écrite (fréquence, responsable) dans `docs/compliance/minimax-h3.md` |

Passage de `comfy:minimax-h3` en `beta` (plans pro, premium) **uniquement** après validation de cette liste par le
propriétaire.

## Phase 5 : Studio admin

| Livrable | Critère d'acceptation |
|---|---|
| `StudioServer` Modal (CPU) + session signée | Non-admin : 403. Jeton expiré : refus. Arrêt automatique après 10 min d'inactivité (mesuré) |
| Import `POST /api/admin/comfy/templates/import` | Le graphe H3 exporté depuis le Studio, réimporté, produit la même empreinte que la version de la phase 1 |
| Éditeur de manifeste admin | Propose toutes les entrées scalaires avec type et plage issus d'`object_info` ; refuse une valeur par défaut invalide |
| Diff de versions | Affiche nodes ajoutés, retirés, paramètres modifiés |
| « Tester dans AlphoGen » | Crée un run admin sur le runner GPU (plafond **0,10 $** par test, accord préalable) |

Coût cible du Studio : ≤ 0,10 $ par heure d'édition (CPU, cf. 07).

## Phase 6 : MOSS-Image (deuxième template, preuve de généricité)

| Livrable | Détail |
|---|---|
| Runtime | `moss-image@1.yaml` : custom nodes `comfyui-kjnodes`, `comfyui_controlnet_aux` (et rgthree seulement si un node d'exécution en a besoin), épinglés au commit ; modèles Comfy-Org/MOSS-Image (SFT int8, Qwen3.5 9B int8, VAE) ; GPU à mesurer (L40S candidat) |
| Template | `workflows/comfy/templates/moss-image/` importé via le Studio |

Critères d'acceptation :

1. **Diff limité** à : un YAML de runtime, un dossier de template, des lignes en base. **0 ligne** modifiée dans
   `modal_app/comfy/*.py`, `lib/comfy/*.ts`, `components/comfy/*` (vérifié sur la PR). Si une modification du
   socle est nécessaire, elle est justifiée et générique (utile à tout template image).
2. Sortie image PNG ou WebP dans R2, visible dans la bibliothèque et sur la page job.
3. Coût mesuré à chaud pour 1024x1024 et choix du GPU documenté (plafond de tests **0,20 $**).
4. Aucun modèle « abliterated » ; licences de chaque fichier inscrites dans le catalogue du runtime.

## Phase 7 : ouverture bêta

Conditions : phases 2 à 4 validées, décision du propriétaire. Critères : taux d'échec < 5 % sur 50 runs réels,
p95 du temps total documenté, coût moyen par run comparé à l'estimation (écart < 20 %), aucun signalement non
traité depuis plus de 48 h.

## Phase 8 et suivantes (conception seulement)

- Entraînement LoRA (cf. 02 §2.9) : nouvelle étude dédiée, licences des entraîneurs vérifiées, budget à part.
- Studio Pro (cf. 03 §3.4) : avis juridique GPL, conteneur par utilisateur, runtime restreint.
- Portefeuille de crédits (D6) : chantier Stripe séparé.

## Budget de tests (D10, validé)

**Plafond global : 3,00 $ jusqu'à MOSS inclus. Aucune dépense n'est engagée sans l'autorisation explicite du
propriétaire, demandée avant chaque lancement.**

Chaque demande d'autorisation indique, poste par poste : construction d'image et téléchargement des modèles
(CPU), démarrage à froid (ComfyUI + chargement des modèles en mémoire GPU), calcul à chaud, fenêtre d'inactivité
avant arrêt, et le total. Après le test, le coût réel est rapporté et comparé à l'estimation.

Estimations (prix H100 0,001097 $/s, mesures du labo ; à froid ≈ 50 s, à chaud ≈ 22 s par clip H3 de 5 s ;
inactivité 60 s par rafale ; L40S ≈ 0,00054 $/s `unknown`, à revérifier) :

| Phase | Contenu | Froid + chargement | Chaud | Inactivité | Autres | Estimation | Plafond |
|---|---|---|---|---|---|---|---|
| 1 | aucun GPU | — | — | — | — | 0 $ | 0 $ |
| 2 | 3 runs H3 en une rafale | 1 × 50 s = 0,055 $ | 2 × 22 s = 0,048 $ | 60 s = 0,066 $ | image + copie des ~42 Go de modèles vers le volume de l'app (CPU, quelques centimes, `unknown`) | ≈ 0,20 $ | 0,30 $ |
| 3 | 3 runs depuis l'UI, en 2 rafales | 2 × 50 s = 0,110 $ | 1 × 22 s = 0,024 $ | 2 × 60 s = 0,132 $ | — | ≈ 0,27 $ | 0,30 $ |
| 4 | modération des sorties (modèle auto-hébergé testé sur des sorties existantes, 2 rafales) | ≈ 0,10 $ (GPU à choisir) | ≈ 0,05 $ | ≈ 0,10 $ | appels d'API externe éventuels (centimes) | ≈ 0,25 $ | 0,50 $ |
| 5 | Studio CPU ~2 h + 2 « Tester dans AlphoGen » H3 | 2 × 50 s = 0,110 $ | — | 2 × 60 s = 0,132 $ | Studio CPU ≈ 0,10 à 0,20 $ (`unknown`) | ≈ 0,40 $ | 0,50 $ |
| 6 | MOSS : 10 images sur L40S + 5 sur H100 (choix du GPU) | ≈ 0,03 $ + 0,05 $ | ≈ 0,08 $ + 0,04 $ | ≈ 0,03 $ + 0,07 $ | téléchargement ~16 Go de modèles (CPU, centimes) | ≈ 0,32 $ | 0,40 $ |
| **Total** | | | | | | **≈ 1,44 $** | **2,00 $** (+ 1,00 $ de réserve) |

L'inactivité pèse autant que le calcul : grouper les tests d'une phase en une seule rafale divise ce poste.
