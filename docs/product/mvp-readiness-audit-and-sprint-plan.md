# MVP Readiness — Audit réel + Sprint Plan

> Rôle : **Lead Software Engineer**. Critère de succès : *« un inconnu crée sa première vidéo sans aide »* (pas « le code compile »).
> Date : **17 juil. 2026** · Méthode : **état réel** (lecture du code + données de production), pas supposition.
> Périmètre autorisé : finir/relier l'existant. **Interdits** : nouveau provider, benchmark, nouveau workflow, nouvelle techno, gros refactor.

---

## Mission 1 — Audit réel

**Vérifié par :** lecture du code (câblage réel de chaque flux) + requêtes sur la DB de production.
`✅` fonctionne · `⚠️` partiel/à durcir · `❌` absent · `(prod?)` = câblage vérifié, succès runtime à confirmer par smoke-test.

| Fonction | Backend | Frontend | Production | Utilisable (débutant seul) | Priorité |
|---|---|---|---|---|---|
| **Auth** | ✅ Supabase | ✅ `/login` + middleware | ✅ | ✅ | — |
| **Dashboard (Home)** | ✅ lit `jobs` | ✅ Command Center + Template Hub | ✅ | ⚠️ **surchargé/confus** (composer + 6 tuiles + « New director project ») | **P1** |
| **Projects / History** | ✅ table `jobs` | ✅ `/projects`, `/library`, recents Home, `/jobs/[id]` | ✅ | ⚠️ **éparpillé** (4 endroits pour « mon travail ») | **P2** |
| **URL → Video** | ⚠️ **le flux user = pipeline Research** (`/api/research/jobs`), **PAS** le Jogg validé (admin-only, non branché) | ✅ `/create/url` (soigné) | ⚠️ produit un **PLAN multi-étapes**, pas une vidéo en 1 clic. `research_jobs` : 5 approved / 8 failed / 4 en cours | ❌ **écart promesse/réalité** (« colle un lien → vidéo » ⇒ workspace de plan) | **P0** |
| **Podcast** | ✅ chaîne `/api/podcasts/*` + lipsync HeyGen (⚠️ **≠ la décision figée VEED**, non branchée) | ✅ `/create/podcast` (riche) | ⚠️ `podcasts` : 23 ready ; fiabilité lipsync connue instable (T-1157) | ⚠️ complexe + fiabilité | **P1** |
| **Story / Avatar / Editor** (cœur génération → `/api/jobs`) | ✅ `/api/jobs` → Modal/moteurs | ✅ `/create/[mode]`, `/create/avatar`, `/create/editor` | ⚠️ **`jobs` : 62 % succès (30j), 46 % all-time**. **140/166 échecs = `engine_used=null` (échec AVANT génération)** | ⚠️ UI riche + ~4/10 premières vidéos échouent tôt | **P0** |
| **Editing / Enhancement** | ❌ aucune route user (direction Descript **décidée, non construite**) | ❌ aucun écran | ❌ | ❌ | P2 |
| **Publication** | ✅ OAuth YT/TikTok/IG + `scheduled_posts` + cron | ⚠️ `/schedule` existe ; connexion des comptes à confirmer | ⚠️ (prod?) | ⚠️ pas relié à l'écran résultat | **P1** |
| **Brand Kit** | ❌ pas de table dédiée (« Brand Looks » = `cinematic_looks`) | ❌ **aucune page Brand Kit** (Home « Brand Looks » → `/library`) | ❌ | ❌ | **P1** |
| **Assets** | ✅ `/api/upload`, `byteplus_assets`, R2 | ⚠️ `/library` | ✅ (prod?) | ⚠️ | P2 |
| **Billing** | ✅ Stripe actif | ✅ `/pricing` + « Upgrade » | ✅ | ⚠️ checkout bout-en-bout à confirmer | **P1** |
| **Settings** | ⚠️ dispersé | ❌ **aucune page `/settings`** | ❌ | ❌ | P2 |

### Les 3 vérités de l'audit (chiffrées, prod)
1. **Le problème n°1 est l'INTAKE, pas les moteurs.** **140/166 échecs (`engine_used=null`)** surviennent **avant** la génération (validation / plan-gate / inputs manquants / job orphelin). Les échecs moteurs réels ≈ 26 au total. → **C'est dans notre périmètre** (UX/validation/guidage), pas dans celui d'un provider.
2. **Trop de portes d'entrée qui se chevauchent.** Hub (6 tuiles) + Home (6 autres) + sidebar (Create, Scene Editor, Research). Un débutant ne sait pas par où commencer, et la première marche recommandée (`/create/story` = Director Console) est la **plus complexe**.
3. **Écart promesse/réalité sur le produit vitrine.** « URL → Video » promet une vidéo en un clic mais ouvre un **workspace de plan Research** multi-étapes. Le Jogg validé/prouvé en prod **n'est pas branché** à cette UI.

---

## Mission 2 — TODO produit (tâches utilisateur uniquement)

*(Uniquement ce qui augmente le nombre de gens capables de créer une 1ʳᵉ vidéo sans aide.)*

- □ **Un point d'entrée unique et clair** : 1 chemin recommandé au débutant, le reste rangé/annoté.
- □ **Échec gracieux** : si un job échoue tôt, message **humain + action** (réessayer/corriger), jamais un cul-de-sac ni un job orphelin.
- □ **Validation d'intake claire** : dire à l'utilisateur ce qui manque **avant** de lancer (inputs requis, plan requis).
- □ **Écran Résultat cohérent** : aperçu + **Télécharger** + **Publier** + Nouvelle version, identique pour tous les flux.
- □ **États de progression lisibles** : « On prépare ta vidéo… » → « Prête » / « Échec (réessayer) ».
- □ **Empty states guidants** : 0 projet → un CTA unique vers **le flux qui marche** (+ 1 ligne « ce que tu obtiens »).
- □ **Onboarding minimal** au 1er login (2 gestes max).
- □ **Aligner URL→Video** : soit tenir la promesse « 1 clic », soit reformuler honnêtement.
- □ **Marquer « bientôt »** ce qui n'est pas self-serve fiable (au lieu de « live »).
- □ **Retrouver son travail à UN endroit** (History unifié).
- □ **Téléchargement du résultat** évident.
- □ **Page Settings** (compte, plan, déconnexion).
- □ **Publier depuis le résultat** (bouton relié aux comptes).

---

## Mission 3 — Priorisation

**P0 — empêche un inconnu de réussir sa 1ʳᵉ vidéo :**
- Réduire le taux d'échec **intake** (`engine_used=null`) : validation claire + échec gracieux + retry + zéro job orphelin.
- **Un chemin de création recommandé unique**, fiable, pour débutant (empty state + hub honnête).
- **Écran Résultat** clair (aperçu + télécharger) + **messages d'erreur humains** sur le flux principal.
- **Aligner la promesse URL→Video** avec ce qui se passe réellement.

**P1 — très important :** Home simplifié · Publication depuis le résultat · Billing checkout vérifié · Podcast (fiabiliser ou « bientôt ») · Brand Kit minimal · Settings.

**P2 — confort :** History/Projects/Library unifiés · Assets · Editing UI.

**P3 — future version :** Brand Kit complet, multi-marque Agence, Campaigns, Analytics, Collaboration.

---

## Mission 4 — Plan de sprints (petits · testables · déployables · finissent en prod)

### 🏁 Sprint 1 — « Un débutant crée et récupère sa 1ʳᵉ vidéo » (fiabilité + clarté)
1. **Échec gracieux + retry** sur l'écran job/résultat : message humain, bouton « Réessayer » qui marche, pas de cul-de-sac.
2. **Validation d'intake** : bloquer/expliquer **avant** de créer un job voué à `engine_used=null` (inputs requis + plan requis, en langage clair).
3. **Hub honnête + chemin recommandé unique** : une entrée « Recommandé pour débuter » vers le flux le plus fiable ; marquer « bientôt » ce qui ne self-serve pas.
4. **Empty state guidant** (Home + Projects) vers ce chemin, avec « ce que tu obtiens ».

*Objectif mesurable : faire monter le taux de 1ʳᵉ vidéo aboutie (réduire les échecs `engine_used=null`).*

### Sprint 2 — « Publier sa vidéo »
- Connexion des réseaux (écran clair) · **bouton Publier depuis le résultat** · suivi des posts (programmé/publié/échec).

### Sprint 3 — « Retrouver & gérer sans se perdre »
- **History unifié** (un seul endroit) · **page Settings** (compte/plan/déconnexion) · **checkout Billing** vérifié bout-en-bout.

Chaque tâche = 1 incrément **déployé en prod** et vérifié, avant la suivante.

---

## Règle d'or appliquée
Avant chaque tâche : *« Si j'invite 10 bêta-testeurs demain, ceci augmente-t-il le nombre de gens capables de créer une vidéo sans aide ? »* Si **non** → reportée. C'est pourquoi le Sprint 1 attaque d'abord **la fiabilité de l'intake et la clarté du chemin**, pas la cosmétique.
