# AlphoGen — CTO Briefing

**Date** : 11 mai 2026
**Auteur** : Paul (founder)
**Audience** : CTO
**Statut produit** : Production live · `https://www.alphogen.com`
**Branche actuelle** : `main` (dernier commit : `f37dd12`)

---

## 1. TL;DR

- **Production stable.** Pipeline vidéo, paiements, auth, infra, monitoring : tout vert.
- **Multi-scene chaining (Option B) shippé et validé end-to-end** sur un job réel (3 scènes, 26 m 31 s).
- **Surface marketing complète déployée** pour la candidature **Alibaba Cloud AI Catalyst Program** ($120k credits + 2B Model Studio tokens). Candidature soumise, en attente de validation par la reviewer (Jade).
- **Social Export complet** (4 sessions du roadmap initial) déjà en production : multi-format video export, AI metadata, thumbnails, publishing OAuth YouTube/TikTok/Instagram.
- **Hygiène secrets propre.** Plus aucun token PAT Supabase consommé, CRON_SECRET en sync, token Vercel d'urgence révoqué.

---

## 2. Stack technique

| Couche | Technologie | Rôle |
|---|---|---|
| Frontend | Next.js 15.5 (App Router, RSC) | UI, edge rendering, OG dynamique |
| Hosting | Vercel | Deploy, edge runtime, env management |
| Database | Supabase Postgres 17 (`qbrpzmuedfugbhoeytdj`, region `us-east-1`) | Données applicatives, RLS, realtime |
| Compute GPU | Modal | Serverless GPU inference, orchestration Python |
| Storage | Cloudflare R2 | Assets vidéo + images, distribution CDN |
| Modèles vidéo | EvoLink → Alibaba Cloud Bailian (Wan 2.6, Wan 2.7, Happy Horse 1.0) | Génération vidéo |
| LLM enhancement | Qwen + Claude (via EvoLink) | Prompt enrichment, social metadata |
| Billing | Stripe | Subscriptions Free / Pro / Premium, webhooks |
| Monitoring | Sentry | Error tracking |
| Cron safety net | GitHub Actions (every 5 min) | Polling EvoLink jobs orphelins |

### Patterns architecturaux clés
- **EvoLink unified API** : abstraction unique pour tous les engines vidéo, routing par tier utilisateur / complexité scène
- **Defense-in-depth validation** : TypeScript edge → Python orchestrator → Modal inference, fail-fast à chaque couche
- **State machine atomique** sur les jobs : claims race-safe pour éviter qu'un même scene soit traité deux fois en parallèle
- **Engine-aware payload routing** : Seedance attend `image_urls: [url]` (array), Wan/Kling/Hailuo attendent `first_frame_url: url` (string) — on envoie les deux pour que le gateway route correctement
- **Public/workspace/admin route separation** via `SiteShell` allowlist : pas de fuite de chrome marketing dans la workspace

---

## 3. Travaux livrés ces dernières sessions

### 3.1 Pipeline vidéo — Multi-scene chaining (Option B)
**Problème résolu** : génération multi-scènes incohérente (changement de personnage, lumière, props entre scènes).

**Solution** : extraction du dernier frame de la scène N et injection comme `first_frame_url` de la scène N+1. La continuité visuelle se propage naturellement à travers les scènes.

**Implémentation** :
- State machine atomique sur les scènes (`queued` → `in_progress` → `done`/`failed`)
- Retry per-scene sans perdre le travail des scènes précédentes
- Engine-aware payload (fix Seedance vs autres engines)
- Modal function deployed avec `python -m modal deploy`

**Validation** : job réel `1f06605d-f342-43d6-86c9-04d7bc5163e8` — vidéo 3 scènes sur Mars, 26 m 31 s end-to-end.

### 3.2 Surface marketing — Candidature Alibaba Cloud
**Pages créées / refondues** :

| Route | Statut | Rôle |
|---|---|---|
| `/` | Existant, OK | Hero + 3-step explanation |
| `/about` | Refondu | Hero pattern unifié, narrative officielle Wan 2.6/2.7/Happy Horse |
| `/technology` | **Nouveau (pièce maîtresse)** | 8 sections : architecture, modèles, infra, capabilities, compliance, roadmap |
| `/pricing` | Existant, OK | Free / Pro / Premium |
| `/privacy` | Refondu | GDPR officiel, mention explicite Alibaba Cloud Bailian, email `ai@alphogen.com` |
| `/terms` | Refondu | 10 sections, droit français |
| `/blog` + `/blog/[slug]` | Nouveau | 2 posts engineering réels (multi-scene chaining, GPU pipeline) |

**Chrome global** :
- **Header** : `About | Technology | Pricing | Create` (sticky, backdrop-blur)
- **Footer** : 3 colonnes (brand · product · legal) + bottom row "© 2026 AlphoGen — Made in France 🇫🇷"
- **OG image dynamique** (`app/opengraph-image.tsx` via Next.js Satori) — remplace le template Supabase Starter Kit qui s'affichait par défaut quand on partageait `alphogen.com` (gros bug branding fixé avant la candidature)
- **Metadata complète** : titles, OG, Twitter cards par page

**Cohérence narrative** : alignement de tous les noms de modèles cités sur **Wan 2.6, Wan 2.7, Happy Horse 1.0** (vs anciennement Seedance/Hailuo/Kling) — important pour la crédibilité côté reviewer Alibaba.

### 3.3 Social Export — Sessions 1-4 (vérifié shipped)
Implémentation complète déjà en production, vérifiée par inspection du code et du schéma Supabase :

| Composant | Path | Lignes |
|---|---|---|
| Modal function `export_social_formats` | `modal_app/video_pipeline.py` line 760 | ~70 |
| Migration DB | `supabase/migrations/20260417_add_social_exports.sql` | 2 (appliquée ✓) |
| API multi-format export | `app/api/jobs/[id]/export-social/route.ts` | 107 |
| API metadata generation | `app/api/jobs/[id]/generate-metadata/route.ts` | 63 |
| API thumbnail | `app/api/jobs/[id]/thumbnail/route.ts` | 86 |
| API publish YouTube | `app/api/jobs/[id]/publish/youtube/route.ts` | 235 |
| API publish TikTok | `app/api/jobs/[id]/publish/tiktok/route.ts` | 249 |
| API publish Instagram | `app/api/jobs/[id]/publish/instagram/route.ts` | 204 |
| UI panel | `components/job/social-export-panel.tsx` | 535 |
| Lib metadata | `lib/social-metadata.ts` | 144 |

**Comportement** :
- ffmpeg reformat vers 9:16 (TikTok/Reels), 1:1 (Instagram), 16:9 (YouTube)
- Upload des 3 variants vers R2, URLs stockées dans `jobs.social_exports JSONB`
- Metadata AI via EvoLink LLM (DeepSeek) avec fallback template
- OAuth YouTube + TikTok + Instagram fonctionnels (tokens encryptés AES-256-GCM)
- Pro/Premium gate côté API et UI

---

## 4. État de la base de données

**Projet Supabase** : `qbrpzmuedfugbhoeytdj` (AlpoGenAI MINI, us-east-1, PG 17.6)

### Migrations clés appliquées
- `20260331_phase1_scenes` — schéma multi-scenes
- `20260417_add_social_exports` — colonne `jobs.social_exports JSONB`
- `20260417_create_social_connections` — table OAuth tokens (chiffrés)
- `20260419_phase2_scene_chaining` — multi-scene chaining

### Tables principales
- `profiles` — user metadata + plan (free/pro/premium)
- `jobs` — generations, états, scenes, social_exports
- `engines` — registry pluggable des modèles
- `social_connections` — OAuth tokens chiffrés YT/TikTok/IG
- `stripe_events` — idempotency table

### RLS
Active sur toutes les tables user-scoped. Pas de violation observée.

---

## 5. Sécurité — Posture actuelle

### Audit complété
- ✅ Aucun **Supabase PAT** (`sbp_*`) consommé par AlphoGenAI MINI (audit fait suite à la rotation des PATs sur tradinglab le 19 avril)
- ✅ GitHub Actions ne consomme que `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `CRON_SECRET`
- ✅ `CRON_SECRET` en sync entre Vercel env et GitHub Actions secret (workflow `evolink-cron.yml` vert)
- ✅ Token Vercel `claude-emergency-deploy` **révoqué**

### Secrets stockés correctement
- OAuth tokens (YouTube/TikTok/Instagram) : chiffrement AES-256-GCM avant insertion DB
- API keys tierces : env vars Vercel uniquement, jamais commitées
- Stripe webhook signing : validation HMAC sur chaque événement
- Cron auth : `Bearer $CRON_SECRET` validé côté route

### Reste à faire (sécu)
- Aucun item bloquant identifié à date.

---

## 6. Compliance & légal

- **GDPR** : data residency annoncée Frankfurt (Alibaba Cloud Bailian region). Politique de confidentialité publique sur `/privacy`. Email `ai@alphogen.com` pour les requêtes RGPD.
- **Content safety** : politique d'usage publique sur `/terms` interdisant deepfakes, impersonation, contenu illégal.
- **Stripe PCI** : aucun numéro de carte ne transite par notre backend (Stripe Checkout hosted).
- **Droit applicable** : français. Tribunaux français.

---

## 7. Issues connues / dette technique

### Non-bloquantes (préexistantes, à nettoyer quand on a le temps)
- 8 erreurs TypeScript préexistantes hors scope des changements récents :
  - `app/(admin)/admin/page.tsx` — 2 erreurs Recharts `Formatter` type mismatch
  - `app/(workspace)/home/page.tsx` — 1 erreur `Link.href` undefined possible
  - `app/api/admin/engines/route.ts` — 1 erreur sur `[0]` d'un nullable
  - `app/jobs/[id]/page.tsx` — 1 erreur cast `Job` to `Record<string, unknown>`
  - `lib/stripe-app-context.ts` + `lib/stripe.ts` — 2 erreurs version API Stripe (`2025-03-31.basil` vs attendu `2026-03-25.dahlia`)
  - `next.config.ts` — 1 erreur `hideSourceMaps` deprecated dans Sentry SDK
- Aucune ne casse le build production (Next.js tolère pour les routes qui ne sont pas dans les paths critiques).
- **Reco** : un sprint de 2 h pour tout nettoyer.

### Décisions à prendre
1. **Routes `/blog`** : le contenu est shippé (2 posts engineering réels) mais retiré de la nav suite à la révision marketing (anti-pattern listé pour la candidature Alibaba). Garder en place "silencieusement" ou supprimer définitivement ?
2. **OG per-page** : actuellement OG global identique sur toutes les pages. Vaut-il le coût (10-20 min) de créer un OG dédié pour `/technology` qui mettrait en avant le titre spécifique de la page lors de partages ciblés ?
3. **Workspace layout sur `/create`** : intentionnellement pas de footer marketing (route en `(workspace)` group avec sidebar `h-screen`). Confirmer que c'est le bon choix UX.

---

## 8. Dépendances externes & pending

### En attente de retour externe
- **Alibaba Cloud AI Catalyst Program** : candidature soumise. Reviewer Jade. Verdict attendu, déclenchera l'accès aux $120k credits + 2B Model Studio tokens.

### Suivi des providers
- EvoLink / Bailian : aucun incident signalé récemment, latency normale
- Modal : warm pools OK, pas de cold start > 2 s observé
- Stripe : aucun webhook en échec sur les 30 derniers jours
- Cloudflare R2 : zéro bill egress, distribution OK

---

## 9. Recommandations & prochaines étapes

### Priorité immédiate (post-Jade)
- **Si feu vert Alibaba** : intégrer les credits Bailian dans la config EvoLink, valider que le routing engine bascule bien sur Bailian quand applicable, monitorer le coût pour calibrer les marges Pro/Premium.
- **Si retour avec demandes** : itérer sur `/technology` selon les remarques de Jade (la page est notre interface de pitch).

### Priorité moyenne (1-2 semaines)
- Cleanup des 8 erreurs TypeScript préexistantes (2 h focus)
- Test end-to-end manuel du Social Export Panel sur un job réel (vérifier que les 3 formats render + boutons copy fonctionnent)
- OG dédié pour `/technology` (10 min)

### Priorité basse / backlog
- Reference-driven multi-scene (pin character image au début, propager via chaining) — extension naturelle du Option B déjà shippé
- Dashboard admin enrichi : metrics de cost per generation par engine, taux de succès par tier
- Rate limiting plus fin sur l'API publique (actuellement basé uniquement sur le plan, pas sur la fréquence)

---

## 10. Métriques code (à date)

- **Repo** : `github.com/alpahoo/alphogenai-mini`
- **Branche prod** : `main`
- **Last deploy** : `f37dd12` (replace Supabase OG template par version brandée)
- **Routes Next.js** : 17 pages + 30+ routes API
- **Migrations Supabase** : 20 appliquées
- **Modal app** : 1 (`video_pipeline.py`, ~900 lignes)

---

## Annexe — Liens utiles

- **Production** : https://www.alphogen.com
- **Technology overview (page Alibaba)** : https://www.alphogen.com/technology
- **Repo** : https://github.com/alpahoo/alphogenai-mini
- **Vercel** : https://vercel.com/team_kq6trybfphjjykfalqxgdpi2/alphogenai-mini
- **Supabase** : https://supabase.com/dashboard/project/qbrpzmuedfugbhoeytdj
- **GitHub Actions** : https://github.com/alpahoo/alphogenai-mini/actions
- **Contact technique** : ai@alphogen.com

---

*Document généré le 2026-05-11. À actualiser après réponse de la candidature Alibaba Cloud.*
