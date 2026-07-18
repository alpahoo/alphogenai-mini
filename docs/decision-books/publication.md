# Capability Decision Book — Publication (distribution & scheduling social)

> Statut : ✅ **TRANCHÉ (option A, 17 juil. 2026)** — on garde le **scheduler maison** existant ; **Postiz = solution externe désignée, activable au besoin** (non déployée). Aucun code, aucun POC.
> Date : **17 juil. 2026** · Workflow : **📢 Publication** · Voir [README](./README.md).

## Décision actée (17 juil. 2026) — Option A
- **Constat vérifié** : Postiz **n'est installé nulle part** (Modal : 3 apps, aucune Postiz ; VPS : aucun conteneur/image/dossier/service Postiz — le port 5000 est un app gunicorn, le `jobpilot-redis` est un autre projet). Ce qui est « déjà fonctionnel » = **notre scheduler MAISON « Postiz-*like* »** : `lib/scheduled-posts.ts` + table `scheduled_posts` + cron `publish-scheduled` + OAuth **YouTube/TikTok/Instagram**.
- **Décision** : **on NE déploie PAS Postiz maintenant.** On **conserve la brique maison** tant que le besoin ne dépasse pas ces 3 plateformes. Principe : ne pas ajouter une dépendance prématurément.
- **Postiz reste la solution externe DÉSIGNÉE** (choix provider acté vs Ayrshare, écarté sur le coût), **à activer quand un déclencheur apparaît** :
  - (a) besoin d'une **plateforme non couverte** (X, LinkedIn, Threads, Pinterest, Bluesky, Reddit…), ou
  - (b) besoin de **white-label multi-tenant** / d'offload de la maintenance OAuth par-plateforme.
- **Voie privilégiée le jour venu** : **self-host sur le VPS** (gratuit ; **AGPL à cadrer** pour un usage SaaS) ; alternative **Postiz Cloud** (29-99 $/mo, sans AGPL, revente/white-label = Enterprise).
- **Alternatives en réserve** : Ayrshare (API zéro-ops, si le budget le permet un jour) ; Blotato (option légère MCP + média-par-URL).

> Le benchmark détaillé (5 acteurs) ci-dessous reste l'analyse de fond qui justifie ce choix.

---
> Sources **officielles uniquement** (docs/API/pricing/CGU/licences). Non vérifiable sur source officielle → **À VÉRIFIER**, aucune supposition.

## Objectif
Publier et planifier automatiquement les vidéos produites par AlphoGenAI vers les réseaux sociaux, **au nom de nos utilisateurs** (multi-tenant), en **maximisant la couverture plateformes et en minimisant le code maison à maintenir**. On cherche la capability « Publication », pas un provider donné.

## Périmètre & prisme de décision
Le prisme n'est pas « quel outil publie », mais **« un outil externe supprime-t-il plus qu'il n'ajoute vs. étendre notre OAuth existant ? »**. Priorités : simplicité, faible maintenance, réutilisation, ROI, coût maîtrisé, **multi-tenant + white-label** (publier sous notre marque vers les comptes de nos clients).

## Base de comparaison : CE QU'ON A DÉJÀ (à ne pas réinventer)
Vérifié dans le repo — la brique publication existe partiellement :
- **OAuth** : `auth/{youtube,tiktok,instagram}/{connect,callback}` + `auth/social/disconnect` → **3 plateformes**, modèle par-utilisateur (déjà « multi-tenant » à l'échelle de nos users).
- **Publication** : `jobs/[id]/publish/{youtube,tiktok,instagram}` + `export-social` + `social-pack` + `generate-metadata` (LLM).
- **Planification** : table `scheduled_posts` + `scheduled-posts` (routes) + cron `publish-scheduled` + `analytics`.
- Tokens OAuth **chiffrés AES-256-GCM** en DB.

➡️ **Le manque réel** = (a) **plus de plateformes** (X, LinkedIn, Threads, Pinterest, Bluesky, Reddit…), (b) **moins de code par-plateforme à maintenir** (chaque réseau = OAuth + refresh + specs média + conformité API à entretenir), (c) éventuellement **white-label** packagé. Un candidat gagne s'il **remplace nos N intégrations OAuth par UNE** tout en élargissant la couverture.

---

## Fiches providers (faits vérifiés)

### 1) Ayrshare — l'API-first / SaaS-natif 🥇 (finaliste A)
- **Plateformes** : **13** (X, LinkedIn, Instagram, Facebook, TikTok, YouTube, Threads, Pinterest, Reddit, Snapchat, Telegram, Bluesky, Google Business).
- **API** ✅ `api.ayrshare.com/api`, Bearer + **`Profile-Key`** · **SDK** Node/Python/Flutter · **MCP** officiel (docs + action server) · **Webhooks** ✅ (HMAC).
- **Multi-tenant** ✅ **natif SaaS** : « User Profiles » (1 profil = 1 client isolé) + **`generateJWT`** → page de connexion **white-label** où le client connecte lui-même ses réseaux (« il ne voit jamais ton dashboard »). Refresh tokens à l'échelle.
- **Média** : publie image/vidéo par **URL** (`isVideo:true` si extension absente) → colle à nos MP4 R2.
- **Prix** : Premium 149 $/mo (1 profil) · Launch 299 $/mo (10) · **Business 599 $/mo** (30 profils + dégressif 8,99→2,49 $/profil) · Enterprise sur devis · Max Pack +300 $/mo. Annuel −17 %.
- **CGU** : usage commercial ✅ ; le Business Plan est **explicitement conçu pour gérer les comptes de clients via API en white-label** ; clause « revente à clients finaux » exacte **À VÉRIFIER** (demander les API Terms).
- **Avantages** : **zéro ops**, remplace TOUTE notre couche OAuth par 1 API, multi-tenant + white-label les plus aboutis, MCP.
- **Limites** : **coût récurrent élevé** (599 $+/mo à l'échelle) ; dépendance provider ; génération de caption IA **À VÉRIFIER** (on l'a déjà via notre LLM).
- **Business Score : ~88/100** · **ROI** : élevé si le coût est absorbé par le prix de vente client.

### 2) Postiz — l'open-source le plus large 🥇 (finaliste B)
- **Plateformes** : **31** (le plus large du panel — X, LinkedIn, Instagram, Facebook, TikTok, YouTube, Threads, Bluesky, Mastodon, Pinterest, Reddit, Discord, Telegram, WordPress…).
- **API** ✅ `api.postiz.com/public/v1` (cloud) ou self-host, clé/OAuth2, 90 req/h · **SDK Node** `@postiz/node` · **MCP** intégré · Zapier/Make/n8n · **Webhooks** listés (détails **À VÉRIFIER**).
- **Multi-tenant** ✅ via **OAuth2 API** (agir au nom d'autres users) **ou** **Enterprise** (env isolé par client + **white-label**, « présente le scheduler comme ton produit »).
- **Média vidéo** : plateformes vidéo supportées ; l'exemple d'upload API documente surtout l'image → **upload mp4 par API À VÉRIFIER**.
- **Prix** : **self-host GRATUIT** (AGPL) · cloud 29 $ (5 canaux) / 39 $ / 49 $ / 99 $ (100 canaux) — API+webhooks+analytics sur tous les tiers.
- **Licence/CGU** : code **AGPL-3.0** (⚠️ **copyleft** — l'usage en réseau peut déclencher l'obligation de **divulgation du code source** dérivé) ; **revente/white-label du service hébergé RÉSERVÉS à l'Enterprise** (ToS interdit la revente hors accord ; prix Enterprise **À VÉRIFIER**).
- **Avantages** : **couverture max**, **coût plancher** (self-host gratuit ou cloud bon marché), open-source (contrôle), MCP + SDK.
- **Limites** : **AGPL = risque juridique** pour un SaaS commercial (à cadrer) ; self-host = **ops à porter** ; white-label/revente propre = Enterprise (coût inconnu).
- **Business Score : ~82/100** · **ROI** : excellent sur le coût/contrôle ; à pondérer par l'AGPL et l'ops.

### 3) Blotato — léger, MCP-natif, orienté vidéo IA 🥉 (réserve)
- **Plateformes** : **9** (Instagram, LinkedIn, Facebook, Threads, TikTok, X, Bluesky, YouTube, Pinterest).
- **API** ✅ **self-serve** `backend.blotato.com/v2`, header `blotato-api-key`, 30 req/min · **MCP officiel** (`mcp.blotato.com/mcp`) + n8n/Make · **média par URL** (`mediaUrls`, gère le transfert — **parfait pour nos MP4 R2**) · marketé pour **auto-poster des vidéos IA**.
- **Multi-tenant** ⚠️ multi-comptes (20–40+/plan) mais **pas d'archi on-behalf-of-clients ni white-label** documentée (**À VÉRIFIER**) · **Webhooks À VÉRIFIER**.
- **Prix** : **Starter 29 $/mo** (20 comptes, 1 250 crédits) · Creator 97 $/mo (40) · Agency 499 $/mo · API incluse sur tout plan payant.
- **CGU** : pas d'interdiction explicite d'usage agence ; revente exacte **À VÉRIFIER**.
- **Avantages** : **pas cher**, **MCP + média-par-URL** (le plus simple à brancher sur nos vidéos), agent-friendly.
- **Limites** : moins de plateformes, **white-label/webhooks/multi-tenant client non confirmés** → moins « SaaS-resell » que Ayrshare.
- **Business Score : ~66/100** · **ROI** : bon pour un branchement rapide/pas cher ou la niche vidéo-IA.

### Écartés (raison factuelle)
- **Mixpost** — self-host ; mais **l'usage SaaS multi-tenant EXIGE l'édition Enterprise (1 199 $ one-time)** (la licence Pro **interdit** de bâtir un SaaS/vendre des workspaces), **pas de SDK/MCP officiel**, 12 plateformes. Ajoute plus qu'il ne supprime pour notre cas. *(Score ~54)*
- **Publer** — API **gatée** Business, **pas de white-label** documenté, **pas de webhooks**, pricing non récupérable, multi-tenant partiel (workspaces). *(Score ~52)*

---

## Comparaison synthétique
Légende : ✅ oui · ⚠️ partiel · ❌ non · ❔ À VÉRIFIER.

| Critère (prisme SaaS) | **Ayrshare** | **Postiz** | Blotato | Mixpost | Publer |
|---|---|---|---|---|---|
| Plateformes | 13 | **31** | 9 | 12 | 13 |
| API publique | ✅ | ✅ | ✅ | ✅ (Pro+) | ⚠️ (gatée) |
| SDK officiel | ✅ | ✅ (Node) | ❌ | ❌ | ❌ |
| MCP officiel | ✅ | ✅ | ✅ | ❌ (tiers) | ❌ |
| Webhooks | ✅ | ⚠️ | ❔ | ✅ (Pro+) | ❔ |
| **Multi-tenant clients** | ✅ **natif** | ⚠️ OAuth2 / Enterprise | ⚠️ | ✅ (Enterprise) | ⚠️ |
| **White-label** | ✅ | ⚠️ (Enterprise) | ❔ | ✅ (Pro/Ent.) | ❔ |
| Média vidéo par URL (R2) | ✅ | ❔ | ✅ | ⚠️ | ⚠️ |
| Maintenance / ops | **✅ zéro (hébergé)** | ⚠️ self-host (ou cloud) | ✅ hébergé | ❌ self-host | ✅ hébergé |
| Coût | 149→599 $+/mo | **gratuit self-host / 29-99 $ cloud** | 29-499 $/mo | 1 199 $ one-time (SaaS) | Business (opaque) |
| Licence / risque | hébergé (clean) | **AGPL ⚠️** | hébergé | propriétaire | hébergé |
| **Business Score** | **~88** | **~82** | ~66 | ~54 | ~52 |

> Pondération : multi-tenant+white-label 25 · API/SDK/MCP 20 · maintenance/ops 15 · couverture plateformes 15 · coût/ROI 15 · licence/CGU 10. **Scores indicatifs** (plusieurs CGU/prix restent À VÉRIFIER).

---

## L'arbitrage réel (le vrai sujet)
Trois modèles, pas un classement linéaire :
1. **API managée zéro-ops (Ayrshare)** — 1 intégration remplace toute notre couche OAuth + white-label multi-tenant clé en main. **Coût récurrent élevé**, mais **supprime le plus de code/maintenance**. Le plus « delete-more-than-you-add ».
2. **Open-source self-host (Postiz)** — couverture max, coût plancher, contrôle total ; mais on **échange la maintenance de nos OAuth contre l'ops d'un déploiement** + **risque AGPL** à cadrer + white-label = Enterprise.
3. **Léger/pas cher (Blotato)** — branchement le plus rapide (MCP + média-URL) pour un MVP, mais faible sur white-label/multi-tenant client.

Notre existant (3 plateformes maison) est la **4ᵉ option de repli** : le garder tel quel et n'ajouter un provider que pour les plateformes manquantes (hybride).

---

## Décision — finalistes (PAS de gagnant)
- 🥇 **Finaliste A — Ayrshare** : meilleur fit **SaaS multi-tenant + white-label + zéro-ops**, remplace notre couche OAuth par 1 API. À valider : le **coût** tient-il dans notre P&L, et la **clause de revente** (CGU).
- 🥇 **Finaliste B — Postiz** : meilleur **coût/contrôle/couverture** (self-host gratuit, 31 plateformes, MCP). À valider : **risque AGPL** pour un SaaS, **charge d'ops**, prix **Enterprise** pour white-label.
- 🥉 **Réserve — Blotato** : option **rapide et pas chère** (MCP + média-par-URL, orienté vidéo IA) si on veut un MVP publication léger avant d'investir.

> Rappel réutilisation : on a **déjà** YT/TikTok/IG maison — tout finaliste doit prouver qu'il **supprime** cette maintenance (ou l'élargit nettement), pas juste s'ajouter à côté.

---

## Protocole POC (identique — Ayrshare vs Postiz)
> À exécuter **sur validation** (aucun POC ici). But : mesurer l'effort réel et le « delete-more-than-you-add ».

### Constantes figées
- **Même vidéo** : un MP4 existant sur **R2** (ex. la pub DJI URL→Video).
- **Même texte/métadonnées** (caption + hashtags, générés par notre LLM existant).
- **Mêmes 2 cibles de test** : 2 plateformes qu'on **n'a pas** aujourd'hui (ex. **X** + **LinkedIn**) sur des comptes de test.
- **Même planification** : 1 post immédiat + 1 programmé.

### Critères de mesure
| Critère | Ayrshare | Postiz |
|---|---|---|
| Média **par URL R2** accepté (sans ré-upload) | oui/non | oui/non |
| Effort d'intégration (1 client REST vs déploiement) | /10 | /10 |
| Multi-tenant : connecter un « client » via white-label | oui/non + effort | oui/non + effort |
| Publication réelle X + LinkedIn (succès + rendu) | /10 | /10 |
| Planification (immédiat + différé) fiable | /10 | /10 |
| **Code maison SUPPRIMABLE** (nos OAuth remplacés ?) | oui/partiel/non | oui/partiel/non |
| Coût réel par post / par profil | mesuré | mesuré (0 self-host) |
| Ops/maintenance induite | faible/élevée | faible/élevée |
| Conformité CGU plateformes + revente | ✅/⚠️/❔ | ✅/⚠️/❔ |

Règle : mêmes entrées ; on mesure surtout **combien de notre code OAuth on peut retirer** et **le coût total à l'échelle**.

---

## Aucun code
Livrable = **ce Decision Book + protocole POC**. Aucun client, route, table, ni modification de workflow. Prochaine étape possible : **POC Ayrshare vs Postiz** (sur validation explicite) — les deux ont un essai/gratuité permettant un test sans engagement.

## Sources
Postiz : [docs](https://docs.postiz.com/public-api/introduction) · [pricing](https://postiz.com/pricing) · [enterprise](https://postiz.com/enterprise) · [licence AGPL](https://github.com/gitroomhq/postiz-app/blob/main/LICENSE) — Ayrshare : [API](https://www.ayrshare.com/docs/apis/overview) · [Business/multi-user](https://www.ayrshare.com/business-plan-for-multiple-users/) · [pricing](https://www.ayrshare.com/pricing/) — Blotato : [API](https://help.blotato.com/api/start) · [pricing](https://www.blotato.com/pricing) — Mixpost : [pricing/licences](https://mixpost.app/pricing) · [terms](https://mixpost.app/terms-of-use) — Publer : [API](https://publer.com/docs/api-reference/introduction).
