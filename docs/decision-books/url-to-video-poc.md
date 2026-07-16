# URL → Video — Protocole POC (run sheet)

> Rattaché à [url-to-video.md](./url-to-video.md). Finalistes : **Jogg (MVP) vs Topview (hedge)** ; **Creatify = étalon qualité** (1 vidéo, pas de POC complet).
> Statut : 🟡 **Jogg validé (POC 15 juil. 2026, compte test) — 52/90. Topview/Creatify + coût réel = à faire sur compte production.**

## Résultats — Jogg (POC 15 juil. 2026, compte test)

**Réalisé** : DJI Mini 4 Pro → vidéo via API Jogg (product → create_video_from_product → poll → R2 → ffprobe).
**Sortie** : 1080×1920 (9:16) · H264 High 30 fps · AAC **mono** · **35,83 s** · 18 Mo · [R2](https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev/url-to-video-poc/jogg.mp4). Rendu rapide (quelques min).

**Notes (toi + moi, identiques) — total 52/90** *(coût non mesuré : compte test non facturé)* :
| Critère | Note /10 |
|---|---|
| Compréhension page produit | 8 |
| Choix des images | 7 |
| Storytelling | 7 |
| Respect du script | 4 |
| Respect du branding | 2 |
| Qualité générale | 7 |
| CTA | 3 |
| Envie d'acheter | 6 |
| Temps de génération | 8 |
| Coût réel | À VÉRIFIER (compte prod) |

**Findings (à retenir pour la V1)** :
1. **URL scraping = bon** : vrais visuels DJI (drone, radiocommande RC-N2, lifestyle montagne) + specs captées.
2. ⚠️ **`override_script` NON respecté à la lettre** : Jogg regénère son script (style « Discovery »). → tester **sans `script.style`** / param dédié si script imposé requis.
3. ⚠️ **Branding non appliqué** (ni logo, ni #4F46E5/#06B6D4, ni CTA end-card) → **stamper via overlay Modal T-1111** (rend le provider swappable).
4. **Durée 35,8 s** > 30 cible (`length` = indice) ; **audio mono**.
5. Format 9:16 parfait, captions FR correctes, avatar réaliste mais **décor hors-sujet** (salle de classe).

**À refaire sur compte production** : mesurer le **coût réel/vidéo** ; comparer **Topview** (+ **Creatify** étalon) sur la même URL/constantes ; re-tester l'override du script.

## Résultats — Topview (POC 15 juil. 2026, compte test/free, watermark)

**Réalisé** : DJI Mini 4 Pro via UI web « URL en vidéo » (pilotage extension, pas d'API dispo) → « Use My Script » (script FR forcé) → export watermark → download → R2 → ffprobe.
**Sortie** : 1080×1920 (9:16) · H264 High 30 fps · **AAC stéréo** · **36,12 s** · 33 Mo · [R2](https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev/url-to-video-poc/topview.mp4).

**Verdict UTILISATEUR (audio inclus) : 6 / 100.**
- **VO catastrophique** : voix robotisée mélangeant **français + anglais, accent espagnol** (« Franglais »), **désynchronisée de l'image**.
- **Pas d'avatar** ; rendu = « PowerPoint » de visuels produit + VO plaquée.
- **Watermark « PREVIEW ONLY »** partout (free ; enlevable en Pro).
- **Bug 99%** : l'UI reste bloquée à 99% à chaque étape (analyse URL ~4 min de hang → recharge nécessaire ; export « querying » figé) — vidéo récupérée seulement en allant la chercher dans « Exported videos ». **UX/fiabilité mauvaise.**

> ⚠️ **Correction de mon biais** : mes notes « visuelles seules » (64/90) étaient **trompeuses** — les frames montrent de vraies séquences DJI (belles), mais **sans le son je ne pouvais pas juger la VO**, qui est le cœur d'un ad et qui est ici défaillante. La notation audio de l'utilisateur prime.

**Findings Topview** : ✅ scraping URL riche + « Use My Script » **respecté verbatim** ; ❌ **VO inutilisable**, pas d'avatar, watermark (free), **lenteur + stalls 99% répétés**. Le Capability Consolidation Score / l'avantage coût **ne compensent pas un output inexploitable**.

## Comparatif POC (compte test) — provisoire

| | Jogg | Topview |
|---|---|---|
| Score commun | **52 / 90** | **6 / 100** (verdict user, audio) |
| Scraping URL | bon | riche (mais UI qui stalle) |
| Script imposé | ❌ paraphrasé | ✅ verbatim |
| Voix / VO | correcte (FR) | ❌ Franglais robotisé désync |
| Avatar | ✅ (talking-head) | ❌ (diaporama) |
| Vitesse / fiabilité | ✅ rapide, net | ❌ lent, bug 99% |
| Branding appliqué | ❌ (overlay requis) | ❌ (overlay requis) + watermark free |

**Conclusion provisoire : Jogg >> Topview** sur l'output réel. Reste à valider **Creatify**.

## Résultats — Creatify (POC 16 juil. 2026, compte test/free, watermark)

**Réalisé** : DJI Mini 4 Pro via UI web « Video Ad » (URL→Video) — pilotage extension. Parcours : analyse URL → assets → réglages (9:16/30s/**French**/audience) → **« Use your own script »** (script FR imposé) → avatar (Stefan) → **13 variantes générées** → render (Aurora, 10 crédits) → download.
**Sortie** : 1080×1920 (9:16) · H264 High 30 fps · **AAC stéréo** · **34,01 s** · 13,5 Mo · [R2](https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev/url-to-video-poc/creatify.mp4).

**Verdict UTILISATEUR (audio inclus) : 40 / 100.**
- **Bien meilleur que Topview.** **VO fluide et cohérente** (français *canadien* — détail mineur).
- **Format le plus riche** : avatar en incrustation + b‑roll produit DJI + **captions animées FR verbatim** (mots-clés surlignés) + **13 variantes**.
- ❌ **Défaut rédhibitoire** : le **remplacement fond vert** (compositing avatar/b‑roll) est **raté** — l'image empiète sur le corps de l'avatar → **pas pro** (≠ Jogg propre).
- ⚠️ **Watermark** (free ; Pro pour l'enlever) · rendu **lent** (~5 min, mais fiable, pas de stall) · **10 crédits/rendu** (free = 10 → 1 rendu).

> Rappel biais : mon visuel-seul plaçait Creatify ~69/90 ; l'utilisateur (compositing raté + son) le note 40/100. Le **compositing** et l'**intégration/coût** priment.

## 🏁 VERDICT FINAL POC — classement

| Rang | Provider | Score (user, audio inclus) | Pourquoi |
|---|---|---|---|
| 🥇 | **Jogg** | **80 / 100** | **Vidéo + son nets**, **API sur abonnement GRATUIT** (déjà testé en API), coût faible, rapide/fiable |
| 🥈 | **Creatify** | 40 / 100 | Format le plus riche mais **compositing avatar raté** (pas pro), watermark free, lent, 10 cr/rendu |
| 🥉 | **Topview** | 6 / 100 | VO Franglais robotisé, diaporama, bug 99% |

**GAGNANT POC : Jogg.** Décisif — meilleur output réel **et** meilleure voie d'intégration (**API dispo dès le plan gratuit**, ce qu'on a prouvé end-to-end). Creatify/Topview exigent un plan payant pour l'API.

**Correctifs Jogg avant V1** : (1) ~~script paraphrasé~~ → **résolu comme finding** (voir ci-dessous) ; (2) **branding non appliqué** → overlay Modal T‑1111.

## Retest `override_script` Jogg (16 juil. 2026) — CONCLUSIF

**`override_script` est IGNORÉ** sur `POST /v2/create_video_from_product`. Le `script.style` (obligatoire) **régénère toujours** la copie ; notre script exact n'est jamais utilisé.
- style=`Discovery` + override → paraphrase (« Beaucoup pensent qu'un drone… »)
- **sans `script.style`** → **HTTP code 18001 « script.style required »** (style obligatoire)
- style=`Storytime` + override → **script totalement inventé** (« Défi du jour: capturer une vidéo… Je le déplie, je décolle… Le DJI RC‑N2 rend… »)

**Implication** : sur le flux URL→Video, **on ne contrôle pas le script exact** — Jogg écrit la copie (bonne qualité FR selon l'utilisateur). Options si script imposé requis :
1. **Accepter la copie Jogg** (auto-générée par style) — OK pour un ad produit standard.
2. Utiliser l'endpoint **avatar-video** (script→vidéo, verbatim) MAIS on **perd le b‑roll produit auto** de l'URL (il faut fournir nos visuels).
3. Post-édition / contacter le support Jogg (comportement peut-être bugué vs doc « full control over the narration »).

Ce finding **ne dé-classe pas Jogg** (il a gagné sur vidéo+son nets + API dès le plan gratuit ; sa copie auto est de bonne qualité) — c'est une **limite documentée** à intégrer dans la V1.

**✅ Résolution (confirmée par la doc/app Jogg, 16 juil. 2026)** : pour un **script verbatim**, utiliser l'outil **« Vidéo Avatar » / endpoint *Create Avatar Videos*** (« vidéo d'avatar parlant à partir de n'importe quel script ») → script **exact**, au prix de perdre le **b‑roll produit auto** de l'URL (on fournit les visuels). Deux voies V1 : (a) **URL→Video** = copie auto Jogg (b‑roll produit inclus, script non contrôlé) ; (b) **Avatar Video** = script imposé (visuels à fournir).

## Pricing Jogg vérifié (docs officielles, `[vérifié]`)
Modèle **crédits** — extrait de docs.jogg.ai/pricing :
| Service | Coût |
|---|---|
| **Video Generation** | **1 crédit / 2 min** (vidéo < 2 min = 1 crédit) → **pub 30 s ≈ 1 crédit** |
| AI Scripts | 0,2 cr / appel |
| Preview Video | 0,5 cr / 2 min |
| Lip Sync Video | 1 cr / 125 s (~0,008/s) |
| Video Translation | 0,5 cr / 20 s |
| Photo Avatar | 0,05 cr / image |
> Crédits **débités à la requête** (pas à la fin). Enterprise/volume : support@jogg.ai.
> **Coût unitaire ultra-bas** (≈1 crédit/pub courte) — renforce nettement l'avantage éco de Jogg vs Topview (5 cr/export) et Creatify (10 cr/rendu).

**Consolidation Jogg** (app « Tous les outils ») : URL→Video, **Avatar Video**, Lip Sync, Traduction, Podcast 2.0, Photo Avatar, PPT/PDF→Vidéo, Texte/Image→Vidéo, Extension vidéo, Batch… → couverture large **+ API dès le plan gratuit**. C'est le meilleur combo *coût + intégration + couverture* du panel.

## Audit clé API (16 juil. 2026) — VERDICT CORRIGÉ

- Compte de la clé : `gvnahid292` (email gvn***@gmail.com) — *à confirmer comme compte prod voulu*. Empreinte `sha256[:8]=730d8072`.
- **Intégration Jogg dans le repo : INEXISTANTE** (seules mentions = commentaires « Jogg-like » UX). Rien à réutiliser côté Jogg ; tout à créer minimalement.
- **Endpoints lecture OK (0 crédit)** : `/user/whoami`, `/user/remaining_quota`, `/avatars/public` (627), `/avatars/custom`, `/voices` (113), `/voices/custom` (52), `/musics`, `/visual_styles`, `/templates` (276).
- ⚠️ **`remaining_quota` = 0 en permanence MAIS la génération FONCTIONNE** : test réel `create_video_from_product` accepté (`code 0` → `success` ~32 s, MP4 1080×1920 31,5 s, **sans watermark**), **quota inchangé (0→0)**. → **`remaining_quota` n'est PAS un verrou/jauge fiable** ; ne pas s'en servir comme budget-guard (suivre notre propre compteur dans `jobs.app_state`).
- **Webhooks** : endpoints doc mais **path 404** sur ce compte → **polling** (`/product_video/{id}`, prouvé) comme voie V1.
- **Verdict : 🟢 CLÉ SUFFISANTE POUR V1** (génère, sortie propre, rapide). Prérequis résiduels : confirmer que `gvnahid292` = compte prod voulu (+ éventuelle rotation de clé).

**Chemins REST réels V1** : `POST /product` (gratuit) · `POST /create_video_from_product` (génère) · `GET /product_video/{id}` (polling) · lecture `/voices` `/avatars/public` (défauts) · `GET /user/remaining_quota` (info, non bloquant).

## Carte d'accès API — 3 NIVEAUX DE PREUVE (16 juil. 2026, clé `gvnahid292`)

> ⚠️ **Rigueur** : un POST incomplet renvoyant une *param-error* prouve **endpoint existe + clé authentifiée + requête atteint le validateur** — **PAS** que le plan autorise l'**exécution finale** (l'entitlement peut être contrôlé *après* validation complète du payload). Ne pas confondre les 3 niveaux.

| Niveau | Capacités | Endpoint réel |
|---|---|---|
| **① E2E PROUVÉ (généré)** | **URL→Video** · **AI Script** · **Avatar Video** (script **verbatim** confirmé) | `/create_video_from_product`+`/product_video/{id}` · `/ai_scripts`+`/ai_scripts/results/{id}` · `/create_video_from_avatar`+`/avatar_video/{id}` |
| **② Endpoint + auth prouvés — génération NON prouvée** | **Lip Sync** · **Template Video** · **Traduction** · **Photo Avatar** · **Motion** | `/create_lip_sync_video` · `/create_video_with_template` · `/video_translate/` · `/photo_avatar/photo/generate` · `/photo_avatar/add_motion` |
| **Lecture prouvée (GET)** | avatars pub/custom, voix pub/custom, musiques, visual_styles, templates, whoami, remaining_quota, langues traduction | `GET` (200) |
| **Non documenté en API publique V2** | Podcast 2.0, PPT/PDF→Vidéo, Shooting Photo Produit, Vidéo→Texte, Échange de Visages, Extension Vidéo, Cartoon&Pet, Bébé Parlant, VFX Avatar, Looks d'Avatar, Enregistreur d'écran | — |

- Niveau ② : très **probablement** exécutables (même compte/clé), **mais non démontrés** par une génération valide (Lip Sync/Template/Traduction/Photo Avatar/Motion exigent des inputs spécifiques — vidéo+audio, photo, template mappé — à tester un par un).
- **Avatar Video : E2E CONFIRMÉ (16 juil.)** — `code 0` → `success` ~24 s, MP4 1080×1920, **caption = script verbatim** (`voice.script` respecté, ≠ URL→Video). C'est la **voie script-imposé** (talking-head sans b-roll produit).
- « Non documenté » ≠ « impossible » : **aucun endpoint correspondant dans l'API publique V2 ; disponibilité Enterprise/custom inconnue.**

### ⚠️ Corrections de rigueur (contredisent mes affirmations précédentes)
1. **Le payant DÉBLOQUE bien des features** (page officielle [jogg.ai/api-pricing](https://www.jogg.ai/api-pricing/)) : **Free API** = Avatar Video + AI Scripts (watermark) ; **Advanced 99 $/mo** ajoute **URL→Video + Templates** ; **Professional 399 $/mo** ajoute **Photo Avatar** ; **Enterprise** ajoute **Custom Avatar** + custom. → Mon « le payant ne débloque aucun outil » **était FAUX**. Notre clé a un **entitlement spécial/promo/legacy** (trial offert) — **non généralisable** aux clés gratuites standard.
2. **`quota = 0` qui génère ≠ gratuité illimitée**. À traiter comme **temporaire et NON contractuel** (quota promo non exposé / essai non compté / droits compte / facturation différée). Ne **pas** bâtir le business plan dessus.
3. **Coût contractuel de référence V1** = plan **Advanced ≈ 0,99 $/vidéo ≤ 2 min** (avant previews/scripts éventuels) — **pas** la gratuité quota-0.

### Verdict corrigé sur la clé
🟢 **CLÉ ACTUELLE SUFFISANTE POUR LA V1 (URL→Video + AI Script + Avatar Video)** — les 3 prouvés E2E.
🟡 Accès final aux **5** autres moteurs (Lip Sync/Template/Traduction/Photo Avatar/Motion) = **très probable, non encore démontré** par une génération valide.
🔵 Test vs payant : **la surface d'endpoints observée est plus large que le plan Free officiel** (entitlement spécial de cette clé) — **ne pas généraliser**.

---


## Constantes figées (identiques pour tous)

| Paramètre | Valeur |
|---|---|
| **Produit** | DJI Mini 4 Pro |
| **URL de référence** | https://store.dji.com/product/dji-mini-4-pro |
| **Durée** | 30 s |
| **Format** | 9:16 — **1080 × 1920** |
| **Langue** | Français |
| **Audience** | Créateurs de contenu · voyageurs · débutants · professionnels |
| **Musique** | Énergique · moderne · inspirante · **sans paroles** |

**Script imposé (override obligatoire — ne pas laisser le provider en générer un autre)** :
> Découvrez le DJI Mini 4 Pro, le drone ultra léger qui transforme chacune de vos idées en images spectaculaires. Grâce à sa caméra 4K HDR, ses capteurs d'évitement d'obstacles à 360 degrés et son autonomie prolongée, capturez des vidéos professionnelles en toute simplicité. Que vous soyez créateur de contenu, voyageur ou passionné de photographie, le Mini 4 Pro vous accompagne partout pour révéler votre créativité. Prenez de la hauteur et filmez le monde autrement avec DJI.

**CTA** : « Découvrez le DJI Mini 4 Pro dès aujourd'hui. »

**Branding** :
- Nom : **AlphoGenAI** · Logo : logo officiel si dispo, **sinon texte « AlphoGenAI »**.
- Couleurs : Primaire **#4F46E5** · Secondaire **#06B6D4** · Texte **#FFFFFF** · Fond **#0F172A**.
- Police : **Inter** · Style : moderne · premium · minimaliste · tech.

> ⚠️ Si un provider ne permet pas d'imposer logo/CTA/couleurs, on **stampe la marque via notre overlay Modal (T-1111)** — même overlay pour les deux → comparaison branding équitable + provider swappable.

## Déroulé (identique par provider)

1. Soumettre : URL + **script imposé** + durée 30 s + 9:16 1080×1920 + FR + brief musique.
2. Récupérer le MP4 (webhook si dispo, sinon polling) → **upload R2** (`url-to-video-poc/<provider>.mp4`).
3. **ffprobe** : durée / résolution / codecs / fps / audio / taille.
4. Relever : **temps de génération réel** + **coût crédits→€ réel** pour cette vidéo.
5. Noter selon la grille ci-dessous.

Règle : mêmes entrées, aucun réglage avantageant un provider. Une seule vidéo par provider.

## Grille de notation (/10 chacun → /100)

| Critère | Jogg | Topview | Creatify (étalon) |
|---|---|---|---|
| Compréhension de la page produit | /10 | /10 | /10 |
| Choix des images | /10 | /10 | /10 |
| Storytelling | /10 | /10 | /10 |
| Respect du script | /10 | /10 | /10 |
| Respect du branding | /10 | /10 | /10 |
| Qualité générale | /10 | /10 | /10 |
| CTA | /10 | /10 | /10 |
| Envie d'acheter | /10 | /10 | /10 |
| Temps de génération | /10 | /10 | /10 |
| Coût réel | /10 | /10 | /10 |
| **Total** | **/100** | **/100** | **/100** |

## Données objectives à consigner (hors notation subjective)

| Mesure | Jogg | Topview | Creatify |
|---|---|---|---|
| Temps génération réel (s) | | | |
| Coût réel (crédits → €) | | | |
| ffprobe (durée/résol/codecs/taille) | | | |
| Intégration : webhook / polling | | | |
| Contrôle specs (durée/format/branding forcés ?) | | | |
| Fidélité URL (image/prix/claims produit) | | | |

## Ce qu'il faut pour EXÉCUTER (gating — en attente)

1. **Comptes + clés API** Jogg et Topview (+ Creatify pour l'étalon). *(À VÉRIFIER : lesquels sont déjà ouverts ?)*
2. **Mode d'exécution** : (a) Claude appelle les APIs (nécessite les clés + ton go pour écrire le client d'appel) **ou** (b) tu génères manuellement dans chaque UI et me fournis les 3 MP4 (je fais ffprobe + R2 + compilation des scores).
3. **Notation subjective** (storytelling, envie d'acheter, branding) : qui note — toi (œil humain) et/ou moi depuis la vidéo rendue ? (recommandé : les deux, moyenne.)

*Aucun code / appel API tant que 1–3 ne sont pas tranchés.*
