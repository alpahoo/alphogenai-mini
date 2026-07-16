# URL → Video — Capability Decision Book

> Statut : 🏁 **POC tranché (16 juil. 2026) — GAGNANT = Jogg** (80/100 ≫ Creatify 40 ≫ Topview 6). Détails : [url-to-video-poc.md](./url-to-video-poc.md).
> Raisons : vidéo+son nets · **API dès le plan gratuit** · **pricing ultra-bas (1 crédit / 2 min ≈ 1 cr par pub 30 s)** · couverture large. Limite : `override_script` ignoré sur URL→Video (→ endpoint *Avatar Video* pour script verbatim).
> Date : **15 juillet 2026** · Phase : CTO Produit (aucun code, aucun POC, aucune intégration).
>
> **Fiabilité** : `[vérifié]` (doc/site officiel) · `[reporté]` (source tierce, à re-confirmer) · **À VÉRIFIER** (non vérifiable publiquement).
> Les prix changent → à re-confirmer au contrat.

---

# Objectif

Déterminer le meilleur moteur **URL/produit → vidéo publicitaire** pour AlphoGenAI —
**techniquement ET économiquement**. On ne privilégie **aucune** interface : on compare
**toutes les interfaces officielles** (API, SDK, MCP, Skills, Browser automation officielle,
Connecteurs, Enterprise, Open Source) pour trouver la **meilleure stratégie d'intégration**.

# Périmètre

- **Finalistes benchmarkés** (ordre de préférence actuel du décideur) : **1. Jogg · 2. Topview · 3. Creatify**.
- **Exclus (Decision Books séparés)** : Runway (*Cinematic*), VEED (*Podcast/Editing*), Synthesia & moteurs *Avatar*, workflow *Podcast* (gelé).
- **N/A transversal** : « Browser automation officielle » n'existe chez **aucun** provider (= non partout).
- **Open Source** : les trois finalistes sont des **SaaS propriétaires** → **non** (par nature).

---

# Benchmark mondial — fiches provider

## 🥇 Jogg (JoggAI)

**Comparatif des interfaces officielles**
| Interface | État |
|---|---|
| API | `[vérifié]` REST, endpoint **URL→Video** documenté, **async 3 étapes** |
| SDK | **À VÉRIFIER** (non trouvé officiel) |
| MCP | **À VÉRIFIER** (non trouvé) |
| Skills | non |
| Browser automation officielle | non |
| Connecteurs | `[vérifié]` **Make (apps.make.com/joggai), Activepieces, Pipedream, viaSocket** |
| Enterprise | `[reporté]` plan Enterprise (custom, API + priorité) |
| Open Source | non |

- **Capacités** `[vérifié/reporté]` : URL→Video natif (unique vs HeyGen/Synthesia/Creatify selon Jogg), Product Ads, **450+ avatars** + voice cloning (50+ langues), **webhooks temps réel**, **publishing/scheduling** auto.
- **Limites** : white-label **non prouvé** (l'intégration ElevenLabs = *voix*, pas white-label → **À VÉRIFIER**) ; SDK/MCP **À VÉRIFIER** ; editing complet faible (script-to-video, pas éditeur).
- **Prix** `[reporté]` : API Advanced 100 cr = 99 $/mo · Professional 800 cr = 399 $/mo · Enterprise custom. **À re-confirmer.**
- **CGU** : licence commerciale (plans payants) `[reporté]` ; white-label **À VÉRIFIER**.
- **Stratégie MVP** : API URL→Video + **webhooks** (zéro polling) → intégration la plus rapide. **Scale** : Professional/Enterprise + connecteurs no-code pour orchestrer.

## 🥈 Topview

**Comparatif des interfaces officielles**
| Interface | État |
|---|---|
| API | `[vérifié]` REST **agrégateur** async (polling, signed URLs, rate-limit headers) |
| SDK | **À VÉRIFIER** |
| MCP | non |
| Skills | non |
| Browser automation officielle | non |
| Connecteurs | **À VÉRIFIER** (Make/n8n non confirmés) |
| Enterprise | `[vérifié]` Enterprise **dedicated API** |
| Open Source | non |

- **Capacités** `[vérifié]` : natifs **URL-to-Video, Product Avatar, Anyshoot** + **agrégateur multi-modèles** (Veo 3.2, Sora 2, Seedance 2.0, Wan 2.7, Kling 2, Higgsfield, Vidu Q3, Happy Horse 1) ; **500+ avatars** (Avatar 4) ; **éditeur** long→shorts (sélection de moments) ; **partage** FB/TikTok/YouTube.
- **Limites** : URL→Video = 1 capacité parmi beaucoup (moins spécialisé ad) ; **webhooks À VÉRIFIER** ; MCP/SDK non.
- **Prix** `[reporté]` : Pro 16 $/mo (960 cr/an) · Business 40 $/mo (3000 cr) · Enterprise dedicated API. **Le moins cher.**
- **CGU** : licence commerciale dès Pro `[reporté]` ; multi-tenant/white-label **À VÉRIFIER**.
- **Stratégie MVP** : natif URL-to-Video au coût le plus bas. **Scale** : Enterprise dedicated API + arbitrage modèle/coût + consolidation de workflows.

## 🥉 Creatify

**Comparatif des interfaces officielles**
| Interface | État |
|---|---|
| API | `[vérifié]` REST, 10 capacités, async |
| SDK | **À VÉRIFIER** |
| MCP | non |
| Skills | non |
| Browser automation officielle | non |
| Connecteurs | `[reporté]` Make (communauté) ; officiels **À VÉRIFIER** |
| Enterprise | `[vérifié]` Enterprise + **white-label** (page enterprise) |
| Open Source | non |

- **Capacités** `[vérifié]` : URL→Video (produit phare), **Product Ads** (le plus riche), 1500+ avatars, Ad Clone, Image Ad IAB, Asset/Text generator.
- **Limites** : **pas de SDK/MCP/Skills docs** ; **webhooks À VÉRIFIER** ; white-label = **Enterprise (sales)**, conditions non publiques ; editing/publishing faibles.
- **Prix** `[reporté]` : dès ~19 $/mo, Pro ~39 $/mo ; API volume-based + Enterprise ; ~0,50–2 $/vidéo. **À re-confirmer.**
- **CGU** : usecreatify.com/policy/terms — revente/white-label **À VÉRIFIER**.
- **Stratégie MVP** : API URL→Video directe (meilleure qualité ad native). **Scale** : Enterprise white-label + volume pricing.

---

# Matrice complète (score /5 — `[analyse]` sauf capacités factuelles ; ? = à confirmer POC/contrat)

| # | Dimension | Jogg | Topview | Creatify |
|---|---|---|---|---|
| 1 | Qualité (POC) | 4? | 4? | 4? |
| 2 | URL→Video réel | **5** | 4 | **5** |
| 3 | Product Ads | 4 | 4 | **5** |
| 4 | API | 4 | 4 | 4 |
| 5 | SDK | À VÉRIFIER | À VÉRIFIER | À VÉRIFIER |
| 6 | MCP | À VÉRIFIER | non | non |
| 7 | Skills | non | non | non |
| 8 | Browser automation officielle | non | non | non |
| 9 | Connecteurs | **5** (Make/Activepieces/Pipedream) | À VÉRIFIER | 2 (Make comm.) |
| 10 | Async | **oui** ✓ | **oui** ✓ | oui? |
| 11 | Webhooks | **oui** ✓ | À VÉRIFIER | À VÉRIFIER |
| 12 | Multi-tenant | À VÉRIFIER | À VÉRIFIER | À VÉRIFIER |
| 13 | White-label | À VÉRIFIER | À VÉRIFIER | Enterprise? |
| 14 | SaaS-ready | 4 | 4 | 4 |
| 15 | Coût | 3 | **5** | 3 |
| 16 | Coût des corrections | 3? | 3? | 3? |
| 17 | Capability Coverage | 4 | **5** | 4 |
| 18 | Integration Leverage | **5** | 3 | 3 |
| 19 | Business Score | 4 | 4 | 4 |
| 20 | ROI (POC) | 4? | **5?** | 4? |

---

# 🆕 Capability Consolidation Score

**Question** : combien de workflows AlphoGenAI ce provider peut-il **remplacer/absorber** ?
Workflows évalués : **Podcast · URL→Video · Ads · Avatar · Editing · Publishing** (6 max).

| Workflow | Jogg | Topview | Creatify |
|---|---|---|---|
| Podcast (2 intervenants) | ✗ | ✗ | ✗ |
| URL→Video | ✅ | ✅ | ✅ |
| Ads (Product Ads) | ✅ | ✅ | ✅ |
| Avatar | ✅ (450+) | ✅ (500+/Avatar4) | ✅ (1500+) |
| Editing | ⚠️ faible (script→video) | ✅ (long→shorts) | ⚠️ faible |
| Publishing | ✅ (schedule) | ⚠️ partiel (partage FB/TikTok/YT) | ✗ |
| **Consolidation Score** | **4 / 6** | **≈5 / 6** | **3 / 6** |

**Lecture brute** : **Topview** consolide le plus (URL→Video + Ads + Avatar + Editing + Publishing partiel) ; **Jogg** suit ; **Creatify** = spécialiste ad étroit. *Aucun ne couvre Podcast (gelé sur VEED).*

> ⚠️ **Caveat CTO (à pondérer fortement)** — le Consolidation Score est **trompeur pour AlphoGen** :
> - **Publishing** : on a **déjà** l'OAuth YouTube/TikTok/Instagram en prod → la capacité publishing des providers est **redondante, pas additive**.
> - **Editing** (long→shorts) : **autre métier**, hors de ce workflow.
> - **Avatar** : possède **son propre Decision Book** → le compter ici **double-compte**.
> - **Podcast** : décision figée ailleurs.
> **Valeur nette réelle** (ce qu'on éviterait vraiment de construire/payer) ≈ **URL→Video + Ads** pour les trois. L'écart de consolidation Topview **s'effondre** une fois retranché le redondant. Topview reste intéressant pour son **agrégateur multi-modèles** (Veo/Sora/Seedance via 1 clé = anti-lock-in), **pas** pour Publishing/Editing. → **Consolidation = critère MINEUR dans la décision.**

---

# 🏆 MVP Winner — **Jogg**

Solution idéale **pour lancer AlphoGenAI** vite et proprement.
1. **URL→Video natif unique** + rendu rapide (2–3× selon Jogg `[reporté]`).
2. **Webhooks temps réel** → intégration sans polling, la plus rapide à câbler.
3. **Connecteurs no-code officiels** (Make/Activepieces/Pipedream) → orchestration immédiate, peu de code.
4. **Pricing API transparent** (crédits lisibles) → coût MVP prévisible.
5. **Avatar + Publishing** inclus → couvre déjà 4/6 workflows dès le lancement.

# 🏆 Scale Winner — **Topview**

Solution idéale **à fort volume**.
1. **Coût le plus bas** (16–40 $/mo, crédits) → marge maximale au volume.
2. **Capability Consolidation ≈5/6** → un seul fournisseur pour URL→Video + Ads + Avatar + Editing + Publishing.
3. **Agrégateur multi-modèles** (Veo/Sora/Seedance/Kling…) → arbitrage qualité/coût par job, pas de lock-in modèle.
4. **Enterprise dedicated API** → montée en charge maîtrisée.
5. **Async natif** (signed URLs, rate-limit headers) → robuste en production.

## Quand migrer (MVP → Scale) ? Pourquoi ?

Migrer de **Jogg → Topview** quand **au moins un** de ces seuils est franchi :
- **Volume** : le coût mensuel Jogg (crédits) dépasse nettement l'équivalent Topview (**seuil chiffré À VÉRIFIER au POC** avec le coût réel/vidéo).
- **Élargissement** : on démarre les workflows **Editing / Ads avancés / Avatar** et on veut **consolider** sous un seul vendeur (Topview absorbe le plus).
- **Modèle** : besoin d'un modèle premium spécifique (Veo/Sora/Seedance) que Jogg n'expose pas.

*Pourquoi* : au MVP, la **vitesse d'intégration** prime (→ Jogg) ; au Scale, le **coût unitaire + la consolidation multi-workflows** priment (→ Topview). **Creatify** reste le **wildcard qualité-ad** : à privilégier si la **qualité publicitaire native** devient le critère décisif.

---

# POC — protocole identique pour les 2 finalistes

Deux finalistes proposés = **MVP Winner (Jogg) vs Scale Winner (Topview)**.
*(Creatify = réserve/wildcard : POC seulement si la qualité ad native devient l'axe décisif.)*

**Constantes imposées (identiques aux deux)** : même **URL produit** · même **produit** · **durée 30 s** ·
même **script** (imposé en override si le moteur le génère) · même **CTA** (« Shop now ») · même **branding**
(logo+couleurs) · même **résolution/format** 1080×1920 (9:16).

**Critères de notation — ordre CTO (du plus au moins décisif)** :
1. **Fidélité URL→produit** (scraping page : image/prix/claims vs générique) — *le plus risqué*.
2. **Qualité du rendu** (grille commune : réalisme avatar, lip-sync, respect produit).
3. **Coût réel $/vidéo** à nos specs (→ chiffre le seuil de migration).
4. **Coût d'intégration : webhook vs polling** (Jogg webhooks = notre pattern ; sinon cron polling à ajouter).
5. **Contrôle des specs/branding** (peut-on forcer durée/1080×1920/logo/CTA, sinon overlay Modal T-1111).
6. **CGU multi-tenant** (produits de nos users) — réponses écrites du provider.
7. Consolidation — **critère mineur** (partiellement redondant chez nous, cf. caveat).

**Étalon qualité** : produire **1 vidéo Creatify** sur la même URL comme *référence de qualité ad native*, **sans POC complet** (son coût d'intégration — polling, pas de SDK/MCP — ne se justifie que si sa qualité est nettement supérieure).

---

# Revue CTO Technique (15 juil. 2026 — validée)

**Architecture** : URL→Video passe par **API cloud** (pas de worker navigateur type VEED, pas de binding
machine-locale, pas de reCAPTCHA) et **sans Modal GPU** (les providers rendent côté serveur).

**Async = cœur du coût d'intégration** : rendu 5–10 min → **impossible en 1 requête Vercel** (timeout).
Pattern imposé = **jobs + callback**. **Jogg (webhooks)** colle à notre `/api/webhooks/modal` → coût quasi nul.
**Topview/Creatify (webhooks À VÉRIFIER)** → sinon on **ajoute un cron de polling** (dette). ⇒ **différenciateur
d'intégration réel en faveur de Jogg**, plus important que le Consolidation Score.

**Réutilisable dans AlphoGen (rien à réinventer)** :
- Table `jobs` + `app_state` (prouvé sur veed_web) · R2 (`lib/r2.ts`) · `requireAdmin`
- **Webhook** `/api/webhooks/modal` (à cloner) · **cron poll** (pattern evolink /5min) · pattern `lib/*-client.ts`
- **Overlay marque Modal (T-1111)** pour stamper logo/CTA de façon **constante et provider-swappable**
- **OAuth publishing** existant (YouTube/TikTok/Instagram) → ne pas payer le publishing d'un provider
- Règle **confidentialité provider** (nom interne only ; label public = « URL to Video »)

**Net code** : URL→Video est **nouveau** → on ne supprime rien. Le gain « delete-more-than-add » se joue en
**n'ajoutant pas** : pas de worker navigateur, pas de Modal GPU, **pas de Capability Access Layer générique**
(intégrer **UN seul** provider d'abord ; l'abstraction multi-provider est prématurée).

**Note roadmap** : URL→Video ≈ Product Ads chez ces providers → **ce POC tranchera largement aussi le book Ads**.

**Décision CTO** : POC **Jogg (MVP, webhooks) vs Topview (hedge coût + agrégateur)** ; Creatify en **étalon qualité**.
MVP = **1 provider en prod** (l'autre reste plan B documenté).

# Ce qui est explicitement hors scope (à ce stade)

Aucun code, POC, intégration, route, table, client. **Décision définitive uniquement après POC.**
Runway/VEED/Synthesia/Avatar/Podcast traités dans leurs propres Decision Books.
