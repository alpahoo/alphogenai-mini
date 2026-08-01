# Audit de l'ecosysteme MuAPI Apps pour AlphoGenAI

Date: 2026-08-01

## 1. Avis general

MuAPI peut accelerer AlphoGenAI, mais les gains ne se trouvent pas tous au meme niveau.

- Les **Apps open source** sont surtout utiles comme catalogues de parcours, composants UI, presets, schemas de formulaires et exemples de jobs asynchrones.
- Les **Skills** sont la source la plus rentable pour importer rapidement des recettes metier reproductibles.
- Les **Workflows MuAPI** sont utiles comme executions distantes configurables, a condition de rester derriere les modules AlphoGenAI.
- L'**API MuAPI** est un fournisseur additionnel, pas le produit.
- Le **White Label complet** duplique Auth, Stripe, credits, historique, dashboard et branding deja presents dans AlphoGenAI. Il n'est pas recommande pour le coeur du produit.

La strategie pragmatique est donc: reprendre ce qui est deja bon, supprimer le shell SaaS en doublon, brancher le workflow sur les contrats AlphoGenAI, puis effectuer une seule QA produit significative.

## 2. Sources et niveau de preuve

Sources principales:

- [Catalogue officiel MuAPI Apps](https://muapi.ai/apps)
- [Documentation MuAPI](https://muapi.ai/docs)
- [White Label](https://muapi.ai/docs/white-label)
- [Workflows](https://muapi.ai/docs/workflows)
- [Agent Skills](https://muapi.ai/docs/agent-skills)
- [Generative Media Skills](https://github.com/SamurAIGPT/Generative-Media-Skills)
- [AI Creator Academy](https://github.com/Anil-matcha/ai-creator-academy)

Niveaux utilises:

- **Verifie**: depot public ou documentation inspectee.
- **Annonce**: fonctionnalite decrite par la page MuAPI, sans audit complet du depot.
- **A valider**: qualite du modele, cout, licence d'asset ou maintenance exigeant un spike.

Les templates inspectes montrent un socle recurrent: Next.js App Router, React, Tailwind, NextAuth/Google, Prisma/PostgreSQL, Stripe, historique utilisateur et jobs asynchrones. Ce socle ne doit pas etre importe dans AlphoGenAI; il ferait doublon avec Supabase Auth/DB, Stripe, R2, jobs et publication.

## 3. Audit app par app

### A. Production media prioritaire

#### 3.1 Open AI UGC Studio

1. **Presentation**: genere des publicites UGC avec acteurs et references visuelles. Cible: e-commerce, agences et createurs. Valeur: module publicitaire directement monetisable.
2. **Disponibilite**: open source MIT, template MuAPI, API MuAPI; recettes UGC disponibles dans Skills.
3. **Stack verifiee**: Next.js 16, React 19, Tailwind v4, Framer Motion, Prisma 7, NextAuth, Stripe, MuAPI; jobs asynchrones et webhooks.
4. **Fonctionnalites**: T2V/I2V, jusqu'a 7 references, references `@image`, choix de modele, duree/ratio/resolution, historique, credits.
5. **Qualite**: produit demonstrable et code reutilisable, mais sa qualite finale depend fortement du modele et du prompt. Le repo est un studio de generation, pas un moteur de montage complet.
6. **Integration**: reprendre le formulaire multi-reference, les schemas de capacites, presets et logique de soumission. Ne pas importer Auth/Prisma/Stripe.
7. **Adaptations**: mapper uploads vers R2, jobs vers Supabase, fournisseurs vers `UGCShotProvider`, couts vers le ledger AlphoGen, ajouter QA de coherence produit/acteur.
8. **Estimation**: 1-2 semaines; difficulte moyenne; risque moyen (qualite provider).
9. **Priorite**: ★★★★★
10. **Verdict**: **Adapter**.

#### 3.2 Amazon Product Studio

1. **Presentation**: photos e-commerce studio a partir de nombreuses references produit. Cible: vendeurs Amazon/DTC. Valeur: forte, usage frequent et facturable par pack.
2. **Disponibilite**: open source MIT, template, API; Skill `Amazon Listing Pack`.
3. **Stack verifiee**: Next.js, NextAuth, Prisma/PostgreSQL, Stripe, webhooks, multi-upload.
4. **Fonctionnalites**: 14+ references, ratios, prompts, presets de scene, historique et billing.
5. **Qualite**: parcours produit mature; excellente source de composants et de presets. La fidelite exacte du produit doit etre testee par categorie.
6. **Integration**: reprendre studio, presets, validation multi-reference et workflow; conserver nos assets, jobs et facturation.
7. **Adaptations**: Supabase/R2, moderation, detection fond/produit, export marketplace, provider BytePlus/MuAPI interchangeable.
8. **Estimation**: 5-8 jours; moyenne; risque faible a moyen.
9. **Priorite**: ★★★★★
10. **Verdict**: **Adapter**.

#### 3.3 AI Clipping Studio

1. **Presentation**: transforme une video YouTube longue en shorts viraux. Cible: podcasteurs, influenceurs, equipes social. Valeur: usage recurrent et volume eleve.
2. **Disponibilite**: open source MIT, template, API; Skills Clipping/YouTube Shorts.
3. **Stack verifiee**: Next.js, NextAuth, Prisma/PostgreSQL, Stripe; telechargement YouTube, analyse asynchrone, probing de duree.
4. **Fonctionnalites**: extraction, scoring de highlights, ratios, sous-titres, archive.
5. **Qualite**: bon squelette produit; la robustesse du download et la qualite du ranking demandent une QA legale/technique.
6. **Integration**: reprendre workflow de decoupage, scoring, UI de selection et exports; garder notre stockage et publication.
7. **Adaptations**: ingestion licite, Whisper existant, captions AlphoGen, Postiz, limites de duree, reprise de job.
8. **Estimation**: 1-2 semaines; moyenne; risque moyen.
9. **Priorite**: ★★★★★
10. **Verdict**: **Adapter**.

#### 3.4 AI Headshot Studio

1. **Presentation**: portraits professionnels LinkedIn/equipe. Cible: particuliers, RH et agences. Valeur: packs a marge forte.
2. **Disponibilite**: open source MIT, template, API; Skills Headshot/Multi-Angle.
3. **Stack verifiee**: Next.js App Router, NextAuth Google, Prisma/PostgreSQL, Stripe, Tailwind, Framer Motion, archive et polling.
4. **Fonctionnalites**: multi-reference, styles, ratios, 1K-4K, packs, historique.
5. **Qualite**: parcours propre et modulaire; depot relativement jeune, dependance forte au modele image.
6. **Integration**: reprendre studio, controles, galerie et presets; pas le shell SaaS.
7. **Adaptations**: consentement visage, Supabase/R2, model routing, suppression/export RGPD, credit metering.
8. **Estimation**: 4-7 jours; faible a moyenne; risque faible.
9. **Priorite**: ★★★★★
10. **Verdict**: **Adapter**.

#### 3.5 AI Real Estate Stager

1. **Presentation**: meuble virtuellement des pieces vides. Cible: agents, promoteurs, home stagers. Valeur: verticale B2B claire.
2. **Disponibilite**: open source MIT, template, API; Skills Interior Design/Floor Plan.
3. **Stack verifiee**: Next.js, NextAuth, Prisma, Stripe, galerie et slider avant/apres.
4. **Fonctionnalites**: upload piece, styles, generation, comparaison avant/apres, archive.
5. **Qualite**: workflow reutilisable; risque de modifications structurelles non desirees.
6. **Integration**: reprendre l'UI, presets et comparaison; garder notre orchestration.
7. **Adaptations**: consigne de preservation geometrique, disclaimer, export MLS, batch de pieces.
8. **Estimation**: 5-8 jours; moyenne; risque moyen.
9. **Priorite**: ★★★★
10. **Verdict**: **Adapter**.

#### 3.6 AITryOn

1. **Presentation**: essayage virtuel de vetements. Cible: marques mode, boutiques, stylistes. Valeur: tres forte si fidelite garment/personne.
2. **Disponibilite**: open source MIT, template, API; Skill `Fashion Try-On`.
3. **Stack verifiee**: Next.js, NextAuth, Prisma, Stripe; interface d'upload personne + vetement.
4. **Fonctionnalites**: fit garment/person, galerie, credits, comparaisons.
5. **Qualite**: bon parcours; qualite commerciale totalement dependante du modele et de la preservation textile.
6. **Integration**: reprendre composants et workflow, pas l'application entiere.
7. **Adaptations**: consentement, categories garment, masques, politique corps, benchmark fidelite couleur/logo.
8. **Estimation**: 1-2 semaines; elevee; risque eleve.
9. **Priorite**: ★★★★
10. **Verdict**: **Adapter**.

#### 3.7 Nano Banana Studio

1. **Presentation**: studio generaliste generation/edition image. Cible: createurs et equipes marketing. Valeur: outil transversal.
2. **Disponibilite**: open source annonce, template, API.
3. **Stack**: socle Next.js/Stripe/Auth annonce; depot non audite en profondeur.
4. **Fonctionnalites**: generation, edition, references, packs/credits.
5. **Qualite**: utile comme UI de controles; forte redondance avec les outils image AlphoGen.
6. **Integration**: extraire controles et presets seulement.
7. **Adaptations**: mapper vers nos fournisseurs image, galerie R2 et routing de qualite.
8. **Estimation**: 3-5 jours; faible; risque faible.
9. **Priorite**: ★★★★
10. **Verdict**: **Adapter**.

#### 3.8 Seedance V2 Studio

1. **Presentation**: studio video Seedance. Cible: createurs/video marketers. Valeur: acces simple a generation premium.
2. **Disponibilite**: open source annonce, template, API.
3. **Stack**: Next.js/Stripe/Auth annonce; details non audites.
4. **Fonctionnalites**: T2V/I2V, references, ratio, duree, historique.
5. **Qualite**: surtout un exemple d'interface; AlphoGen possede deja BytePlus/Seedance.
6. **Integration**: reprendre les controles manquants, pas le backend ni le provider.
7. **Adaptations**: schema de capacites, limites par modele, estimation cout, QA references.
8. **Estimation**: 2-4 jours; faible; risque faible.
9. **Priorite**: ★★★
10. **Verdict**: **S'inspirer**.

#### 3.9 EasyVeo Studio

1. **Presentation**: suite Veo T2V/I2V/reference-to-video. Cible: clients premium. Valeur: offre cinema/premium.
2. **Disponibilite**: open source annonce, template, API.
3. **Stack**: Next.js/Stripe/Auth annonce.
4. **Fonctionnalites**: modes Veo, resolutions, references, jobs.
5. **Qualite**: interface utile; dependance couteuse et provider-specific.
6. **Integration**: reprendre le formulaire de capacites Veo lorsque ce provider est active.
7. **Adaptations**: routing plan Premium, plafond, moderation, cout preflight.
8. **Estimation**: 3-5 jours; moyenne; risque cout.
9. **Priorite**: ★★★★
10. **Verdict**: **Adapter**.

#### 3.10 ReLive AI

1. **Presentation**: videos cinematographiques Sora/Veo depuis texte/images. Cible: campagnes premium. Valeur: upsell qualite.
2. **Disponibilite**: open source annonce, template, API.
3. **Stack**: Next.js/Stripe/Auth annonce.
4. **Fonctionnalites**: T2V/I2V, ratios, frame rates, model selection.
5. **Qualite**: wrapper generaliste; peu de logique metier distinctive.
6. **Integration**: reutiliser seulement presets et schemas de capacites.
7. **Adaptations**: mode AlphoGen Cinema, cout, fallback, evaluation provider.
8. **Estimation**: 2-4 jours; faible; risque cout.
9. **Priorite**: ★★★
10. **Verdict**: **S'inspirer**.

### B. Commerce, design et assets

#### 3.11 Pet Product Studio

1. Photos premium pour produits animaliers; cible DTC pet; verticale rentable. 2. Open source annonce/template/API. 3. Stack standard annonce. 4. Upload produit, scenes/presets, exports. 5. Niche mais workflow clair. 6. Recuperer presets dans Product Photography. 7. Ajouter categories, brand kit, R2. 8. 2-4 jours, faible, faible. 9. ★★★. 10. **Adapter**.

#### 3.12 Resale Photo Enhancer

1. Ameliore photos de seconde main; cible Vinted/eBay/marketplaces; valeur volume. 2. Open source annonce/template/API. 3. Stack standard. 4. Nettoyage, fond, eclairage, comparaison. 5. Simple et reutilisable. 6. Module rapide ou preset Product Photography. 7. Batch, preservation produit, exports marketplace. 8. 3-5 jours, faible, faible. 9. ★★★★. 10. **Integrer**.

#### 3.13 AI Logo Studio

1. Logos depuis prompt/croquis; PME/agences; valeur pack branding. 2. Open source annonce/template/API; Skills Logo/Brand Kit. 3. Stack standard. 4. concepts, variations, vector-like export. 5. Utile mais la vraie vectorisation doit etre verifiee. 6. Workflow + UI dans Brand module. 7. SVG reel, trademark warning, palettes/exports. 8. 5-8 jours, moyenne, moyen. 9. ★★★★. 10. **Adapter**.

#### 3.14 AI Business Card

1. Cartes digitales + QR + compagnon; independants/commerciaux. 2. Open source annonce/template/API. 3. Stack standard. 4. personnalisation, QR, page partageable, chatbot. 5. Hors coeur media. 6. Reprendre QR/layout si module Brand. 7. domaines, analytics, privacy. 8. 4-7 jours, moyenne. 9. ★★. 10. **S'inspirer**.

#### 3.15 AI Room Declutter

1. Nettoie photos de pieces; immobilier/location. 2. Open source annonce/template/API; Skills Interior. 3. Stack standard. 4. presets, avant/apres. 5. Petit workflow a ROI rapide. 6. Sous-mode Real Estate. 7. preservation structurelle, batch. 8. 2-4 jours, faible. 9. ★★★★. 10. **Integrer**.

#### 3.16 OldPhoto Restore Studio

1. Restauration/colorisation; grand public/archives. 2. Open source annonce/template/API. 3. Stack standard. 4. restore, sharpen, colorize. 5. Maturite modele probable, faible synergie coeur. 6. Module secondaire. 7. resolution, comparaison, conservation original. 8. 3-5 jours, faible. 9. ★★. 10. **Adapter**.

#### 3.17 ClearMark AI

1. Retrait watermark/logo; createurs. 2. Open source annonce/template/API. 3. Stack standard. 4. inpainting/cleanup. 5. Techniquement simple mais risque juridique majeur. 6. Ne pas exposer comme suppression de watermark generaliste. 7. Restreindre a assets possedes et brand cleanup atteste. 8. 2-4 jours, risque eleve. 9. ★. 10. **Ignorer**.

### C. Portrait, avatar et simulation

#### 3.18 MagicSelf AI

1. Selfies/avatars stylises; consommateurs/createurs. 2. Open source annonce/template/API. 3. Stack standard. 4. styles, galerie, variations. 5. Parcours reutilisable, differentiation faible. 6. Presets dans Avatar/Persona. 7. consentement, suppression, styles. 8. 3-5 jours. 9. ★★★. 10. **Adapter**.

#### 3.19 AI Hairstyle Simulator

1. Essayage coiffure/couleur; salons/beauty. 2. Open source annonce/template/API. 3. Stack standard. 4. presets genre/style/couleur, galerie. 5. Bonne verticale, fidelite visage critique. 6. Sous-module Beauty Try-On. 7. consentement, benchmark identite/cheveux. 8. 5-8 jours, risque moyen. 9. ★★★. 10. **Adapter**.

#### 3.20 AI Professional Makeup Generator

1. Maquillage virtuel; beauty/e-commerce. 2. Open source annonce/template/API. 3. Stack standard. 4. looks, intensites, galerie. 5. Valeur si rendu fidele. 6. Composant Beauty. 7. colorimetrie, peau, consentement. 8. 5-8 jours. 9. ★★★. 10. **Adapter**.

#### 3.21 AI Tattoo Try-On

1. Placement tatouage; studios/clients. 2. Open source annonce/template/API. 3. Stack standard. 4. image corps + design, placement. 5. Niche; fidelite geometrique difficile. 6. Workflow specialise. 7. controles masque/position, policy corps. 8. 1-2 semaines. 9. ★★. 10. **S'inspirer**.

#### 3.22 AI Fitness Body Simulator

1. Simulation corporelle; fitness/coaching. 2. Open source annonce/template/API. 3. Stack standard. 4. presets, avant/apres. 5. Risque safety/claims/body image. 6. Hors priorite. 7. garde-fous medicaux et consentement. 8. 1 semaine, risque eleve. 9. ★. 10. **Ignorer**.

#### 3.23 AI Wedding Photo

1. Photos mariage et face swap; consommateurs. 2. Open source annonce/template/API. 3. Stack standard. 4. 110+ templates, face swap. 5. Bibliotheque de presets utile, policy identite requise. 6. Idee/presets seulement. 7. licences templates, consentement des deux personnes. 8. 1 semaine. 9. ★★. 10. **S'inspirer**.

#### 3.24 AI Group Photo

1. Combine jusqu'a 6 portraits; equipes/familles. 2. Open source annonce/template/API. 3. Stack standard. 4. multi-upload, ratios/resolutions. 5. Workflow clair, identite multi-personne complexe. 6. Module Photo Utilities. 7. consentements multiples, detection echecs. 8. 5-8 jours. 9. ★★★. 10. **Adapter**.

#### 3.25 AI Royal Portrait

1. Portraits artistiques royaux; entertainment/gifting. 2. Open source annonce/template/API. 3. Stack standard. 4. 20 effets. 5. Faible avantage strategique. 6. Presets occasionnels. 7. Rien au-dela d'un preset pack. 8. 1-2 jours. 9. ★. 10. **Ignorer**.

#### 3.26 AI Kids-to-Adult Prediction

1. Prediction apparence enfant adulte; grand public. 2. Open source annonce/template/API. 3. Stack standard. 4. transformation age. 5. Risque mineurs, privacy et promesse trompeuse. 6. Aucun besoin coeur. 7. Compliance lourde. 8. Non recommande. 9. ★. 10. **Ignorer**.

#### 3.27 AI Pet Portrait

1. Portraits artistiques animaux; gifting. 2. Open source annonce/template/API. 3. Stack standard. 4. styles/presets. 5. Simple, faible risque. 6. Preset Image Studio. 7. brand styles, prints. 8. 2-3 jours. 9. ★★. 10. **Adapter**.

#### 3.28 AI Travel Studio

1. Affiches/voyages avec portrait; createurs. 2. Open source annonce/template/API. 3. Stack standard. 4. destinations, posters. 5. Preset pack, pas module majeur. 6. Integrer comme recette sociale. 7. templates/licences. 8. 2-3 jours. 9. ★★. 10. **S'inspirer**.

#### 3.29 AI Kissing Video Generator

1. Animation romantique de deux portraits. 2. Open source annonce/template/API. 3. Stack standard. 4. multi-modeles/ratios. 5. Risque consentement/deepfake disproportionne. 6. Aucun besoin coeur. 7. Garde-fous lourds. 8. Non recommande. 9. ★. 10. **Ignorer**.

### D. Audio, podcast et contenus

#### 3.30 My Podcast Studio

1. **Presentation**: scripts et narration podcast avec controles vocaux. Cible: podcasteurs/formateurs. Valeur: voix premium et edition fine.
2. **Disponibilite**: open source MIT, template, API; Skills audio/podcast.
3. **Stack verifiee**: Next.js, NextAuth, Prisma, Stripe; MiniMax Speech 2.6 HD/Turbo.
4. **Fonctionnalites**: script, voix, vitesse, pitch, volume, historique.
5. **Qualite**: excellent benchmark UX voix, mais beaucoup moins complet que le pipeline video podcast AlphoGen.
6. **Integration**: reprendre controles voix, presets et preview; ne pas remplacer le module Podcast.
7. **Adaptations**: brancher Voice Lab/provider routing, loudness, consentement clone voix.
8. **Estimation**: 3-5 jours; faible; risque faible.
9. **Priorite**: ★★★★
10. **Verdict**: **Adapter**.

#### 3.31 Blogger CMS

1. CMS de blogs IA; marketers/SEO. 2. Open source annonce/template/API. 3. Next.js/Auth/Prisma/Stripe annonce, editeur WYSIWYG. 4. dossiers, categories, generation, edition. 5. Produit complet mais hors media principal. 6. Composants editeur pour Research/repurposing. 7. Supabase, citations, publication CMS. 8. 1-2 semaines. 9. ★★. 10. **S'inspirer**.

#### 3.32 Social Post

1. **Presentation**: copy social, previews et publication. Cible: PME/agences. Valeur: complete la generation jusqu'a distribution.
2. **Disponibilite**: open source MIT, template, API; Skills Social Media Pack/Product Campaign.
3. **Stack verifiee**: Next.js, NextAuth, Prisma, Stripe, previews multi-plateformes.
4. **Fonctionnalites**: LinkedIn/X/Instagram/Facebook/Reddit, tons, previews, publish intents.
5. **Qualite**: composants UI tres reutilisables; publication reelle doit etre comparee a Postiz deja retenu.
6. **Integration**: reprendre previews/composer, conserver Postiz pour OAuth/scheduling.
7. **Adaptations**: modele de post AlphoGen, media library, Postiz mapping, analytics.
8. **Estimation**: 3-5 jours; faible; faible.
9. **Priorite**: ★★★★
10. **Verdict**: **Adapter**.

#### 3.33 AI Meme Studio

1. Memes/images/videos courts; growth teams. 2. Open source annonce/template/API. 3. Stack standard. 4. templates, generation, credits. 5. Utile acquisition, pas coeur. 6. Recipe Social. 7. moderation/trends/templates. 8. 2-4 jours. 9. ★★. 10. **S'inspirer**.

#### 3.34 Mail-Wise

1. Emails/outreach; commerciaux. 2. Open source annonce/template/API. 3. Stack standard. 4. generation, refinement, dispatch intents. 5. Hors positionnement media. 6. Aucun module prioritaire. 7. Integrations email et compliance lourdes. 8. 1-2 semaines. 9. ★. 10. **Ignorer**.

#### 3.35 AI Resume Builder

1. CV et PDF; candidats/coachs. 2. Open source annonce/template/API. 3. Stack standard. 4. layouts, contenu, PDF. 5. Hors coeur. 6. Aucun gain pour workflows media. 7. N/A. 8. Non recommande. 9. ★. 10. **Ignorer**.

#### 3.36 GEO Checker

1. Audit visibilite moteurs IA; marketers/SEO. 2. Open source annonce/template/API. 3. Stack standard. 4. audits ChatGPT/Perplexity/Google. 5. Adjacent a Research, mais preuves/metriques a verifier. 6. Reprendre idees dans Research. 7. citations, benchmarks reproductibles. 8. 1-2 semaines. 9. ★★. 10. **S'inspirer**.

#### 3.37 Prompt Architect

1. Raffinement de prompts; power users. 2. Open source annonce/template/API. 3. Stack standard. 4. conversations, versions, credits. 5. Capacite deja interne a AlphoGen. 6. Reprendre seulement UX timeline si utile. 7. Brancher prompt registry/versioning. 8. 2-3 jours. 9. ★★. 10. **S'inspirer**.

#### 3.38 AI Knowledge Base

1. RAG PDF/URL/Q&A; equipes/support. 2. Open source annonce/template/API. 3. Stack standard avec ingestion/vectorisation annoncee. 4. upload, crawl, chat, billing. 5. Hors coeur et doublon Research. 6. Idees d'UX sandbox. 7. citations, ACL, retention. 8. 1-2 semaines. 9. ★★. 10. **S'inspirer**.

#### 3.39 Character AI Studio (deux variantes du catalogue)

1. Compagnons/personas conversationnels; consumer/agents. 2. Deux templates open source annonces/API. 3. Stack standard. 4. persona, parametres, chat public/prive. 5. Duplication dans le catalogue, hors coeur creation media. 6. Eventuellement persona editor pour agents futurs. 7. safety, memory, privacy. 8. 1-2 semaines. 9. ★. 10. **Ignorer**.

## 4. White Label

### Ce qu'il fournit

Le White Label MuAPI fournit une application marquee, comptes, paiements/credits, dashboard et acces aux generations. C'est pertinent pour lancer rapidement un nouveau SaaS independant.

### Decision AlphoGenAI

**Ne pas utiliser le White Label comme fondation d'AlphoGenAI.** Il dupliquerait:

- Supabase Auth et RLS;
- Stripe et les plans AlphoGen;
- le ledger de credits/couts;
- la bibliotheque R2;
- les jobs, statuts, retries et webhooks;
- l'admin, la publication et le branding.

Usage possible: sandbox interne, prototype commercial jetable ou validation d'une verticale avant integration. Verdict: **S'inspirer**, pas integrer.

## 5. Skills

Le depot Skills est plus directement reutilisable que les applications completes.

### A integrer en premier

| Skill/pack | Usage AlphoGen | Decision | Effort |
|---|---|---|---|
| UGC Ads Workflow / UGC Video Factory | Publicite UGC structuree | Adapter | 3-5 j |
| Amazon Listing Pack | Pack images marketplace | Integrer | 2-4 j |
| Product Campaign Pack | Image + copy + formats sociaux | Integrer | 3-5 j |
| Product Showcase / Product Video Ad Maker | Product Ad | Adapter | 3-5 j |
| AI Clipping / YouTube Shorts | Clipping et Shorts | Adapter | 5-10 j |
| Headshot / Multi-Angle Reshoot | Headshot/persona | Adapter | 3-5 j |
| Fashion Try-On | Mode | Adapter | 5-10 j |
| Interior Design / Floor Plan | Immobilier | Adapter | 3-7 j |
| Storyboard | Story/Director | Integrer | 2-4 j |
| Social Media Pack | Distribution/repurposing | Integrer | 2-4 j |
| YouTube Thumbnail | Thumbnails | Integrer | 2-3 j |
| Logo + Branding / Brand Kit | Branding | Adapter | 4-7 j |

### Mode d'emploi recommande

1. Versionner la recette choisie dans le repo AlphoGen.
2. Remplacer les appels shell MuAPI par les clients/providers existants ou MuAPI selon le routing.
3. Conserver prompts, ordre des etapes, validations et criteres de review.
4. Persister chaque etape dans les jobs/scenes AlphoGen.
5. Ajouter un test de contrat et une QA visuelle, pas recopier aveuglement le Skill.

## 6. Workflows MuAPI

Les Workflows MuAPI peuvent etre utilises comme implementations distantes d'un module AlphoGen. Ils exposent un lancement REST, des statuts et des webhooks. Ils sont pertinents pour les chaines multi-etapes changeant souvent.

### Bons candidats

- Product Campaign Pack;
- Amazon Listing Pack;
- UGC Ads;
- Fashion Try-On;
- Interior/Real Estate;
- Brand Kit;
- clipping si l'ingestion est conforme.

### Mauvais candidats

- simple appel a un modele unique deja supporte en direct;
- workflow contenant Auth, billing ou bibliotheque MuAPI;
- workflow sans version pinnee ni schema de sortie stable.

### Regle pragmatique

Commencer par appeler le workflow tel quel pour prouver la valeur. Ne le reimplementer chez AlphoGen que si le cout, la latence, la confidentialite ou la dependance deviennent problematiques.

## 7. Academy

`ai-creator-academy` est un contenu pedagogique MIT, pas un moteur runtime. Il est utile pour:

- tutoriels integres;
- templates de campagnes;
- onboarding par objectif;
- playbooks de monetisation et distribution.

Il ne remplace aucune brique technique. Verdict global: **S'inspirer**.

## 8. Cartographie globale des modules AlphoGenAI

```text
AlphoGenAI
|- Product & Commerce
|  |- Amazon Listing Pack
|  |- Product Photography
|  |- Resale Enhancer
|  |- Product Ad / UGC
|  `- Campaign Pack
|- Video
|  |- Seedance / Veo / Cinema
|  |- Storyboard
|  |- Clipping
|  `- Shorts
|- People & Brand
|  |- Headshot
|  |- Avatar / Persona
|  |- Fashion & Beauty Try-On
|  |- Logo & Brand Kit
|  `- Thumbnail
|- Audio & Editorial
|  |- Podcast Video
|  |- Voice Lab
|  |- Translation
|  `- Blog / Repurposing
|- Verticals
|  |- Real Estate
|  |- Pet Commerce
|  `- Social Publishing
`- Learning
   |- Academy playbooks
   `- Guided templates
```

## 9. Tableau de decision global

Legende: `Oui` = disponible directement; `Partiel` = recette ou composant proche; `-` = non identifie.

| Module | White Label | Open Source | Skill | Workflow | API | Effort | Priorite | Decision |
|---|---:|---:|---:|---:|---:|---|---:|---|
| UGC Ads | Oui | Oui | Oui | Oui | Oui | 1-2 sem | ★★★★★ | Adapter |
| Amazon | Oui | Oui | Oui | Oui | Oui | 5-8 j | ★★★★★ | Adapter |
| Product Photography | Oui | Oui | Oui | Oui | Oui | 5-8 j | ★★★★★ | Adapter |
| Clipping | Oui | Oui | Oui | Partiel | Oui | 1-2 sem | ★★★★★ | Adapter |
| Shorts | Partiel | Oui | Oui | Partiel | Oui | 5-10 j | ★★★★★ | Adapter |
| Headshot | Oui | Oui | Oui | Partiel | Oui | 4-7 j | ★★★★★ | Adapter |
| Social Campaign | Oui | Oui | Oui | Oui | Oui | 3-5 j | ★★★★ | Adapter |
| Real Estate | Oui | Oui | Oui | Oui | Oui | 5-8 j | ★★★★ | Adapter |
| Fashion Try-On | Oui | Oui | Oui | Oui | Oui | 1-2 sem | ★★★★ | Adapter |
| Storyboard | Partiel | - | Oui | Oui | Oui | 2-4 j | ★★★★ | Integrer |
| Thumbnail | Partiel | - | Oui | Oui | Oui | 2-3 j | ★★★★ | Integrer |
| Logo / Brand Kit | Oui | Oui | Oui | Oui | Oui | 4-7 j | ★★★★ | Adapter |
| Podcast Voice Controls | Oui | Oui | Partiel | Partiel | Oui | 3-5 j | ★★★★ | Adapter |
| Resale Enhancer | Oui | Oui | Partiel | Partiel | Oui | 3-5 j | ★★★★ | Integrer |
| Room Declutter | Oui | Oui | Oui | Partiel | Oui | 2-4 j | ★★★★ | Integrer |
| Premium Veo Video | Oui | Oui | Partiel | Oui | Oui | 3-5 j | ★★★★ | Adapter |
| Avatar / Selfie | Oui | Oui | Partiel | Partiel | Oui | 3-5 j | ★★★ | Adapter |
| Beauty Try-On | Oui | Oui | Partiel | Partiel | Oui | 5-8 j | ★★★ | Adapter |
| Pet Product | Oui | Oui | Partiel | Partiel | Oui | 2-4 j | ★★★ | Adapter |
| Image Studio | Oui | Oui | Partiel | Oui | Oui | 3-5 j | ★★★ | Adapter |
| Translation | Partiel | - | Partiel | Oui | Oui | 3-5 j | ★★★ | Adapter |
| Training/Academy | - | Oui | - | - | - | 3-5 j | ★★★ | S'inspirer |
| Blog/CMS | Oui | Oui | Partiel | Partiel | Oui | 1-2 sem | ★★ | S'inspirer |
| Meme | Oui | Oui | Partiel | Partiel | Oui | 2-4 j | ★★ | S'inspirer |
| GEO Checker | Oui | Oui | - | - | Oui | 1-2 sem | ★★ | S'inspirer |
| Business Card | Oui | Oui | - | - | Oui | 4-7 j | ★★ | S'inspirer |
| Old Photo Restore | Oui | Oui | Partiel | Partiel | Oui | 3-5 j | ★★ | Adapter |
| Travel/Posters | Oui | Oui | Partiel | Partiel | Oui | 2-3 j | ★★ | S'inspirer |
| Group Photo | Oui | Oui | Partiel | Partiel | Oui | 5-8 j | ★★★ | Adapter |
| Tattoo | Oui | Oui | - | Partiel | Oui | 1-2 sem | ★★ | S'inspirer |
| Wedding | Oui | Oui | - | Partiel | Oui | 1 sem | ★★ | S'inspirer |
| Knowledge Base | Oui | Oui | - | Partiel | Oui | 1-2 sem | ★★ | S'inspirer |
| Prompt Architect | Oui | Oui | - | Partiel | Oui | 2-3 j | ★★ | S'inspirer |
| Resume | Oui | Oui | - | - | Oui | - | ★ | Ignorer |
| Mail/Outreach | Oui | Oui | - | - | Oui | - | ★ | Ignorer |
| Kissing Video | Oui | Oui | - | Partiel | Oui | - | ★ | Ignorer |
| Kids-to-Adult | Oui | Oui | - | Partiel | Oui | - | ★ | Ignorer |
| Fitness Body | Oui | Oui | - | Partiel | Oui | - | ★ | Ignorer |
| ClearMark | Oui | Oui | - | Partiel | Oui | - | ★ | Ignorer |
| Character Chat | Oui | Oui | - | Partiel | Oui | - | ★ | Ignorer |

## 10. Gains estimes

| Approche | Temps gagne | Maintenance economisee | Limite |
|---|---:|---:|---|
| Reprendre une App complete | 2-6 semaines en apparence | Faible | Forte duplication AlphoGen |
| Extraire son studio/composants | 1-3 semaines/module | Moyenne | Demande adaptation Supabase/R2 |
| Adapter un Skill | 3-10 jours/recette | Forte | Doit etre versionne et teste |
| Appeler un Workflow MuAPI | 1-5 jours | Tres forte au debut | Dependance cout/schema MuAPI |
| Ajouter MuAPI comme provider | 3-7 jours initialement | Forte sur nouveaux modeles | Lock-in a contenir par contrat |
| White Label complet | Lancement rapide d'un autre SaaS | Forte | Mauvais fit avec AlphoGen existant |

Ordre de grandeur realiste: **2 a 4 mois economises** sur les cinq modules prioritaires (UGC, Amazon, Clipping, Headshot, Social Campaign) par rapport a cinq implementations reparties de zero, a condition de reprendre les parcours/recettes et non de fusionner cinq shells SaaS.

## 11. Plan pragmatique de branchement

1. **Amazon Listing Pack**: importer recette + UI multi-reference, brancher BytePlus/MuAPI, une QA pack complet.
2. **Clipping**: adapter l'extraction/ranking et reutiliser Whisper, captions et Postiz AlphoGen.
3. **Headshot**: reprendre studio multi-reference et consentement existant des personas.
4. **UGC**: conserver le formulaire Open AI UGC et remplacer uniquement la couche MuAPI par le routing AlphoGen/MuAPI; gate visuel obligatoire.
5. **Social Campaign Pack**: relier assets generes, copy multi-format et Postiz.

Chaque module suit la meme regle de sortie: une seule generation significative, critere PASS/FAIL explicite, puis conservation ou abandon de la brique. Pas de long refactor avant preuve produit.

## 12. Conclusion

Le catalogue MuAPI n'est pas une application a absorber; c'est un magasin de briques. Les gains les plus rapides viennent de trois choses:

1. **Apps** pour recuperer des studios et parcours deja dessines;
2. **Skills** pour recuperer des recettes metier;
3. **Workflows/API** pour executer rapidement sans reconstruire l'orchestration.

La decision la plus rentable pour AlphoGenAI est d'integrer ou adapter en priorite **Amazon, Clipping, Headshot, UGC et Social Campaign**, puis Real Estate/Fashion. Le White Label complet et les niches sans synergie doivent rester hors du coeur.

Cette approche respecte le produit existant: AlphoGenAI conserve son UX, ses comptes, sa facturation, ses jobs, sa bibliotheque, ses fournisseurs et sa publication. MuAPI sert uniquement d'accelerateur interchangeable.
