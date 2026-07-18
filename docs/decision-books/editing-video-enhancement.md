# Capability Decision Book — Editing / Video Enhancement

> Statut : ✅ **DIRECTION FIGÉE** (POC exécuté + coût réel vérifié, 17 juil. 2026) — assemblage complémentaire, pas de provider unique. Aucun code (dev V1.1 = nouveau GO).
> Date : **16–17 juil. 2026** · Workflow : **✂️ Editing / Video Enhancement** · Voir [README](./README.md).
> **La direction figée est en tête ci-dessous** ; le benchmark détaillé (7 acteurs) suit comme analyse de fond.
> Toutes les données proviennent de **sources officielles** (docs/API/SDK/CGU). Tout ce qui n'a pas pu être vérifié sur une source officielle est marqué **À VÉRIFIER** — aucune supposition.

## Objectif
Déterminer le meilleur **moteur d'édition/enhancement vidéo IA** pour AlphoGenAI : **modifier une vidéo existante sans la régénérer entièrement** (corriger une phrase, retirer les « euh »/silences, nettoyer l'audio, sous-titrer, traduire, lip-sync, Eye Contact…). Le benchmark porte sur la **capability « Video Enhancement »**, pas sur un provider donné.

## Périmètre
Acteurs benchmarkés (pertinents pour un SaaS) : **Descript, VEED, Adobe Premiere Pro (IA), Captions, Riverside, Kapwing, Wisecut**. Descript est déjà audité en profondeur cette session (clé testée, endpoints réels) — voir [editing-enhancement-descript-audit.md](./editing-enhancement-descript-audit.md).

Prisme de décision (SaaS rentable) : **API headless intégrable > couverture de fonctions**. Priorités : simplicité, faible coût, faible maintenance, **réutilisation**, ROI, qualité. Le meilleur n'est pas celui qui a le plus de fonctions, mais celui qu'on peut **orchestrer par API** avec le moins de code.

---

## Direction figée — POC exécuté + coût réel vérifié (17 juil. 2026)
**Décision produit actée : architecture COMPLÉMENTAIRE, pas un provider unique.** Le POC comparatif a montré que Descript et VEED ne jouent pas le même rôle ; la répartition ci-dessous optimise le ROI sur le forfait VEED existant + Descript pour la précision + fal.ai uniquement pour le lip-sync.

### Faits vérifiés (sources officielles + compte utilisateur)
- **Forfait VEED du compte = Pro « Legacy »** (~R$408/an ≈ ~75 $/an) : **« vidéos illimitées dans Gen-AI Studio »** + 15+ outils IA, Brand kit, Clips, **4h traductions/an**, **144h/an AI Voice**.
- **API-only (HORS forfait → fal.ai à l'usage)** : Fabric, **Lip Sync / Lip Sync 2.0**, Subtitle API, Background Removal, Green Screen, Live Avatar.
- **Inclus au forfait (app, illimité Studio)** : Eye Contact AI, Remove Background Noise (video/audio), Auto Subtitles/Captions, Video/Audio to Text (transcription), Video Translator / Dubbing AI, AI Voice/TTS, Video/Audio Editor.
- **Descript** : édition d'une vidéo existante **par API** (agent Underlord) prouvée E2E ; correction de phrase par overdub voix ~**16,6 crédits/édition** ; **pas de lip-sync** (ne ré-anime pas les lèvres importées).
- **Lip Sync API VEED (fal.ai)** : **0,40 $/min**.

### POC lip-sync — prouvé E2E (17 juil. 2026)
Pipeline **« Descript édite → VEED Lip Sync (fal.ai) re-sync les lèvres »** validé bout-en-bout sur talking-head :
- source (erreur plantée) → **Descript** (phrase corrigée « trois kilos »→« 249 grammes » + « euh » retiré + silence réduit, mais lèvres désync) → **VEED Lip Sync 2.0** (lèvres ré-alignées — validé à l'œil par l'utilisateur).
- Coût lip-sync mesuré : ~**0,08 $** pour 12 s. Verdict talking-head : **B (Descript seul) → A (combo)**.
- Clips (R2) : `…/poc-editing/source.mp4`, `…/corrige.mp4`, `…/veed_lipsynced.mp4`.

### Répartition figée (chaque outil sur son terrain de meilleur ROI)
| Besoin | Moteur retenu | Modèle de coût |
|---|---|---|
| Enhancement courant (Eye Contact, denoise, sous-titres, transcription, dubbing, TTS) | **VEED forfait** (app, illimité Studio) | **~0 marginal** — automatisation façon worker web (pattern Podcast) |
| Correction de phrase précise (overdub voix, édition par transcription) | **Descript API** | ~16,6 cr/édition (quand la précision le justifie) |
| **Lip-sync** segments visage | **VEED Lip Sync API (fal.ai)** | 0,40 $/min à l'usage — **seule voie** (non incluse au forfait) |
| Réserve (tout-en-un, meilleure qualité, mais pas d'API pilotable) | **Riverside** | — |

### Garde-fous & vigilance
- Le plan VEED **« Legacy »** est avantageux mais **peut évoluer** (déjà arrivé) → garder l'archi **swappable** (overlay + brique isolée), même logique que la clé test Jogg. On n'est « à l'abri de rien », y compris sur tout autre outil.
- **Volume lip-sync/an = à mesurer** (ligne fal.ai à l'usage) — sans impact tant qu'il reste ponctuel ; bascule à évaluer si le volume explose.
- **Pas de gagnant unique** : c'est un **assemblage** assumé, pas un mono-provider.

### Prochaine étape (hors périmètre de ce gel)
Dev **V1.1 Editing** = orchestrer cet assemblage (**nouveau GO requis**) : réutiliser `jobs`/R2 + worker web (VEED forfait) + `lib/descript-client` (édition API) + lip-sync fal.ai. **Aucun code écrit ici.**

---

## Benchmark mondial — lecture transversale (le fait décisif)
La question qui tranche pour un SaaS hébergé : **« peut-on ÉDITER une vidéo existante par API officielle, en headless ? »**

| Provider | Éditer une vidéo existante **via API** ? | Nature réelle de l'API |
|---|---|---|
| **Descript** | ✅ **OUI** | REST publique : agent Underlord (filler/silence/Studio Sound/captions/overdub/traduction) + publish/export |
| **VEED** | ⚠️ **Partiel** | API = **primitives** headless (Lip Sync, Subtitles, Background Removal, Fabric) via fal.ai — **pas** le montage par transcription |
| **Captions** | ❌ Non (édition) | API = **AI Creator** (génère une vidéo depuis un script), pas d'édition d'une vidéo existante |
| **Adobe Premiere** | ❌ Non | Édition IA **desktop-only** ; API Firefly **séparée** (TTS, Translate&LipSync, Reframe) sans montage-transcription |
| **Riverside** | ❌ Non | API Business = **récupération d'assets** (list/download/delete) ; interdit d'embarquer/automatiser l'édition |
| **Kapwing** | ❌ Non | **Pas d'API REST publique** — seulement un SDK de plugins in-app (bêta, sur formulaire) |
| **Wisecut** | ❌ Non (self-serve) | API **Enterprise/custom** uniquement ; **revente interdite** par CGU |

➡️ **Conclusion structurante** : pour de l'édition *pilotée par API*, **Descript est aujourd'hui seul de sa catégorie**. Les autres sont soit d'excellents **outils applicatifs** (édition manuelle/humaine, non orchestrable), soit des **API de génération** (pas d'édition). Cela oriente fortement la sélection des finalistes.

---

## Fiches providers

### 1) Descript 🥇 (finaliste A)
Éditeur vidéo/audio par transcription + agent IA **Underlord**, avec **API REST publique**.
- **Capabilities (API vérifiée)** : édition par transcription ✅ · modifier une phrase ✅ (agent) · filler words + silences ✅ · **Studio Sound (nettoyage audio)** ✅ · amélioration voix ✅ (Studio Sound) · sous-titres ✅ · traduction ✅ · overdub ✅ · remplacement de voix ✅ (Underlord) · **lip-sync après modif** ✅ (dubbing/lip-sync Underlord) · **Eye Contact** ❌ **À VÉRIFIER** (non listé) · export ✅ **via publication** (`/jobs/publish` → `download_url`, ≤ 4K, sans watermark mentionné ; **pas d'export local direct**).
- **Intégration** : **API** REST `https://descriptapi.com/v1`, auth **Bearer**, rate limit **1000/h** · **MCP officiel** (Claude/ChatGPT) ✅ · **Zapier** ✅ · SDK À VÉRIFIER · SaaS ✅ · **multi-tenant** = token **mono-drive** (1 token = 1 drive) → multi-tenant possible par token/drive, **à confirmer** · white-label À VÉRIFIER.
- **Prix** : Free (100 cr one-time) / Hobbyist 16–24 $ (400 cr) / **Creator 24–35 $ (800 cr, top-ups OK)** / Business 50–65 $ (1500 cr). Job agent ~**32 cr** (exemple doc). 402 si crédits/minutes épuisés.
- **Avantages** : seule **édition-via-API** complète ; async + `callback_url` (webhooks) → colle au pattern `jobs`/cron/R2 existant ; sortie sans watermark ; MCP + Zapier.
- **Limites** : **coût crédits/action à chiffrer** (P0) ; pas d'export local (passer par publish) ; token mono-drive ; import ≤ 1 Go ; historique jobs 30 j ; YouTube URL non supportée en import ; **pas d'Eye Contact**.
- **Business Score : ~82/100** · **ROI : élevé** (remplace de la post-prod manuelle par 1 client REST).
- Sources : [docs.descriptapi.com](https://docs.descriptapi.com/) · [Descript API help](https://help.descript.com/hc/en-us/articles/43370311322509-Descript-API) · [pricing](https://www.descript.com/pricing).

### 2) VEED 🥇 (finaliste B)
Éditeur vidéo web complet + **API de primitives** (servie via fal.ai). **Déjà intégré chez nous** (Podcast, `lib/veed-fabric-client.ts`).
- **Capabilities app** : transcription ✅ · modifier une phrase ✅ (trim/réarrange ; ajout de mots via TTS) · filler + silences ✅ · **Eye Contact** ✅ · nettoyage audio ✅ (AI Voice Cleaner) · amélioration voix ✅ (idem) · sous-titres ✅ (125+ langues) · traduction ✅ (29 langues) · overdub ⚠️ Partiel (TTS) · **voice clone** ✅ · **lip-sync** ✅ · export ✅ MP4 H.264, sans watermark sur Lite/Pro/Enterprise (résolutions par tier **À VÉRIFIER**).
- **Capabilities API (headless, via fal.ai)** : **Lip Sync 2.0** ✅ · **Subtitles** ✅ · **Background Removal / Green Screen** ✅ · **Fabric 1.0** (image→vidéo) ✅. ⚠️ **Le montage par transcription / filler / Eye Contact ne sont PAS exposés par l'API** (app-only).
- **Intégration** : **API** usage-based via **fal.ai** (SDK Node/Python/HTTP) ✅ · portail `documentation.veed.io` **À VÉRIFIER** (DNS non résolu au test) · MCP ❌ · Zapier/Make À VÉRIFIER · SaaS ✅ · multi-tenant par workspace **À VÉRIFIER** · white-label À VÉRIFIER (Brand Kit ≠ white-label).
- **Prix** : abonnement Free / Lite ~19 $ / Pro ~29–49 $ / Enterprise (**montants exacts À VÉRIFIER**, table JS non rendue). **API pay-per-use** : Lip Sync **~0,40 $/min** (0,07 $/s), Subtitles 0,10–0,40 $/min, Fabric 0,08–0,20 $/s, BG removal 0,008–0,0225 $/30 frames.
- **Avantages** : **réutilisation** (déjà câblé) → « delete more than you add » ; API **pay-per-use sans siège** (0 abonnement pour les primitives) ; primitives utiles (lip-sync/sous-titres) directement orchestrables ; app riche en repli.
- **Limites** : l'**édition par transcription/Eye Contact = app-only** (nécessiterait un worker web comme le Podcast VEED, pas une API) ; base URL/auth propres VEED À VÉRIFIER (dépendance fal.ai).
- **Business Score : ~73/100** · **ROI : élevé** sur les primitives + réutilisation ; faible pour l'édition-transcription (pas d'API).
- Sources : [veed.io/api](https://www.veed.io/api) · [lip-sync-api](https://www.veed.io/tools/lip-sync-api) · [text-based editing](https://www.veed.io/tools/text-based-video-editing) · [eye-contact](https://www.veed.io/tools/eye-contact-ai) · [pricing](https://www.veed.io/pricing).

### 3) Riverside 🥉 (réserve)
Studio d'enregistrement HD à distance + **couche d'édition IA la plus impressionnante** du panel (VideoDub).
- **Capabilities app** : transcription ✅ · **modifier une phrase sans refaire la vidéo** ✅ **VideoDub** (corrige le texte → régénère l'audio **dans la même voix, lip-syncé**) · filler + silences ✅ · **Eye Contact** ✅ · Magic Audio ✅ · sous-titres ✅ · **traduction/dubbing** ✅ (Business, 30+ langues, voix préservée, ~20 min de traitement / min de vidéo) · overdub ✅ (VideoDub) · voice clone ✅ (dans VideoDub/Translation) · lip-sync ✅ · export ✅ ≤ 4K (Free 720p + watermark).
- **Intégration** : **API Business restreinte** = list productions/recordings, **download**, delete, webhooks webinar. **N'expose PAS** : liste des clips exportés, automatisations, **construction d'intégrations/apps, embarquement dans un autre produit**. Base `/api/v3/`, Bearer, **Business/Enterprise only** (clé via CSM). SDK À VÉRIFIER · MCP À VÉRIFIER · **Zapier ✅** · white-label À VÉRIFIER · CGU (resale/API) **À VÉRIFIER** (pages ToS en 403 au fetch).
- **Prix** : Free / **Pro 24–29 $** / Grow 34–39 $ / Webinar 79–99 $ / **Business custom (API incluse)**.
- **Avantages** : **meilleure qualité d'édition** (VideoDub = régénération de phrase + voix + lip-sync, unique) ; Eye Contact ; dubbing préservant la voix.
- **Limites** : **l'API ne pilote PAS l'édition** (récupération d'assets seulement, embarquement interdit) → non orchestrable en headless aujourd'hui ; API gated Business ; positionnement « recording studio » d'abord.
- **Business Score : ~52/100** · **ROI : faible en API-first** (élevé en usage manuel/premium).
- Sources : [riverside.com/ai](https://riverside.com/ai) · [video-editor](https://riverside.com/video-editor) · [Business API](https://support.riverside.fm/hc/en-us/articles/9068592900381-Riverside-Business-API) · [pricing](https://riverside.com/pricing).

### 4) Captions (Mirage)
Éditeur mobile/IA orienté shorts ; **API = génération** (AI Creator), pas édition.
- **Capabilities app** : filler/silences ✅ · **Eye Contact** ✅ (réputé) · denoise ✅ · sous-titres ✅ (cœur) · traduction/dubbing ✅ (lip-sync inclus) · AI Twin/voice clone ⚠️ Partiel · transcription ⚠️ (édition par prompt/chat, transcript-word À VÉRIFIER) · modifier une phrase **À VÉRIFIER** · overdub **À VÉRIFIER** · export ⚠️ (watermark free/paid **À VÉRIFIER**).
- **Intégration** : **API = « AI Creator »** (script → vidéo), base `https://api.captions.ai/api`, auth **`x-api-key`**, 1 cr/s, script ≤ 800 car., vidéo ≤ 1 min. **N'expose PAS l'édition** d'une vidéo existante. SDK ❌/À VÉRIFIER · MCP ❌/À VÉRIFIER · Zapier À VÉRIFIER · programme « Build with Captions » (multi-tenant implicite, white-label **À VÉRIFIER**).
- **Prix** : Free / **Max 24,99 $ (500 cr)** / Scale 69,99–279,99 $. Enterprise custom.
- **Avantages** : Eye Contact + dubbing lip-sync réputés ; API simple (mais de **génération**).
- **Limites** : **API ne fait pas d'édition** de vidéo existante (hors périmètre du besoin) ; SDK/MCP absents ; export/CGU partiels.
- **Business Score : ~57/100** · **ROI** : bon pour *générer*, faible pour *éditer* (notre besoin).
- Sources : [captions.ai/overview](https://captions.ai/overview) · [AI Creator API](https://captions.ai/help/api-reference/ai-creator) · [eye contact](https://help.mirage.app/docs/visual/eye-contact) · [pricing](https://captions.ai/pricing).

### 5) Adobe Premiere Pro (IA) + Firefly
NLE desktop de référence ; édition IA **non exposée en API**.
- **Capabilities (desktop)** : Text-Based Editing ✅ · modifier une phrase ✅ (montage timeline) · filler/pauses ✅ · **Enhance Speech (denoise/voix)** ✅ · captions ✅ · traduction de **captions** ✅ (texte, 27 langues ; **pas** de dubbing audio en desktop) · Eye Contact ❌ · overdub ❌ · voice clone ❌ · lip-sync ❌ (desktop). 
- **API Firefly Services (séparée, headless)** : **Translate & Lip Sync** ✅ · **Text-to-Speech** ✅ · **Text-to-Avatar** ✅ · **Reframe** ✅ · Dynamic Graphics/MOGRT ✅ — **mais aucun** montage-transcription / Enhance Speech / filler removal en API.
- **Intégration** : **pas d'API headless pour l'édition Premiere** (extensible **plugins in-app** UXP/CEP/C++ only) · Firefly = API REST job-based (crédits org, **pricing entreprise custom**) · MCP À VÉRIFIER · Zapier À VÉRIFIER · **desktop-only, non multi-tenant, non white-label**.
- **Prix** : abonnement Creative Cloud (**montants À VÉRIFIER**) ; Firefly = crédits ; Firefly Services = **custom entreprise**.
- **Avantages** : qualité Enhance Speech ; écosystème ; Firefly Translate&LipSync solide en API (mais séparé).
- **Limites** : **édition IA impossible en headless/SaaS** (desktop) ; Firefly ne couvre pas le montage-transcription ; coût/contrat entreprise.
- **Business Score : ~43/100** · **ROI : faible** pour un SaaS API-first.
- Sources : [Text-Based Editing](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/detect-and-delete-pauses-in-transcripts.html) · [Enhance Speech](https://helpx.adobe.com/premiere/desktop/add-audio-effects/adjust-volume-and-levels/enhance-speech.html) · [Firefly Audio/Video API](https://developer.adobe.com/audio-video-firefly-services/).

### 6) Kapwing
Éditeur IA web très complet ; **pas d'API REST publique**.
- **Capabilities app** : transcription ✅ · filler/silences ✅ · **Eye Contact** ✅ · denoise ✅ · sous-titres ✅ (99 %) · traduction/dubbing ✅ (100+/40+ langues) · **voice clone** ✅ (Business) · **lip-sync** ✅ · modifier une phrase ⚠️ (trim transcript) · overdub ⚠️ Partiel (TTS) · export ✅ (Free watermark/720p/≤1 min ; Pro 4K sans watermark).
- **Intégration** : **pas d'API REST publique** — seulement **SDK de plugins** in-app (`@kapwing/plugin-helpers`, bêta, sur formulaire) ; le modèle est « embarquer un plugin *dans* Kapwing », **pas** piloter Kapwing depuis l'extérieur. MCP ❌ · Zapier À VÉRIFIER · **white-label non trouvé** (contrairement à l'attendu) À VÉRIFIER.
- **Prix** : Free / **Pro 16–24 $ (1000 cr)** / Business 50–64 $ (4000 cr, voice clone+lip-sync) / Enterprise.
- **Avantages** : couverture fonctionnelle très large, qualité correcte, sous-titres 99 %.
- **Limites** : **non orchestrable par API** (bloquant pour nous) ; white-label non confirmé.
- **Business Score : ~48/100** · **ROI : faible** en API-first (excellent en usage manuel).
- Sources : [ai/overview](https://www.kapwing.com/ai/overview) · [plugins](https://www.kapwing.com/plugins) · [dubbing/lip-sync](https://www.kapwing.com/ai/dubbing/lip-sync) · [pricing](https://www.kapwing.com/pricing).

### 7) Wisecut
Éditeur **automatique** (long → court) par reconnaissance vocale ; périmètre plus étroit.
- **Capabilities app** : **suppression des silences** ✅ (Autocut) · denoise + auto-duck musique ✅ · **Studio Voice (amélioration voix)** ✅ · sous-titres ✅ · **traduction de sous-titres** ✅ (texte only, **pas** de dubbing audio) · transcription/édition-texte **À VÉRIFIER** · **filler words À VÉRIFIER** · **Eye Contact ❌/À VÉRIFIER** · overdub/voice clone/lip-sync **❌/À VÉRIFIER** · export ✅ (download **payant**, watermark **À VÉRIFIER**).
- **Intégration** : API **Enterprise/custom only** (`dev.wisecut.ai` non lisible → base/auth **À VÉRIFIER**) · SDK/MCP À VÉRIFIER · Zapier À VÉRIFIER (YouTube Autopilot officiel) · **CGU : REVENTE INTERDITE** (« you will not resell or sublicense ») → **bloquant multi-tenant/white-label**.
- **Prix** : Free (30 min/mois, pas de download) / Starter 15,75 $ / Starter+ 23,25 $ / Professional 75,67 $ / Professional+ 83,25 $ / Autopilot dès 49 $ / Enterprise custom.
- **Avantages** : automatisation « one-click » long→court, silence-cut solide.
- **Limites** : **couverture étroite** (pas d'Eye Contact/voice clone/lip-sync/dubbing audio confirmés) ; **API non self-serve** ; **revente interdite** (rédhibitoire pour un SaaS multi-tenant).
- **Business Score : ~37/100** · **ROI : faible** pour notre besoin.
- Sources : [wisecut.ai](https://www.wisecut.ai/) · [pricing](https://www.wisecut.ai/pricing) · [customer agreement](https://www.wisecut.ai/wisecut-customer-agreement).

---

## Comparaison des capabilities
Légende : ✅ oui · ⚠️ partiel · ❌ non · ❔ À VÉRIFIER. **(app)** = capacité présente mais **app-only** (non exposée en API).

| Capability | Descript | VEED | Riverside | Captions | Adobe | Kapwing | Wisecut |
|---|---|---|---|---|---|---|---|
| **API édite une vidéo existante (headless)** | ✅ | ⚠️ primitives | ❌ | ❌ (génère) | ❌ | ❌ | ❌ |
| Édition par transcription | ✅ | ✅ (app) | ✅ (app) | ⚠️❔ | ✅ (desktop) | ✅ (app) | ❔ |
| Modifier une phrase sans refaire la vidéo | ✅ | ⚠️ (app) | ✅ VideoDub (app) | ❔ | ✅ (desktop) | ⚠️ (app) | ❔ |
| Suppression « euh »/silences | ✅ | ✅ (app) | ✅ (app) | ✅ (app) | ✅ (desktop) | ✅ (app) | ✅ silences |
| Eye Contact | ❌❔ | ✅ (app) | ✅ (app) | ✅ (app) | ❌ | ✅ (app) | ❌❔ |
| Nettoyage audio | ✅ Studio Sound | ✅ (app) | ✅ Magic Audio | ✅ (app) | ✅ Enhance Speech | ✅ (app) | ✅ |
| Amélioration voix | ✅ | ✅ (app) | ⚠️ | ❔ | ✅ | ⚠️ | ✅ Studio Voice |
| Sous-titres automatiques | ✅ | ✅ / **API** | ✅ (app) | ✅ (app) | ✅ (desktop) | ✅ (app) | ✅ |
| Traduction | ✅ | ✅ (app) | ✅ (Business) | ✅ (app) | ⚠️ captions only | ✅ (app) | ⚠️ sous-titres only |
| Overdub | ✅ | ⚠️ | ✅ VideoDub | ❔ | ❌ | ⚠️ | ❔ |
| Remplacement de voix / clone | ✅ | ✅ (app) | ✅ (app) | ⚠️ | ❌ | ✅ (app) | ❌❔ |
| Lip-sync après modification | ✅ | ✅ / **API** | ✅ (app) | ✅ (app) | ⚠️ Firefly API | ✅ (app) | ❔ |
| Export sans watermark | ✅ (publish) | ✅ (payant) | ✅ (payant) | ❔ | ✅ | ✅ (payant) | ❔ |
| **API** publique self-serve | ✅ | ✅ (primitives) | ⚠️ Business (assets) | ✅ (génération) | ⚠️ Firefly (séparé) | ❌ | ⚠️ Enterprise |
| **MCP** officiel | ✅ | ❌ | ❔ | ❌ | ❔ | ❌ | ❔ |
| **Zapier**/connecteurs | ✅ | ❔ | ✅ | ❔ | ❔ | ❔ | ⚠️ YouTube |
| Multi-tenant / white-label | ⚠️ token/drive | ❔ | ❔ | ⚠️ | ❌ | ❔ | ❌ revente interdite |
| **Business Score (indicatif)** | **~82** | **~73** | ~52 | ~57 | ~43 | ~48 | ~37 |

> Méthode Business Score (pondération SaaS) : API headless intégrable 30 · Coût/ROI 20 · Effort intégration/réutilisation 15 · Couverture enhancement 15 · CGU multi-tenant/resale 10 · Qualité 10. **Scores indicatifs** (plusieurs prix/CGU restent À VÉRIFIER).

---

## Décision — finalistes (PAS de gagnant)

### 🥇 Finaliste A — **Descript**
Le **seul** à offrir une **édition de vidéo existante pilotée par API** (agent Underlord : filler/silence, Studio Sound, sous-titres, overdub, traduction) + **MCP** + **Zapier** + async/webhooks qui **collent au pattern `jobs`/cron/R2** déjà en place. C'est le candidat naturel du workflow « modifier sans régénérer ». Réserve : coût crédits/action à chiffrer, pas d'Eye Contact.

### 🥇 Finaliste B — **VEED**
Choisi pour **réutilisation** (déjà intégré, `lib/veed-fabric-client.ts`) et pour ses **primitives API pay-per-use** (Lip Sync 2.0, Subtitles, Background Removal) **sans coût de siège** — idéales pour compléter Descript sur le lip-sync/sous-titres/traduction. L'édition-transcription/Eye Contact restent app-only (repli worker web comme le Podcast). Meilleur ratio *coût + réutilisation* du panel après Descript.

### 🥉 Réserve — **Riverside**
Retenu comme réserve pour la **qualité d'édition la plus élevée** (VideoDub : régénère une phrase dans la même voix, lip-syncé + Eye Contact). **Bloquant actuel** : l'API ne pilote pas l'édition (récupération d'assets seulement, embarquement interdit). À **re-évaluer** s'ils ouvrent une API d'édition, ou pour un usage premium/manuel.

**Écartés (avec raison factuelle)** :
- **Captions** — API = génération (AI Creator), pas d'édition d'une vidéo existante.
- **Adobe Premiere** — édition IA desktop-only, non headless ; Firefly ne couvre pas le montage-transcription.
- **Kapwing** — pas d'API REST publique (SDK de plugins in-app only).
- **Wisecut** — couverture étroite + API non self-serve + **revente interdite** (CGU).

> Angle réutilisation (rappel interne, hors benchmark) : **HeyGen** (déjà intégré) fournit aussi **traduction + lip-sync** par API — utile si on veut ces primitives sans ajouter VEED. À considérer au moment du POC.

---

## Protocole POC (identique pour les finalistes — Descript vs VEED)
> À exécuter **seulement sur validation** (ce Decision Book n'inclut aucun POC). But : mesurer, sur une **même vidéo** avec une **même erreur volontaire**, la capacité de **correction sans régénération** et l'**effort d'intégration réel**.

### Constantes figées (identiques)
- **Vidéo source** : 1 clip talking-head **FR de 30 s**, 1080×1920 (réutiliser une sortie avatar existante, ex. le MP4 URL→Video ou un clip podcast).
- **Erreurs volontaires plantées** (identiques pour les 2) :
  1. une **phrase fautive** (ex. « le drone pèse **trois kilos** » → corriger en « **249 grammes** ») ;
  2. **3 filler words** (« euh », « heu ») + **2 silences** > 1,5 s ;
  3. **bruit de fond** léger sur l'audio ;
  4. **regard hors caméra** sur ~5 s (test Eye Contact).
- **Correction demandée (identique)** : corriger la phrase (même voix), retirer filler+silences, nettoyer l'audio, corriger l'Eye Contact, ajouter des **sous-titres FR**.
- **Même voix** (voix d'origine préservée), **même durée cible**, **même format**.

### Voie d'exécution par provider (à documenter honnêtement)
- **Descript** : tout par **API** (`/jobs/import/project_media` → `/jobs/agent` prompt « remove filler words and silences, add Studio Sound, add captions, fix the sentence X→Y » → `/jobs/publish` → download). *Eye Contact non dispo → marquer N/A.*
- **VEED** : primitives **API** possibles (Subtitles, Lip Sync) ; **filler/transcript/Eye Contact = app-only** → soit worker web (comme Podcast VEED), soit marquer **N/A-API**. Documenter la part API vs manuelle.

### Grille de mesure (identique)
| Critère | Descript | VEED |
|---|---|---|
| Qualité de correction (phrase) | /10 | /10 |
| Naturalité (voix régénérée) | /10 | /10 |
| Synchronisation labiale | /10 | /10 |
| Correction Eye Contact | /10 ou N/A | /10 ou N/A |
| Suppression des « euh »/silences | /10 | /10 |
| Qualité audio (après nettoyage) | /10 | /10 |
| Temps de traitement réel (s) | | |
| Coût réel (crédits/€ ou $/min) | | |
| Facilité d'intégration (API vs app/worker) | /10 | /10 |
| **Modifier UNIQUEMENT une partie** de la vidéo | oui/non | oui/non |
| **Total** | /100 | /100 |

Règle : mêmes entrées, aucune option avantageant un provider ; 1 passage par provider ; consigner temps + coût réels + la **part réellement faisable par API** (déterminante pour un SaaS).

---

## Aucun code
Ce livrable est **exclusivement** un Decision Book + protocole POC. **Aucun** client, route, table, ni modification de workflow existant n'a été créé. Prochaine étape possible : lancer le POC Descript vs VEED **sur validation explicite**.
