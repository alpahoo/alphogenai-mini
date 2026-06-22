# agent/log.md — Journal chronologique

Entrée la plus récente en haut. Format :

```
## YYYY-MM-DD HH:MM — Agent — Titre
- Fait :
- Fichiers modifiés :
- Tests : (npm test / tsc / build) → résultat
- Prochaine étape :
```

---

## 2026-06-22 — Claude — T-1131f-hardening-fix2 (review Codex, P1 transactionnel)
- Fait : l'invalidation du render est déplacée AVANT toute mutation de segments. script : reset podcasts
  (video_url/render_status/render_error + status ready) AVANT delete/insert ; reset échoue → 500, segments
  intacts. tts : invalidateRender() AVANT update segment (preview) / AVANT la boucle (full) ; échec → 500 sans
  muter de segment. Plus jamais « nouveau dialogue/audio + ancien MP4 » persisté.
- Fichiers : `app/api/podcasts/[id]/script/route.ts`, `app/api/podcasts/[id]/tts/route.ts`, + leurs tests, `agent/*`.
- Tests : 73 tests podcast verts (ajustés : reset-fail → 0 mutation segment ; invalidate-fail → 0 update segment) ;
  build OK ; tsc clean.

## 2026-06-22 — Claude — T-1131f-hardening-fix (review Codex, 2 P1)
- Fait : les updates d'invalidation du render vérifient maintenant `{error}`. (1) script : reset final échoué →
  rollback vers l'ancien dialogue (`previousSegments`) + 500 « ...Your previous script was kept. ». (2) tts :
  invalidateRender() renvoie bool ; ready>0 + échec → 500 « Audio was generated but the stale video could not be
  cleared. Please retry. » (provider caché, audio sauvé conservé).
- Fichiers : `app/api/podcasts/[id]/script/route.ts`, `app/api/podcasts/[id]/tts/route.ts`, + leurs tests, `agent/*`.
- Tests : 73 tests podcast verts (+3) ; build OK ; tsc clean. Pas de migration, podcast-only.

## 2026-06-22 — Claude — T-1131f-hardening (stale render invalidation)
- Fait : un ancien MP4 ne peut plus rester affiché/associé après modif du script ou de l'audio.
  (1) `/api/podcasts/[id]/script` : sur succès (nouveaux segments), reset video_url=null / render_status=idle /
  render_error=null. (2) `/api/podcasts/[id]/tts` : invalidateRender() si ready>0 (preview ou full) ; rien si
  tout skipped. (3) UI `/create/podcast` : Rewrite dialogue + Generate/Regenerate voices vident l'état vidéo
  local (voices seulement si json.ready>0) ; timeout polling render 5 min → stop + message propre.
- Fichiers : `app/api/podcasts/[id]/script/route.ts`, `app/api/podcasts/[id]/tts/route.ts`,
  `app/(workspace)/create/podcast/page.tsx`, `app/api/podcasts/[id]/script/route.test.ts`,
  `app/api/podcasts/[id]/tts/route.test.ts`, `agent/*`.
- Tests : 70 tests podcast verts (+3) ; build OK ; tsc clean. Pas de migration, podcast-only, autres flows intacts.

## 2026-06-22 — Claude — T-1131f UI /create/podcast V1 + e2e + hub live
- Fait : page guidée `app/(workspace)/create/podcast/page.tsx` (topic → dialogue → voices → render → MP4),
  endpoints existants seuls, bearer auth, stepper 4 étapes, dialogue lecture seule, status/segment + preview
  audio, render gated (tous ready), poll GET jusqu'à done/failed, <video> final. QA e2e prod réelle :
  create → 8 tours → 8 voix ready → render → MP4 43s 1280×720 two-shot (speaker actif, captions, lower-thirds ;
  marques publiques conservées type Netflix/Uber). Carte hub Podcast « Soon »→live (href /create/podcast,
  overlay Coming soon conditionné).
- Fix runtime (trouvé en QA) : Modal render_podcast téléchargeait l'audio R2 via urllib → HTTP 403 (UA bloqué
  par l'edge R2) ; remplacé par httpx (timeout 120, follow_redirects) comme le reste du pipeline ; Modal redéployé.
- Fichiers : `app/(workspace)/create/podcast/page.tsx`, `modal_app/video_pipeline.py` (urllib→httpx),
  `app/(workspace)/create/page.tsx` (hub flip), `agent/*`.
- Scope : pas de nouvelle route API/migration ; pas de lip-sync ; two_shot only ; Story/Avatar/Research/URL intacts.
- Tests : 67 tests podcast verts ; py_compile OK ; build OK ; tsc clean ; Modal déployé ; e2e prod vert.
- Série T-1131 (a→f) close. V1.1 possible : upload audio/script, édition dialogue (PATCH segment), voice picker
  (PATCH speaker), layouts split_screen/talk_show.

## 2026-06-22 — Claude — T-1131e-fix (review Codex, 2 points)
- Fait : (P1 bloquant) `import subprocess` ajouté dans `_podcast_probe_duration()` et `render_podcast()`
  (subprocess était importé function-local partout sauf mes 2 fonctions → NameError runtime malgré py_compile OK).
  Modal redéployé (alphogenai-v2). (P2) route `/render` : vérifie `{error}` de l'update render_status=rendering →
  500 + pas de trigger Modal si l'update DB échoue.
- Fichiers : `modal_app/video_pipeline.py`, `app/api/podcasts/[id]/render/route.ts(+test)`, `agent/*`.
- Tests : 36 tests render/podcast verts (+1 : mark-rendering fail → 500 sans trigger) ; py_compile OK ; build OK ;
  tsc clean ; Modal redéployé.
- Prochaine étape : T-1131f (UI /create/podcast).

## 2026-06-22 — Claude — T-1131e Podcast render/compositing (two-shot, Modal CPU)
- Fait : assemblage MP4 podcast à partir des segments audio prêts. Migration Option A
  (`20260622_add_podcast_render_columns.sql` : podcasts + video_url/render_status/render_error) **appliquée prod**
  (vérifié). Modal `render_podcast()` (overlay_image, CPU, timeout 600) + webhook `/render-podcast` (spawn)
  **déployés** (alphogenai-v2). `lib/modal-client.ts` triggerRenderPodcast (fire-and-forget, payload {podcast_id}).
  Route SaaS `POST /api/podcasts/[id]/render` : auth+ownership 404, 400 si layout≠two_shot, 400 si segments pas
  tous ready+audio_url, 409 si déjà rendering ; set render_status=rendering ; trigger Modal ; 202. Modal lit tout
  server-side, ffprobe vraies durées → réécrit start_ms/end_ms, compose two-shot (placeholder avatars, speaker
  actif, lower-thirds, captions déterministes), concat audio+gap, encode libx264+aac, upload R2 → video_url +
  render_status=done ; échec → failed+render_error, video_url inchangé.
- Fichiers : `supabase/migrations/20260622_add_podcast_render_columns.sql`, `modal_app/video_pipeline.py`
  (render_podcast + /render-podcast), `lib/modal-client.ts`, `app/api/podcasts/[id]/render/route.ts(+test)`, `agent/*`.
- Scope : Modal CPU only, pas de GPU/lip-sync/UI/débit crédit ; provider TTS jamais exposé ; Story/Avatar/Research
  intacts ; render explicite uniquement. split_screen/talk_show → V1.1 (400 propre en attendant).
- Tests : 67 tests podcast verts (8 nouveaux render route) ; py_compile OK ; build OK ; tsc clean ; Modal déployé.
- Prochaine étape : T-1131f (UI /create/podcast — flip carte hub « Soon »→live seulement quand e2e vérifié).

## 2026-06-22 — Claude — T-1131d-fix (review Codex, 3 points)
- Fait : (1) gestion des erreurs `{error}` sur les updates `podcast_segments` (preview→500 si update échoue ;
  full→segment marqué failed, plus compté ready, si update échoue). (2) clé R2 versionnée par génération
  (`{segId}-{randomUUID()}.mp3`) pour éviter le cache sur `force` ; audio_url maj seulement après upload OK.
  (3) host+guest requis avant génération → 500 « Podcast is missing its speakers ».
- Fichiers : `app/api/podcasts/[id]/tts/route.ts`, `app/api/podcasts/[id]/tts/route.test.ts`, `agent/*`.
- Tests : 59 tests podcast verts (4 nouveaux : speaker manquant→500, preview update fail→500, full update
  fail→segment failed, force→clé R2 unique). build OK ; tsc clean.
- Scope : pas de migration, pas de render, pas d'UI. Prochaine étape : T-1131e (render/compositing).

## 2026-06-22 — Claude — T-1131d Podcast multi-speaker TTS (backend)
- Fait : audio réel par segment (pas de render/lip-sync). Helper pur `lib/podcast/voices.ts` :
  resolveSpeakerVoices (host/guest distinctes, défauts rachel/adam, respecte voice_id, nudge sur collision) +
  estimateSegmentTimings (start/end ms cumulés + gap 300ms, provisoires). Route `POST /api/podcasts/[id]/tts` :
  auth+ownership 404, 503 si TTS indispo, preview (1 segment), force, full (skip ready sauf force),
  generateVoiceover (ElevenLabs→OpenAI fallback) → uploadBufferToR2 (audio/podcast/{id}/{segId}.mp3) →
  update audio_url+timings+status ready. Échec : retry 1× → status failed, ancien audio_url conservé,
  autres segments continuent ; podcasts.status non modifié. maxDuration=60, cap 10, provider jamais exposé.
- Fichiers : `lib/podcast/voices.ts`, `app/api/podcasts/[id]/tts/route.ts`,
  `lib/podcast/__tests__/voices.test.ts`, `app/api/podcasts/[id]/tts/route.test.ts`, `agent/*`.
- Scope : aucune migration ; pas de render/lip-sync ; pas d'UI ; pas de `/create/podcast` ; carte hub « Soon » ;
  pas de Modal (réservé T-1131e). LiteLLM/TTS providers internes non exposés.
- Tests : 55 tests podcast verts (17 nouveaux : voices + route tts). build OK ; tsc clean.
- Prochaine étape : T-1131e (render/compositing — probablement Modal, où la durée audio réelle sera mesurée).

## 2026-06-22 — Claude — T-1131c-fix (review Codex, 4 points)
- Fait : P1 prompt moins restrictif (autorise marques/modèles du sujet ; interdit seulement les providers/infra
  internes AlphoGen sauf si le sujet les demande). P2 scrubber : blocklist réduite aux infra internes
  confidentielles (heygen/byteplus/atlascloud/evolink/bailian/kie.ai/litellm), OpenAI/Seedance/Kling/Wan/LTX/
  ElevenLabs conservés ; scrub conditionnel (terme du topic non supprimé). P3 alternance : refus de >2 tours
  consécutifs du même speaker. P4 régénération non-destructive : snapshot + restauration des anciens segments
  si l'insert échoue.
- Fichiers : `lib/podcast/dialogue.ts`, `app/api/podcasts/[id]/script/route.ts`,
  `lib/podcast/__tests__/dialogue.test.ts`, `app/api/podcasts/[id]/script/route.test.ts`, `agent/*`.
- Tests : 38 tests podcast verts (helpers + routes, dont nouveaux : scrub conditionnel, brands publics conservés,
  >2 consécutifs rejeté, restore après insert échoué). build OK ; tsc clean.
- Scope : pas de migration, pas de TTS/render, pas de `/create/podcast`, carte hub « Soon ».
- Prochaine étape : T-1131d (multi-speaker TTS).

## 2026-06-22 — Claude — T-1131b+c Podcast schema + dialogue generator (backend)
- Fait : base backend Podcast Video. Migration `20260622_create_podcast_schema.sql` (podcasts/podcast_speakers/
  podcast_segments + RLS owner via join + indexes/uniques + trigger updated_at) **appliquée en prod** via
  Supabase MCP (projet qbrpzmuedfugbhoeytdj) — vérifié : 3 tables, RLS on, 4 policies chacune. API routes :
  POST/GET /api/podcasts, GET/PATCH /api/podcasts/[id], POST /api/podcasts/[id]/script. Auth bearer
  (`lib/podcast/auth.ts`), service-role pour requêtes, ownership strict (404). POST crée draft + 2 speakers
  (host/guest). Script via LiteLLM gateway (`lib/podcast/dialogue-llm.ts`) + helpers purs (`lib/podcast/dialogue.ts` :
  buildPodcastDialoguePrompt, parsePodcastDialogueResponse fences/wrapper/array, normalizePodcastSegments +
  scrub provider names, validatePodcastSegments 6–10 + alternance) ; enums/validators (`lib/podcast/podcast.ts`).
  Aucun TTS/audio/render.
- Fichiers : migration sql, `lib/podcast/{auth,dialogue,dialogue-llm,podcast}.ts`, `lib/podcast/__tests__/dialogue.test.ts`,
  `app/api/podcasts/route.ts(+test)`, `app/api/podcasts/[id]/route.ts(+test)`, `app/api/podcasts/[id]/script/route.ts(+test)`,
  `agent/tasks.md`, `agent/log.md`.
- Scope : backend + migration autorisés ; pas de render/TTS ; pas de `/create/podcast` ; carte hub reste « Soon » ;
  flows existants intacts ; LiteLLM only (pas Anthropic direct).
- Tests : 34 tests podcast verts ; build OK ; tsc clean. NB : 1 test pré-existant hors scope échoue
  (`app/api/jobs/[id]/voiceover/route.test.ts`, mismatch message mux) — non lié, non touché.
- Prochaine étape : T-1131d (multi-speaker TTS) — touchera TTS/coût → STOP + validation. Review Codex.

## 2026-06-22 — Claude — T-1131-poc Podcast compositing prototype (off-prod)
- Fait : prototype jetable pour juger le concept visuel podcast. `scripts/poc/podcast/segments.json`
  (2 speakers, 8 segments alternés) + `build_poc.py` (PIL frames + numpy audio placeholder + ffmpeg de
  `imageio_ffmpeg`). Sortie locale `tmp/podcast-poc/output.mp4` : two-shot 1280×720 16:9 24fps H.264+AAC,
  34,5 s, ~13 s rendu CPU. Validé via 2 frames extraites (6s Guest actif, 9s Host actif) : layout lisible,
  alternance claire, speaker actif identifiable (bordure+panneau+waveform+lower-third), captions exactes
  depuis le JSON, mux audio OK. Timeline structurée en clips/segment → extensible lip-sync.
- Fichiers : `scripts/poc/podcast/{segments.json,build_poc.py}` (nouveaux), `docs/product/podcast-compositing-poc-report.md`
  (nouveau), `.gitignore` (+`tmp/`), `agent/tasks.md`, `agent/log.md`.
- Off-prod : aucun API/DB/migration/route ; `/create/podcast` non créé ; flows existants intacts ;
  MP4 + intermédiaires NON commités (tmp/ ignoré) — aucun coût (pas de TTS provider, pas de réseau).
- Tests : MP4 valide (ffprobe h264/aac), critères d'acceptation tous verts (voir rapport).
- Reco : hybride voice-first d'abord (cheap/rapide/crédible), lip-sync en render_mode premium. Prochaine
  étape : T-1131b (schema) — touche DB/migration → STOP + validation avant code. Review Codex.

## 2026-06-22 — Claude — T-1131a Podcast Video backend spec (docs-only)
- Fait : spec technique du backend Podcast Video. Audit des briques (TTS mono `lib/tts.ts`, script narratif
  mono `lib/research/script.ts`, lip-sync HeyGen, mux audio→vidéo existant `app/api/jobs/[id]/voiceover`,
  Modal `lib/modal-client.ts`/`modal_app`, post-prod overlay/captions, `lib/lipsync-cost.ts` ; pas de DB
  podcast). Architecture V1 (pipeline 9 étapes). Reco moteur : Option B voice-first en V1 (audio multi-speaker
  + speakers cadrés, pas de lip-sync exact), Option A lip-sync en V1.1 sur le même contrat ; Option C écartée.
  Data model proposé (4 tables, RLS owner) non appliqué. API contract (POST/GET/PATCH /api/podcasts +
  /script /tts /render). Failure model (jamais débiter/render sans confirmation, fallbacks sans abort).
  Cost model V1. Découpage T-1131a..f. Non-goals.
- Fichiers modifiés : `docs/product/podcast-video-backend-spec.md` (nouveau), `agent/tasks.md`, `agent/log.md`.
- Docs-only : aucun runtime, aucune migration, aucun changement UI ; `/create/podcast` non créé ; flows
  Story/URL/Avatar/Product/Research intacts.
- Tests : n/a (docs-only).
- Prochaine étape : si priorisé, T-1131b (schema) — touche DB/migration → STOP + validation avant code. Review Codex.

## 2026-06-22 — Claude — T-1130f Visual guided flow pass (UI-only)
- Fait : rapprochement visuel des flows validés (style Jogg/Topview, sans clone).
  P1 Hub `/create` : remplacé les blocs gradient abstraits par des mini-illustrations métier inline-SVG
  par carte (Story clap+frames, URL page→vidéo, Avatar tête+waveform+script, UGC phone+produit+cœur,
  Explainer slide+captions, Podcast 2 micros + « Coming soon » dimmé). P3 `/create/url` : vraies vignettes
  d'exemple (mocks page produit/article/docs) au lieu des gradients + overlay de loading guidé
  (Analyze URL → Collect media → Write script → Open plan). P2 `/create/story` : bouton « Add visual
  references » visible dans la zone de brief (story-only, ouvre le panneau références existant).
- Fichiers modifiés : `app/(workspace)/create/page.tsx`, `app/(workspace)/create/url/page.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`, `agent/tasks.md`, `agent/log.md`.
- UI-only : aucun backend/route/API/DB/migration ; handlers de génération inchangés ; `POST /api/research/jobs`
  réutilisé tel quel ; Product/Social/`/research` intacts ; `/create/podcast` non créé.
- Tests : npm run build OK puis tsc clean (exit 0) — /create 3,38 kB, /create/url 5,83 kB, /create/[mode] 37,1 kB.
- QA prod (Claude-in-Chrome, premium) : Hub 6 cartes visuelles rendues + podcast DIV non-cliquable
  (« Coming soon » + « Soon ») ; url 3 vignettes mocks + overlay 4 étapes affiché, vrai job
  `16b0c2a3-2cdf-4e2c-bfa6-36ff74294d97` créé puis nav `/research/[id]` ; story « Add visual references »
  ouvre le panneau (chip Text with Reference activée) ; product : pas de chips/bouton, Generate conservé.
  Note : framer-motion (opacity d'entrée) throttlé sous automation (rAF gelé) — vérifs faites via
  textContent + style `!important` ; en usage réel l'animation se termine normalement.
- Prochaine étape : review Codex. Série T-1130 (a→f) close.

## 2026-06-22 — Claude — T-1130e Podcast Video guided flow (Option B, docs-only)
- Fait : mini-audit read-only (Podcast) → aucune brique réelle. Confirmé : pas de route `/create/podcast` ;
  hub card `status:"soon"` sans href (non-cliquable) ; pas de génération script dialogue multi-speaker
  (`lib/research/script.ts` mono-voix) ; pas de TTS multi-speaker (`lib/tts.ts` = 1 texte→1 voix) ;
  pas de layout two-shot/split-screen/talk-show (`VALID_ENGINES` tous mono-sortie) ; pas de
  render/compositing podcast ; pas de DB. Option C écartée (rien de réutilisable sans tromper). Option B
  validée par Paul → spec docs-only `docs/product/podcast-video-guided-flow-spec.md` : UX cible (entry +
  editor), data model proposé (non appliqué), gaps backend explicites, découpage futur T-1131a..f.
- Fichiers modifiés : `docs/product/podcast-video-guided-flow-spec.md` (nouveau), `agent/tasks.md`, `agent/log.md`.
- Docs-only : aucun runtime, aucune route, aucune migration, aucun backend ; `/create/podcast` non créé ;
  carte hub inchangée (reste « Soon ») ; flows Story/URL/Avatar/Product + /research intacts.
- Tests : n/a (docs-only, aucun code touché).
- Prochaine étape : si priorisé, démarrer T-1131a (spec backend). Review Codex. Série T-1130 (a→e) close.

## 2026-06-22 — Claude — T-1130d Avatar guided polish (Option A)
- Fait : polish UI-only de `/create/avatar` (page existante conservée, pas de refonte). Ajout d'un
  stepper visuel 3 étapes en haut (1 Select avatar · 2 Modify script · 3 Voice & render) dérivé de
  l'état du formulaire (coche verte quand une étape est faite). Libellés de mode en clair : Presenter
  = « Talking head from a photo », Cinematic = « Cinematic shot + lip-sync » + une phrase courte
  d'explication selon le mode. Pas d'AI writer inline ni de toggle sous-titres (auraient demandé du
  backend → exclus du scope par consigne).
- Fichiers modifiés : `app/(workspace)/create/avatar/page.tsx` (1 fichier, +51/-2).
- UI-only : aucun backend / route / migration ; HeyGen (avatars, voix, clone voice), looks, lip-sync,
  POST /api/jobs et tous les handlers existants intacts.
- Tests : npm run build OK (ordre build→tsc pour éviter le faux négatif `.next/types` signalé par Codex),
  puis tsc clean (exit 0).
- QA prod (Claude-in-Chrome, compte premium) : page rendue (pas de gate), stepper présent et réactif
  (sélection d'un avatar → étape 1 cochée + « Avatar ready » dans l'aside), 10 avatars HeyGen + 8 voix
  chargés, toggle Presenter/Cinematic met à jour les hints du stepper + la description, bouton Generate
  présent. Screenshot capturé.
- Prochaine étape : T-1130e (Podcast). Review Codex.

## 2026-06-22 — Claude — T-1130c URL to Video guided entry (Option A)
- Fait : entrée guidée « coller une URL → créer une vidéo » qui masque la complexité Research.
  Nouvelle page `/create/url` centrée : titre + sous-titre, champ URL + CTA « Create video »,
  Try example, 3 miniatures d'exemple (préremplissent URL + intention), chips Product/Tutorial/News,
  lien discret « Open Research Studio ». Create video → `POST /api/research/jobs` (route existante,
  URL en input_url, topic auto + durée par intention) → handoff `/research/[id]` (vrai job).
  « No URL? Upload product media manually » → modale → studio Product/UGC existant `/create/product`.
  Hub `/create` : carte URL to Video pointe vers `/create/url`.
- Fichiers modifiés : `app/(workspace)/create/url/page.tsx` (nouveau), `app/(workspace)/create/page.tsx`.
- UI-only : aucune route/API/DB neuve, aucune migration, aucun pipeline ; Research Studio + watchlists intacts.
- Tests : tsc clean ; npm run build OK sans warning (/create/url 4,65 kB static).
- QA prod (Claude-in-Chrome) : hub→/create/url ✓, page épurée (pas de watchlists/recent) ✓,
  Try example remplit ✓, miniature Docs remplit URL + active Tutorial ✓, modale upload→/create/product ✓,
  Create video crée job `0bf65257-5beb-48fc-ae73-c2216de1699f` (mode=product, input_url apple, topic auto,
  30s, draft) + navigue /research/[id] ✓, /research avancé intact ✓.
- Prochaine étape : T-1130d (Avatar guided flow), T-1130e (Podcast). Review Codex.

## 2026-06-22 — Claude — T-1130b P2 fix (Codex) : références cachées mais attachées
- Problème (Codex P2) : en « Text to Video », des références déjà ajoutées restaient attachées
  (encore envoyées au backend) mais cachées → l'utilisateur croyait faire un prompt-only.
- Audit : `references` (panneau, compté par le badge) et `activeComposerRefs` (@-mentions visibles
  dans le prompt) sont SÉPARÉS dans submitJob (`allReferences = {...references, ...activeComposerRefs}`).
  Le piège ne concerne que `references` (les refs du panneau, cachées quand replié).
- Fix (UI-only, story-only) : warning sous les chips quand `storyTab==="text"` ET
  `Object.keys(references).length > 0` : « N reference(s) still attached and will be sent ». Deux
  actions explicites : « Review references » (→ Text with Reference + ouvre le panneau) et
  « Remove references » (→ `setReferences({})` explicite). Aucune suppression silencieuse, aucun
  backend touché, product/social inchangés (warning gardé story-only).
- Vérif : tsc → exit 0 ; build OK sans warning, /create/[mode] 37,1 kB. QA prod via Claude-in-Chrome.

## 2026-06-22 — Claude — T-1130b Story guided layer (story-only)
- Fait : couche guidée additive sur /create/story (mode === "story" uniquement), sans refactor
  du fichier partagé (2677 l) et sans toucher product/social. Rangée de chips « How do you want
  to start? » : Text to Video / Text with Reference (badge compteur refs) / Director scenes,
  câblée sur l'état existant (storyTab + setShowReferences + setDirectorOpen). Header story déjà
  conforme, Advanced replié, AI Director accessible. Aucune logique de génération modifiée
  (submitJob, references, duration, aspect, engine, audio intacts).
- Scope : UI-only, story-guardé. Aucune route/API/DB/migration, aucun backend, aucune route dédiée,
  pas de duplication de logique.
- Vérif : tsc → exit 0 ; npm run build → OK sans warning, /create/[mode] 36,9 kB. QA visuelle
  /create/story + non-régression /create/product & /create/social via Claude-in-Chrome après déploiement.
- Fichiers : app/(workspace)/create/[mode]/page.tsx, agent/tasks.md, agent/log.md.
- E2E prod vérifié (Claude-in-Chrome) : /create/story affiche les 3 chips ; « Text with Reference »
  s'active + ouvre le panneau références ; « Director scenes » s'active + ouvre l'AI Director
  (« Turn the prompt into an editable shot plan »). Non-régression : /create/product (« Product
  Video ») et /create/social (« Social Clip ») n'ont PAS de chips et gardent Generate. ✅

## 2026-06-22 — Claude — T-1130a Guided Creation Hub
- Fait : `app/(workspace)/create/page.tsx` refait en hub guidé visuel (cible = mockup
  mockups/alphogen-guided-flows-v2.html). Header « Create a video » + grille de 6 cartes :
  Story/Cinematic (featured sombre, Core, → /create/story), URL to Video (→ /research),
  Avatar (→ /create/avatar), Podcast (Soon, disabled), Product/UGC (→ /create/product),
  Explainer (Low cost, → /research). Mini-visuels gradient repris du mockup, design blanc/soft,
  accents bleu/cyan, états hover + disabled. Retiré l'ancien dashboard (Advanced Tools, AI
  Playground, Start-from-scratch, Recent Projects + fetch Supabase) → plus de page longue,
  pas de bloc noir Research, pas de watchlists.
- Scope : UI/navigation only. Réutilise les routes existantes ; aucune route/API/DB/migration,
  aucun changement pipeline. Flows détaillés URL/Avatar/Podcast/UGC = T-1130b/c/d.
- Vérif : tsc → exit 0 ; npm run build → OK sans warning, /create 2,13 kB (statique).
  QA visuelle navigateur (Claude-in-Chrome) prévue après déploiement (review visuelle Codex).
- Fichiers : app/(workspace)/create/page.tsx, agent/tasks.md, agent/log.md.
- Vérif fonctionnelle (audit routes + navigation live Claude-in-Chrome) : le hub est l'entrée
  RÉELLE de création, pas une couche statique. /create/[mode] supporte story/product/social
  (MODE_CONFIG) avec logique UGC réelle pour product (ugcAngle/ugcCreator/ugcLooks/
  getUGCSocialPreset). Navigué chaque carte branchée en prod → vrai flow : /create/story
  (« Story Video » + Generate), /create/avatar (« Avatar Video »), /create/product
  (« Product Video » UGC + Generate), /research (Research home). Aucun 404/login. Podcast =
  seule carte disabled (« Soon », pas de route). href des Link corrects (clic utilisateur
  navigue ; .click() synthétique ne déclenche pas le routeur Next, quirk d'automation).

## 2026-06-22 — Claude — Tier B : corrections review Codex (P1 versioning + P3 commentaire)
- P1 (correction) : le brouillon n'était pas lié à la version du storyboard → un plan régénéré
  pouvait être masqué par un vieux draft. Fix : `working_storyboard` stocke désormais
  `storyboardId` (route PUT) ; le Studio ne réutilise le draft que si
  `ws.storyboardId === storyboard.id` (sinon il repart du plan).
- P1 (vrai clear) : ajout `DELETE /api/research/jobs/[id]/working-storyboard` (→ working_storyboard
  = null). « Reset to plan » appelle `onClear` ET supprime l'autosave qui aurait réécrit une copie
  du plan (skipNextSaveRef). Le draft est donc réellement vidé.
- P3 : commentaire d'en-tête de explainer-studio.tsx corrigé (n'était plus « in-memory only »).
- Vérif : tsc → exit 0 ; vitest lib/explainer → 27 OK ; build OK sans warning, /research/[id] 16,4 kB.
- **E2E prod vérifié (Claude-in-Chrome + SQL)** : édit → Saved (draft taggé storyboardId) →
  reload → draft **repris** (match version OK) ; « Reset to plan » → reload → draft absent ET
  `SELECT working_storyboard FROM research_jobs` = **NULL** (vrai clear, pas de copie du plan).
  P1 + P3 corrigés et validés.

## 2026-06-22 — Claude — Tier B : persistance du working copy (autosave)
- But : les édits du Studio survivent au reload (sérénité tests + bêta-testeurs).
- DB : migration `20260622_add_working_storyboard.sql` → colonne `research_jobs.working_storyboard jsonb`
  (stocke `{ scenes, savedAt }`). **Appliquée sur la prod qbrpzmuedfugbhoeytdj via Supabase MCP**
  (apply_migration, success). RLS existante par utilisateur protège la colonne. `research_storyboards`
  jamais touché.
- Route : `PUT /api/research/jobs/[id]/working-storyboard` (auth + ownership + `sanitizeEditedScenes`
  → écrit `{ scenes, savedAt }`). Lecture : la page lit déjà `research_jobs` en `select("*")`.
- UI : page seed le Studio depuis `working_storyboard` si présent (sinon le plan) via `studioInitial` ;
  passe `plan` séparément pour que « Reset to plan » vise bien le plan. Studio : **autosave débouncé
  (1,5s)** + indicateur Saving…/Saved ; sous-titre/pied de page mis à jour.
- Coût : ~0 € (quelques Ko/plan, serverless déjà inclus). Aucun Modal/pipeline générative touché.
- Vérif : tsc → exit 0 ; vitest lib/explainer → 27 OK ; npm run build → OK sans warning, nouvelle route
  compilée, /research/[id] 16,2 kB.
- **E2E prod vérifié (Claude-in-Chrome)** : éditer une scène → indicateur « Saved » → **reload de la
  page** → réouverture du Studio → l'édit est **persisté** (textarea + preview). « Reset to plan »
  retire le brouillon. Plan de test nettoyé. Tier B opérationnel en prod.

## 2026-06-22 — Claude — T-1120f e2e « Render these edits » réussi (prod)
- E2E complet sur prod (déploiement Tier A 71971e2 live) via Claude-in-Chrome :
  ouvrir l'Explainer Studio → éditer le texte d'une scène (marqueur) → « Render these
  edits (~$0.03) » → POST OK → job créé, panneau « Rendering… » → ~95s plus tard
  « Raw explainer ready ». MP4 confirmé sur la page Job (/jobs/8314b207-73fb-4617-b896-
  5e9a5610fe51, src R2 signé `…_explainer.mp4`) et **présent en Library**. Coût ~quelques
  cents (Modal CPU), conforme. Le chemin édité (route Tier A + sanitizeEditedScenes) est
  donc validé bout-en-bout. T-1120f terminé.

## 2026-06-22 — Claude — T-1120f QA (Claude-in-Chrome) + fix robustesse preview
- QA visuelle/e2e sur la prod live (www.alphogen.com, plan approuvé modal.com) via
  Claude-in-Chrome :
  - Research Home (T-1120b) : chips workflow, composer, templates, watchlists, Recent
    research (9 + badges) ✅
  - Plan Review (T-1120c) : progress bar, Plan Summary (4 tuiles), Sources 5 + « Show all
    (5 hidden) », Suggested references + bannière consentement + « Review all (14 hidden) » ✅
  - Render & post-production (T-1120e) : Raw/Final, preview présent, « Open Studio »,
    « Render explainer (~$0.03) » ✅
  - Preview : iframe charge, accès cross-frame OK (allow-same-origin), `time()` pilote le
    rendu ✅. Studio : overlay OK, 6 scènes × actions, inspecteur, et **édition → preview
    se met à jour** (marqueur retrouvé dans le srcdoc après debounce) ✅
  - Console : seules 3 erreurs d'extension Chrome (message channel) — pas notre app ✅
- Fix robustesse (bug réel trouvé) : le rAF de l'iframe (et même du parent) est throttlé
  en contexte automation ; au-delà de l'artefact, se reposer sur le **ticker GSAP interne
  de l'iframe** est fragile (iframes imbriquées throttlées par certains navigateurs même
  visibles). ExplainerPreview pilote désormais la lecture depuis **l'horloge du parent**
  (performance.now + rAF parent → `tl.time(t)`), l'iframe ne servant que de moteur de rendu
  seekable. Bonus vérifié : durée timeline 45,2s < compositionDuration 54s → la scène finale
  statique tient sur la fin (clamp), ce qui correspond au MP4 réel.
- Limite : fluidité temps-réel de la lecture non confirmable ici (rAF global throttlé par
  l'automation) ; OK pour un vrai utilisateur fenêtre au premier plan.
- Vérif : tsc → exit 0 ; npm run build → OK sans warning, /research/[id] 15,9 kB.
- Fichiers : components/explainer/explainer-preview.tsx, agent/log.md, agent/tasks.md.
- Reste : e2e « Render these edits » dès que le déploiement Tier A (71971e2) est live.

---

## 2026-06-22 — Claude — T-1120d-render-edits : route accepte le storyboard édité (Tier A)
- Fait : la route POST /api/research/jobs/[id]/explainer accepte un body optionnel
  `{ storyboard: { scenes } }` (le working copy du Studio). Si présent : scènes validées par
  `sanitizeEditedScenes` (nouveau, dans storyboard.ts — enum templates/camera_motion, clamp
  durée [2,30], cap longueurs texte/bullets, max 30 scènes, **template choisi par l'user
  préservé**), marque **re-dérivée serveur** via deriveBrand (jamais depuis le client), puis
  passée à triggerRenderExplainer. Sinon : comportement inchangé (build depuis
  research_storyboards). research_storyboards jamais modifié ; metadata.edited taggé.
  Studio : bouton « Render these edits (~$0.03) » (prop onRender + canRender) ; page :
  generateExplainer accepte un storyboard édité optionnel et l'envoie en body ; fix du
  onClick du bouton render existant (passait l'event React comme arg).
- Décision : Tier A (autorisé par Paul). Aucune migration, aucun changement Modal (Modal
  acceptait déjà un storyboard arbitraire). Tier B (persistance/autosave du working copy) =
  non fait (nécessiterait table + migration).
- Sécurité : body jamais fait confiance — sanitation + caps + brand serveur ; auth/ownership
  inchangés.
- Vérif : tsc → exit 0 ; vitest lib/explainer → 27 OK (+6 sanitize) ; npm run build → OK sans
  warning, /research/[id] 15,8 kB. e2e réel (cliquer Render these edits → MP4 édité en Library)
  → T-1120f.
- Fichiers : app/api/research/jobs/[id]/explainer/route.ts, lib/explainer/storyboard.ts
  (+ sanitizeEditedScenes), lib/explainer/__tests__/storyboard.test.ts,
  components/explainer/explainer-studio.tsx, app/(workspace)/research/[id]/page.tsx,
  agent/tasks.md, agent/log.md.
- Prochaine étape : T-1120f QA visuelle + e2e ; éventuellement Tier B persistance.

---

## 2026-06-21 — Claude — T-1120d étape 3 : Explainer Studio éditable (UI-only)
- Fait : `components/explainer/explainer-studio.tsx` — Studio éditable ouvert en overlay
  depuis le panneau Render de la page plan. Édite un working copy LOCAL (cloné du storyboard
  explainer dérivé du plan), jamais écrit dans research_storyboards (§13.2). Fonctions :
  liste scènes (sélection, monter/descendre, dupliquer, supprimer) ; inspecteur Simple
  (template parmi 6, texte écran, voix-off, durée, bullets si template=bullets) + Advanced
  replié (camera_motion, source_citation) §13.6 ; preview live débouncé 350 ms (évite le
  reload iframe à chaque frappe) ; Reset to plan ; bannière + note « rendu final = plan
  sauvegardé ».
- Scope (validé par Paul) : UI-only. Le rendu final NE tient PAS compte des édits (la route
  /explainer reconstruit depuis research_storyboards) ; rendre les édits + persistance =
  ticket backend suivant (point ouvert §13 : working_storyboard table/route/migration).
- Vérif : tsc → exit 0 ; npm run build → OK sans warning, /research/[id] 15,6 kB ; vitest
  lib/explainer → 21 OK. QA visuelle live non réalisable (cwd = worktree silly-lovelace,
  édition d'alphogenai-mini en chemins absolus → infra preview non liée) → T-1120f.
- Fichiers : components/explainer/explainer-studio.tsx (nouveau),
  app/(workspace)/research/[id]/page.tsx (import + state studioOpen + bouton + overlay),
  agent/tasks.md, agent/log.md.
- Garde-fous : UI-only, aucune route/API/DB, aucun pipeline, research_storyboards intact,
  aucun rendu déclenché par le Studio.
- Prochaine étape : T-1120f Visual QA (desktop/mobile, confirmer preview + studio) ; puis,
  si voulu, ticket backend persistance/working-storyboard pour rendre les édits.

---

## 2026-06-21 — Claude — T-1120d étape 2 : composant preview WYSIWYG
- Fait : `components/explainer/explainer-preview.tsx` (client) — rend le HTML de
  composition.ts dans un `<iframe srcdoc>` mis à l'échelle (1920×1080 → largeur dispo via
  ResizeObserver) et pilote la timeline GSAP in-frame (play/pause/scrub, lecture de
  `__timelines.main`, auto-stop en fin). Câblé dans app/(workspace)/research/[id]/page.tsx :
  preview affiché dans le panneau Render dès qu'un storyboard existe (storyboard explainer
  mémoïsé via buildExplainerStoryboard). Preview gratuit/local, aucun Modal, aucun coût.
- Détail correctness : `sandbox="allow-scripts allow-same-origin"` requis pour l'accès
  cross-frame à la timeline (sinon origine opaque) ; sûr car tout le texte dynamique est
  échappé par composition.ts. Wrap de `scenes` en useMemo (fix warning exhaustive-deps).
- Vérif : tsc → exit 0 ; npm run build → Compiled successfully, sans warning, /research/[id]
  13,6 kB. QA visuelle live tentée (page smoke jetable + dev server) mais l'infra preview ne
  se lie pas à ce worktree → supprimée ; QA visuelle authentifiée reportée à T-1120f. Parité
  HTML composition.ts↔build.js déjà prouvée (étape 1).
- Fichiers : components/explainer/explainer-preview.tsx (nouveau),
  app/(workspace)/research/[id]/page.tsx, agent/tasks.md, agent/log.md.
- Garde-fous : UI-only, aucune route/API/DB, aucun changement pipeline, aucun rendu
  déclenché par le preview.
- Prochaine étape : layout Studio (storyboard éditable + inspecteur cinématique) ou T-1120f.

---

## 2026-06-21 — Claude — T-1120d étape 1 : extraction lib/explainer/composition.ts
- Fait : extrait la logique de composition de l'explainer dans un module TS pur et testable
  (`lib/explainer/composition.ts`) — port fidèle de `infra/explainer-renderer/build.js` :
  6 templates (hero/screenshot_zoom/bullets/comparison/stat/cta), cameraTween, timeline GSAP,
  `buildCompositionHtml(storyboard, assets) → string` (= le HTML index.html, utilisable en
  `<iframe srcdoc>` pour le preview Studio) + `compositionDurationSec`. Source unique des
  templates pour le futur preview → WYSIWYG par construction. Ajout de champs optionnels
  `comparison`/`stat` à `ExplainerScene` (additif, sûr).
- Vérif : tsc → exit 0 ; vitest lib/explainer → 21 tests OK (9 nouveaux composition + 12
  storyboard) ; **parité byte-identique prouvée** entre composition.ts et build.js sur les
  6 templates via un test one-off (non commité, supprimé après).
- Fichiers : lib/explainer/composition.ts (nouveau), lib/explainer/__tests__/composition.test.ts
  (nouveau), lib/explainer/storyboard.ts (champs optionnels), agent/tasks.md, agent/log.md.
- Garde-fous : aucune route/API/DB, **aucun changement pipeline** (build.js/Modal/VPS non
  touchés — unifier build.js sur ce module = ticket Modal séparé, délibéré).
- Prochaine étape : composant preview `<iframe srcdoc>` + GSAP play/scrub, puis layout Studio.

---

## 2026-06-21 — Claude — T-1120-preview-spike (docs-only)
- Fait : spike de décision sur la prévisualisation de l'explainer. Examen de build.js
  (composition = HTML/CSS + timeline GSAP pure), storyboard.ts (modèle déterministe) et
  render_explainer Modal (CPU-only, async, ~minutes, ~2-5¢). Finding central : le même
  HTML de composition tourne tel quel dans un navigateur → preview low-fi **WYSIWYG**
  ($0, instantané, sans Modal), fidélité visuelle ≈ rendu final (deltas = voix Kokoro +
  screenshot live). Reco : preview client-side dans le Studio ; high-fi = render existant
  au clic uniquement. Garde-fou « aucun rendu coûteux auto » confirmé (aucun rendu
  déclenché par le spike).
- Fichiers : docs/product/t1120-preview-spike.md (nouveau), agent/tasks.md, agent/log.md.
- Tests : docs-only — pas de code compilé modifié (pas de tsc/build requis).
- Prochaine étape : T-1120d Explainer Studio — débloqué. 1ʳᵉ étape = extraire
  lib/explainer/composition.ts (partagé build.js + Studio) + composant preview iframe.

---

## 2026-06-21 — Claude — T-1120e Render & post-production panel (UI-only)
- Fait : mini-audit (STOP-and-explain) → le panneau post-prod *fonctionnel* complet n'est
  pas UI-only (overlays/voix/exports = routes qui déclenchent Modal, ou duplication de la
  page Job qui les expose déjà). Scope « UI-only honnête » validé par Paul. Carte « Explainer
  video » transformée en panneau **Render & post-production** : cadrage Raw vs Final, bouton
  render existant réutilisé, états in_progress/done/failed ; au statut *done*, deep-links vers
  la page Job (post-prod réelle) + Library + description honnête de ce qui s'y finalise.
- Fichiers modifiés : app/(workspace)/research/[id]/page.tsx (présentation pure : aucun
  nouvel import/état/effet/requête), agent/tasks.md, agent/log.md.
- Garde-fous : aucune route/API/DB/migration, aucun changement pipeline, aucun rendu
  déclenché depuis le panneau, aucun faux contrôle ; §13 respecté.
- Tests : tsc --noEmit → exit 0 ; npm run build → Compiled successfully, /research/[id] 9.22 kB.
- Prochaine étape : QA visuelle authentifiée desktop/mobile (T-1120f). Reste : T-1120-preview-spike
  (bloquant) → T-1120d Explainer Studio → T-1120f. Câblage post-prod fonctionnel = ticket séparé.

---

## 2026-06-21 — Codex (supervisé Claude) — T-1120c-polish
- Fait : passe polish UI sur la Plan Review — Sources 5 + Show all, Suggested references 9 +
  Review all, Plan Summary compact (4 tuiles), carte Next action enrichie (`detail`), scroll
  réduit. Patch écrit par Codex ; Claude a finalisé (commit + validation que Codex ne pouvait
  pas faire dans son env), normalisé EOL (LF), revu le diff, puis mergé en fast-forward.
- Fichiers modifiés : app/(workspace)/research/[id]/page.tsx (+99/-11).
- Tests : tsc --noEmit → exit 0 ; npm run build → OK.
- Commit 2d7b797 (co-authored Codex), mergé sur main 034fc2a..2d7b797, poussé.

---

## 2026-06-21 — Claude — T-1120c Plan Review premium layout
- Fait : refonte UI de la page Review d'un plan Research — barre de progression
  fait/actif/à-faire, colonne droite sticky + carte "Next action" guidée
  (réutilise les handlers existants), statuts sources Pending/Extracted/Blocked,
  bandeau consentement sur Suggested references (suggestions-only, aucun download
  auto), angle sélectionné mis en avant + line-clamp, script scrollable, durée
  ajoutée au header.
- Fichiers modifiés : `app/(workspace)/research/[id]/page.tsx`, `agent/tasks.md`, `agent/log.md`.
- Contraintes : aucune route/API/DB, aucun changement pipeline
  (SearXNG/Extractor/LiteLLM/Modal) ; handlers + appels existants inchangés ;
  garde-fous §13 préservés (refs suggestions-only, pas de rendu coûteux auto,
  research_storyboards non écrasé).
- Tests : `npx tsc --noEmit` clean ; `npm run build` OK (/research/[id] 8.4 kB).
- Reste : QA visuelle authentifiée desktop/mobile (route auth-gated) → T-1120f.

---

## 2026-06-18 — Claude — T-1120b Research Home premium command center
- Fait : refonte UI de la Research Home — hero compact, chips workflow
  (News/Tutorial/Product/Competitor) + note Explainer, starter templates qui
  préremplissent le brief (client-only), Recent research avec compteur,
  microcopy/tooltips, états loading/empty/error. Mode désormais piloté par les
  chips (select retiré du composer).
- Fichiers modifiés : `app/(workspace)/research/page.tsx`, `agent/tasks.md`, `agent/log.md`.
- Contraintes respectées : aucune route/API/DB, aucun changement pipeline
  (SearXNG/LiteLLM/Extractor/Modal), handlers + appels API existants inchangés.
- Tests : `npx tsc --noEmit` clean ; `npm run build` OK (route /research 7.47 kB).
- Reste : QA visuelle authentifiée desktop/mobile (route auth-gated) → T-1120f.

---

## 2026-06-18 — Claude — T-1120a addendum: implementation guardrails (docs-only)
- Fait : addendum §13 à `docs/product/research-explainer-premium-ui-spec.md` —
  preview low-fi (V1) vs high-fi (V2) sans rendu coûteux auto ; working storyboard
  éditable séparé de `research_storyboards` ; Brand Kit minimal V1 ; voix-off vs
  lip-sync séparés (coût/routing) ; captions V1 déterministes / STT V2 ; Studio
  Simple/Advanced ; desktop-first ; nouveau **T-1120-preview-spike** préalable à T-1120d ;
  priorité révisée b→c→e→spike→d→f.
- Fichiers modifiés : `docs/product/research-explainer-premium-ui-spec.md`, `agent/tasks.md`, `agent/log.md`.
- Tests : docs-only, aucun runtime touché.
- Prochaine étape : review Paul ; puis T-1120b (Research Home).

---

## 2026-06-18 — Claude — T-1120a Premium UI spec (docs-only)
- Fait : créé `docs/product/research-explainer-premium-ui-spec.md` — spec visuelle premium
  pour Research/Explainer/Render Studio (4 écrans + wireframes ASCII + navigation
  Home→Review→Studio→Render→Job/Social Pack + existant/manquant + non-goals + découpage T-1120b…f).
- Fichiers modifiés : `docs/product/research-explainer-premium-ui-spec.md` (nouveau),
  `agent/tasks.md`, `agent/log.md`.
- Tests : docs-only, aucun runtime touché (pas de build requis).
- Prochaine étape : review Paul avant toute implémentation UI ; puis T-1120b (Research Home).

---

## 2026-06-12 � Codex � T-1110d Research source media handoff
- Fait : affichage `Suggested references` sur `/research/[id]`, s�lection explicite des m�dias collect�s, copie serveur vers le bucket priv� `references`, puis passage des r�f�rences s�lectionn�es au Create flow via le handoff Research.
- Fichiers modifi�s : `app/(workspace)/research/[id]/page.tsx`, `app/(workspace)/create/[mode]/page.tsx`, `app/api/research/jobs/[id]/media/[mediaId]/select/route.ts`, `agent/tasks.md`.
- Tests : `npm test -- --run` 585/585, `npx tsc --noEmit -p tsconfig.json` clean, `npm run build` OK.
- Prochaine �tape : e2e authentifi� apr�s d�ploiement Vercel ; polish V1+ si besoin (r�le de r�f�rence �ditable, thumbnails fallback plus riche).

---
## 2026-06-11 — Claude (Fable 5) — Docs + research schema fix
- T-1104 spec added : `docs/product/research-extraction-adapter-spec.md`
- T-1105 spec added : `docs/product/research-angles-analysis-spec.md`
- T-1106 spec created : `docs/product/research-script-storyboard-spec.md`
- fix research schema alignment pushed in 7d236ec (discover/analyze inserts:
  research_job_id only, no user_id; research_jobs update: no sources_count)
- Prochaine étape : T-1106 implementation

---

## 2026-06-11 — Claude (Haiku 4.5) — T-1105: Angles Analysis IMPLEMENTED ✅

- Livré : LLM-driven editorial angles generation from extracted sources.
- Route implémentée :
  - `POST /api/research/jobs/[id]/analyze` : Query LLM, insert angles, update job status
- Features :
  - LLM (Claude via Anthropic API, server-side only, provider hidden from user)
  - Prompt construction : topic + mode + top 5 source excerpts (500 chars each)
  - Timeout 30s, max 2000 tokens response
  - Generate 3-5 angles per job (title, hook, positioning, score 0..1)
  - Score validation and clamping [0.0, 1.0]
  - Strict source validation : ≥1 source with extraction_status=success
- Status machine (per spec correction):
  - During LLM: job.status = scripting
  - Success: insert 3-5 angles (selected=false), job.status = ready_for_angles
  - Failure: job.status = failed, error_step = analysis
- Auth pattern :
  - Bearer token → Supabase auth.getUser()
  - Service-role for DB writes
  - Strict ownership enforcement
  - Status gate: ready_for_angles or failed (error_step ≠ analysis) only
- Helpers (lib/research/angles.ts) :
  - buildAnglePrompt(topic, mode, sources) : Construct prompt
  - callLLMForAngles(prompt, timeoutMs) : LLM API call
  - parseAnglesFromLLM(response) : Parse JSON + validate
  - validateAngle(angle) : Per-angle validation
  - clampScore(score) : Clamp to [0.0, 1.0]
  - generateAngles(topic, mode, sources) : Orchestrator
- Tests :
  - Unit tests for angle helpers (prompt, parsing, validation, score clamping)
  - 499/499 tests passing
- Files :
  - lib/research/angles.ts (pure helpers)
  - app/api/research/jobs/[id]/analyze/route.ts (POST handler)
  - app/api/research/jobs/[id]/analyze/__tests__/analyze.test.ts (unit tests)
- Validation : npm test 499/499 ✅, tsc ✅, npm build ✅, lint ✅
- Commit : 5f3a34b
- Prochaine étape : T-1106 (Script + storyboard generation)

## 2026-06-11 — Claude (Haiku 4.5) — T-1104: Extraction Adapter FINALIZED ✅ (+ Codex production review)
- Livré : Crawl4AI integration pour extraire Markdown des sources.
- Route implémentée :
  - `POST /api/research/jobs/[id]/extract` : Query Crawl4AI, update sources, update job status
- Features :
  - Crawl4AI gateway via env var (RESEARCH_CRAWL4AI_GATEWAY_URL + RESEARCH_CRAWL4AI_SERVICE_TOKEN)
  - Timeout 15s per source (AbortController)
  - Sequential extraction (V1, no parallel)
  - Markdown truncation : 50 KB max per source
  - Per-source extraction_status tracking
  - Status transitions : ready_for_angles/failed → extracting → ready_for_angles OR failed
  - Failure handling : timeout, blocked, parsing_error, error (all per-source, non-blocking)
  - Partial success accepted (job ready_for_angles if ≥1 success)
  - Zero success → job failed (error_step=extraction)
- Extraction statuses : pending, extracting, success, timeout, blocked, parsing_error, error
- Auth pattern :
  - Bearer token → Supabase auth.getUser()
  - Service-role for DB writes
  - Strict ownership enforcement
  - Status gate : ready_for_angles or failed only
- Helpers (lib/research/extraction.ts) :
  - callCrawl4AI(url, timeoutMs) : Raw API call with timeout
  - mapErrorToStatus(errorMessage) : Map errors to status enum
  - normalizeExtraction(result) : Transform to research_sources shape
  - truncateMarkdown(markdown) : 50 KB size cap
  - extractSource(url, timeoutMs) : Orchestrator
- Tests :
  - Unit tests for extraction helpers (truncateMarkdown, mapErrorToStatus, normalizeExtraction)
  - 477/477 tests passing
- Files :
  - lib/research/extraction.ts (pure helpers)
  - app/api/research/jobs/[id]/extract/route.ts (POST handler)
  - app/api/research/jobs/[id]/extract/__tests__/extract.test.ts (unit tests)
- Validation : npm test 477/477 ✅, tsc ✅, npm build ✅, lint ✅
- Commits : b2b308a (initial), 7d6e3cc (production fixes)

**Production Review (Codex) - Blockers Fixed :**
1. Column name : Changed .eq('job_id') → .eq('research_job_id') (matches T-1101 schema)
2. extraction_status enum : Conformed to T-1101 CHECK constraint
   - Removed extracting, parsing_error, error
   - Kept only : pending, success, failed, blocked, timeout
   - Mapped parsing_error/error → failed (no migration needed, Option A)
   - Job status can still be 'extracting', only source statuses constrained

- Final validation : npm test 477/477 ✅, tsc ✅, npm build ✅
- Status : DONE (production-ready)
- Prochaine étape : T-1105 (Angles analysis — LLM summaries)

## 2026-06-11 — Claude (Haiku 4.5) — T-1103: Source Discovery Adapter IMPLEMENTED ✅
- Livré : SearXNG integration pour découvrir sources candidates.
- Route implémentée :
  - `POST /api/research/jobs/[id]/discover` : Query SearXNG, insert sources, update job status
- Features :
  - SearXNG gateway via env var (RESEARCH_SEARXNG_GATEWAY_URL + RESEARCH_SEARXNG_SERVICE_TOKEN)
  - Timeout 30s (AbortController)
  - Source type classification : github, youtube, forum, media, docs, official, unknown
  - URL deduplication per job (unique index constraint)
  - Status transitions : draft/failed → discovering → ready_for_angles OR failed
  - Failure handling : timeout, zero results, network errors, partial results accepted
- Auth pattern :
  - Bearer token → Supabase auth.getUser()
  - Service-role for DB writes
  - Strict ownership enforcement
  - Status gate : draft or failed only
- Helpers (lib/research/discovery.ts) :
  - querySearxng(topic, inputUrl, timeoutMs) : Raw API call with timeout
  - classifySourceType(url, category?) : Heuristic classification
  - normalizeSearxngResult(result) : Transform to research_source shape
  - deduplicateByUrl(sources) : Remove duplicates per job
  - discoverSources(topic, inputUrl) : Orchestrator
- Tests :
  - Unit tests for discovery helpers (classifySourceType, normalizeSearxngResult, deduplicateByUrl)
  - 464/464 tests passing
- Files :
  - lib/research/discovery.ts (pure helpers)
  - app/api/research/jobs/[id]/discover/route.ts (POST handler)
  - app/api/research/jobs/[id]/discover/__tests__/discover.test.ts (unit tests)
  - docs/product/research-discovery-adapter-spec.md (spec doc)
- Validation : npm test 464/464 ✅, tsc ✅, npm build ✅, lint ✅
- Commit : e81ff9f
- Prochaine étape : T-1104 (Extraction adapter — Crawl4AI integration)

## 2026-06-10 — Claude (Haiku 4.5) — T-1102: Research API Skeleton IMPLEMENTED ✅
- Livré : 4 routes API authentifiées pour AlphoResearch job management.
- Routes implémentées :
  - `POST /api/research/jobs` : Créer job (draft status)
  - `GET /api/research/jobs` : Lister jobs avec pagination et status filter
  - `GET /api/research/jobs/[id]` : Récupérer job (ownership verified)
  - `PATCH /api/research/jobs/[id]` : Éditer job (draft-only check)
- Auth pattern :
  - Bearer token → Supabase auth.getUser()
  - user_id from auth.uid(), never from request body
  - Service-role client for server-side queries
  - Ownership filtering on all DB queries
- Validation :
  - topic: 3-500 characters
  - mode: enum (news, tutorial, product, competitor)
  - input_url: optional, must be http/https
  - language: format [a-z]{2}(-[A-Z]{2})?, default en-US
  - target_duration_seconds: optional, 3-600
  - PATCH: draft status required
- Error handling :
  - 401: No session / invalid Bearer token
  - 404: Job missing or non-owned
  - 400: Validation errors (topic, mode, URL, language, duration)
  - 500: Database errors
- Tests :
  - route-level with Supabase mocked
  - Auth required, ownership check, validation, draft-only constraint
  - 454/454 tests passing
- Files :
  - app/api/research/jobs/route.ts (GET list, POST create)
  - app/api/research/jobs/[id]/route.ts (GET single, PATCH edit)
  - app/api/research/jobs/__tests__/jobs.test.ts
  - docs/product/research-api-skeleton-spec.md
- Validation : npm test ✅, tsc ✅, npm build ✅, lint ✅
- Commit : eab661e
- Prochaine étape : T-1103 (Source discovery adapter — SearXNG integration)

## 2026-06-10 — Claude (Haiku 4.5) — T-1101: AlphoResearch Schema Migration VALIDATED ✅
- Livré : Validation PROD complète + marquage T-1101 done.
- Validation PROD ✅ confirmée :
  - 5 tables research_* (jobs, sources, angles, scripts, storyboards) existent et visibles
  - RLS enabled = true sur toutes les 5 tables
  - 4 policies par table : SELECT, INSERT, UPDATE, DELETE (20 policies total)
  - Index partial unique research_angles_job_id_selected_partial existe avec WHERE selected = TRUE
  - Indexes, CHECK constraints, triggers tous présents et actifs
  - Supabase Advisor : pas d'erreurs critiques
- Script validation SQL créé : `docs/VALIDATE_T1101_MIGRATION.sql` (8 blocs de vérification)
- Fichiers modifiés : agent/tasks.md (T-1101 done), agent/log.md
- Commit : T-1101 validation + tasks/log updates
- Prochaine étape : T-1102 (Research API skeleton)

## 2026-06-10 — Claude (Haiku 4.5) — T-1101: AlphoResearch Schema Migration (SQL + Guide)
- Livré : Migration Supabase traçable + guide d'application manuelle.
- Migration SQL : `supabase/migrations/20260610_create_alphoresearch_schema.sql` (timestamped Supabase ordering).
  - 5 tables : research_jobs (root), research_sources, research_angles, research_scripts, research_storyboards.
  - Colonnes, types, CHECK constraints, size limits exactement du spec T-1101a.
  - Indexes : (user_id, created_at DESC), (job_id, selected), partial unique for single-selected angle, URL per-job dedup.
  - RLS : SELECT/INSERT/UPDATE WITH CHECK/DELETE policies user ownership (no redundant service-role).
  - JSON validation : `jsonb_typeof(sections_json) = 'array'`, `jsonb_typeof(scenes_json) = 'array'`.
  - Foreign keys cascading (jobs → sources/angles/scripts → storyboards).
- Guide d'application : `docs/MIGRATION_T1101_README.md` (3 options).
  - Option 1 : Supabase Console SQL Editor (copier/coller + Run).
  - Option 2 : Supabase CLI (supabase migrations up).
  - Option 3 : psql direct (nécessite credentials Postgres).
- Validation POST-migration :
  - Tables listed en Table Editor.
  - RLS enabled check (`pg_tables.rowsecurity = true`).
  - Policies listed (`pg_policies`).
  - Indexes listed (`pg_indexes`).
  - Constraints listed (`pg_constraint` type 'c').
  - Advisor review (opcional).
  - Rollback instructions (DROP CASCADE si needed).
- Blocage : MCP Supabase no access to remote project (account permissions issue).
  Migration est prête pour application manuelle ; applicator peut être utilisateur ou CLI.
- Fichiers : `supabase/migrations/20260610_create_alphoresearch_schema.sql`, `docs/MIGRATION_T1101_README.md`, `agent/tasks.md`, `agent/log.md`.
- Dépendances : T-1101a spec ✅, T-1100b Hostinger contract ✅.
- Prochaine étape : Apply migration via Supabase console → T-1102 (API skeleton).

## 2026-06-10 — Claude (Haiku 4.5) — T-1101a: AlphoResearch Schema Spec Review (docs-only)
- Livré : Documentation complète du schéma Supabase pour AlphoResearch avant migration.
- Scope : 5 tables, RLS policies, indexes, contraintes, tailles max — pas de migration SQL.
- Tables :
  - **research_jobs** : root entity, statuts de workflow (draft → sent_to_director),
    error tracking, user_id ownership.
  - **research_sources** : candidates découverts (SearXNG) + extraits (Crawl4AI),
    extracted_markdown max 50 KB, extraction_status (pending/success/failed/blocked/timeout).
  - **research_angles** : 3-5 angles proposés par LLM, scoring (0-1), 
    UNIQUE constraint pour un seul selected par job.
  - **research_scripts** : script généré + sections_json, quality_score + sous-scores
    (hook_strength, clarity, originality, etc.), script max 10 KB.
  - **research_storyboards** : scenes_json compatible Director, max 100 KB,
    correspond directement à Director scene payload.
- RLS Pattern :
  - Users see only their own jobs (auth.uid() = user_id).
  - RLS cascades via foreign keys (sources/angles/scripts inherit from job ownership).
  - Service-role bypass pour routes trusted (existing app pattern).
- Indexes :
  - (user_id, created_at DESC) pour listing jobs.
  - (job_id, selected) pour découvrir sources à extraire.
  - (job_id, score DESC) pour trier angles par qualité.
  - URL uniqueness per job pour prévenir duplicatas.
- Contraintes Size :
  - extracted_markdown: 50 KB (prévient articles énormes).
  - script: 10 KB (full script ~2000 mots).
  - sections_json: 5 KB (3-5 sections typical).
  - scenes_json: 100 KB (full storyboard).
- Intégration existante :
  - scenes_json format compatible Director (no secondary transform).
  - User ownership via auth.users (existing pattern).
  - Service-role bypasses RLS en app routes (existing pattern).
- Out of scope V1 : ❌ n8n hooks, ❌ seeded demo data, ❌ sharing users,
  ❌ soft-delete, ❌ changedetection webhooks (Phase 4).
- Fichier : `docs/product/alphoresearch-schema-review.md` (3700+ lignes).
- Validation : Checklist complète (13 points) avant migration T-1101.
- Prochaine étape : Review + validation ensemble, puis migration (T-1101).

## 2026-06-10 — Claude (Haiku 4.5) — T-1100b: Hostinger Service Contract (docs-only)
- Livré : Documentation complète du contrat de service pour VPS Hostinger.
- Scope : SearXNG (recherche), Crawl4AI (extraction), changedetection (future), 
  Speaches/Kokoro (TTS future), Redis (optionnel).
- Détails par service :
  - Déploiement (URLs, ports, docker-compose)
  - Variables d'environnement
  - Contracts API (format JSON, échecs)
  - Health checks (fréquence, timeouts, fallback)
  - Quotas + limites de débit (recherches, extractions, concurrence)
  - Timeouts & retries (exponential backoff)
  - Failure behavior (graceful degradation, alerts)
  - Logging & monitoring (Uptime Kuma, métriques)
- Network & Security :
  - Firewall rules (Vercel → services VPS)
  - Internal DNS resolution
  - SSL/TLS (self-signed OK pour interne)
- Operations :
  - Baseline infrastructure (CPU 2+, RAM 4+, storage 40+)
  - Docker-compose orchestration
  - Restart policies
  - Recovery procedures
- Out of scope explicite :
  - ❌ Production Supabase sur Hostinger
  - ❌ Production Next.js backend sur Hostinger
  - ❌ n8n orchestration
  - ❌ Auto-publishing
- Fichier : `docs/product/hostinger-service-contract.md` (2900+ lignes)
- Validation : Prête pour review avant T-1101 (schema DB)
- Commit : À faire (docs-only)

## 2026-06-10 — Claude (Haiku 4.5) — T-804 FINAL: Library Looks management — v1 production-ready
- Livré : Version 1.0 complète et production-ready du management de Looks sauvegardés.

**Architecture finale** :
- **UI Grid** : 4 cols desktop (xl:grid-cols-4), 2 cols mobile (sm:grid-cols-2)
- **Modals** : Radix UI Dialog + shadcn/ui (a11y, focus management, backdrop click)
- **API** : PATCH /api/looks/[id] (rename) + DELETE /api/looks/[id] (delete)
- **Database** : cinematic_looks table existant (aucune migration)
- **Auth** : RLS + user_id ownership checks
- **Error handling** : Alerts utilisateur + logging console

**Workflow complet (testé)** :
1. **Browse** : Library page affiche tous les Looks de l'utilisateur
   - Grid responsive (4 col desktop, 2 col mobile)
   - Video preview inline
   - Duration badge
   - Création date
   - Empty state avec CTA

2. **Reuse** : Bouton "Create with look" → `/create/avatar?look_id=<id>`
   - Pré-sélectionne le Look au studio
   - Permet d'ajouter new script/voice
   - Lip-sync (via T-803)

3. **Rename** : Pencil icon → modal rename
   - Radix Dialog (backdrop click, Escape, focus trap)
   - Input validation (1-100 chars)
   - Char counter
   - Live update dans grid après save
   - Error alert si échec

4. **Delete** : Trash icon → modal confirmation
   - Radix Dialog
   - Warning: "permanently delete"
   - Red Delete button (destructive)
   - Confirmation required
   - Remove from grid après succès
   - Error alert si échec

**Commits T-804** :
- b3c5b67 : feat: T-804b UI + rename/delete modals
- b841237 : docs: Update T-804b/c status
- f83f16d : test: Unit tests + E2E structure (18 tests)
- 78eab14 : refactor: Upgrade modals to Radix UI Dialog

**Tests & Validation** :
- npm test : 426/426 passing (18 new unit tests)
- npm run build : ✅ Success
- TypeScript : ✅ Clean
- Accessibility : ✅ Radix Dialog WCAG compliant
- Design : ✅ Cohérent avec Library existante

**Non-goals V1 (approuvés) ** :
- ❌ Thumbnail generation (MVP: inline video preview)
- ❌ Soft delete avec restore
- ❌ Bulk operations
- ❌ Tags/folders
- ❌ Share public
- ❌ R2 orphan cleanup (manual task future)

**Prochaine étape** : T-1100 AlphoResearch Engine Spec (separate backlog)

## 2026-06-10 — Claude (Haiku 4.5) — T-804b : Library Looks grid UI + rename/delete modals
- Fait : Implémentation complète du workflow de gestion des Looks (renommer + supprimer).
  - **UI modals** : modal rename (input 1-100 chars, Save/Cancel) + modal delete confirmation 
    (avertissement, Delete rouge/Cancel).
  - **Actions hover** : pencil icon (rename) + trash icon (delete) apparaissent au survol 
    des grid items via group:hover.
  - **API endpoints** : PATCH /api/looks/[id] {name} pour renommer ; 
    DELETE /api/looks/[id] pour supprimer (path param alternative to existing ?id= variant).
  - **Validation** : ownership check (user_id), name length [1..100], updated_at audit.
  - **Error handling** : user-facing alerts (failed rename/delete), logging.
  - **UI state** : renameModalOpen, selectedLookId, newName, deleteConfirmOpen, 
    lookToDelete, isSaving, isDeleting.
- Fichiers : `app/(workspace)/library/page.tsx` (+171 lines), `app/api/looks/[id]/route.ts` 
  (nouveau, +85 lines).
- Icons ajoutées : Edit2 (pencil), Trash2, X (close modal).
- Tests : tsc clean, build OK (255 lines added).
- Commit : b3c5b67
- Prochaine étape : T-804c (E2E tests : save → rename → delete → reuse workflow).

## 2026-06-10 — Claude (Haiku 4.5) — T-804a Spec : Library Looks management
- Fait : Audit complet + spec docs-only pour T-804 (dedicated Looks management UI).
- Audit `/api/looks` : GET/POST/DELETE routes ready, cinematic_looks schema, 
  thumbnail_url always NULL (used in POST, not in v1 implementation).
- Scope T-804 : /library?tab=looks (cohérent avec Library existante), 
  hard delete (simple V1), no thumbnail V1 (inline video preview).
- UX decisions : Rename modal (PATCH endpoint), delete confirmation (irreversible),
  quick reuse button → /create/avatar?look_id=...
- Implementation phases : T-804a (grid + rename modal), T-804b (thumbnail strategy),
  T-804c (API endpoint + E2E tests).
- Risk mitigation : grid virtualization (>50 Looks), soft delete in V1+ if needed,
  R2 orphan cleanup task (manual or scheduled).
- Fichiers : `docs/product/library-looks-management-spec.md` (1100+ lignes),
  `agent/tasks.md` updated (T-804 split into a/b/c).
- Validation : tsc/lint clean, tests 408/408 passing (no code changes).
- Commit : 95db1cf
- Priorité : **TIER 1** (suite T-802 + T-803)

## 2026-06-09 — Claude (Opus 4.8) — T-1003 (API) : Admin Gallery Manager
- Fait : couche API admin pour la galerie curated (API d'abord, testable, avant l'UI).
  Toutes les routes sont admin-gated `requireAdmin()` (`isAdminEmail`) + service-role
  (bypass RLS). Le public `/gallery` n'utilise jamais ces routes (vérifié : il ne lit ni
  `jobs` ni service-role — posture privacy de Codex intacte).
  - `lib/gallery-admin.ts` (pur) : `normalizeGalleryWrite(body, mode)` — **whitelist** stricte
    des champs écrivables (id/created_by/created_at/updated_at jamais acceptés depuis le body) ;
    enums validés (status/category/media_type) ; `display_model` toujours scrubé
    (`cleanModelName`) ; `published_at` **dérivé du status**, jamais de l'input. Et
    `galleryDraftFromJob(job)` : draft sûr depuis un job fini — `status='draft'`,
    **`public_prompt=null` (le prompt privé brut n'est JAMAIS copié)**, `display_model` neutre.
  - `GET/POST /api/admin/gallery` (list + filtres status/category ; create avec
    `created_by`=admin).
  - `PATCH/DELETE /api/admin/gallery/[id]` (publish/unpublish/hide/edit ; DELETE supprime la
    ligne galerie **uniquement**, jamais le job source).
  - `POST /api/admin/gallery/from-job` ({job_id} → draft sûr).
- Confidentialité : aucun provider/aggregator exposé (scrub `display_model`) ; aucun prompt
  privé brut publié par défaut ; champs écrivables verrouillés par whitelist.
- Fichiers : `lib/gallery-admin.ts`, `app/api/admin/gallery/{route,[id]/route,from-job/route}.ts`,
  tests `lib/__tests__/gallery-admin.test.ts` + `app/api/admin/gallery/route.test.ts`
  (premier test de route admin du repo), `agent/{tasks,log}.md`.
- Tests : npm test → **394 passed** (363 + 31) · tsc 0 · lint 0 · build OK (3 routes
  `/api/admin/gallery*` enregistrées).
- Prochaine étape : UI `/admin/gallery` (list/edit/publish) + bouton `Add to gallery` depuis
  `/admin/jobs`. Ne touche pas la refonte publique de Codex (`components/gallery/`).

## 2026-06-09 — Claude (Opus 4.8) — T-1002 : schéma `gallery_items` + RLS (appliqué prod)
- Fait : créé la table de curation `public.gallery_items` (spec
  `docs/product/gallery-curation-redesign-spec.md`) — surface publique de la galerie,
  **privacy-first**. Migration appliquée en prod via MCP `apply_migration`
  (projet `qbrpzmuedfugbhoeytdj`) + tracée : `supabase/migrations/20260609_create_gallery_items.sql`.
- Modèle : défaut `status='draft'` (privé/non listé). RLS = **public (anon+auth) SELECT
  uniquement `status='published'`** ; aucune policy write anon/auth → écritures refusées
  (default-deny) ; policy service-role full access (admin CRUD + SSR drafts, gardé par
  `isAdminEmail()` au niveau app — les admins ne sont pas identifiés en DB, donc pas de
  référence `is_admin` dans la RLS). Colonnes alignées sur le contrat `GalleryItemRow`
  (`lib/gallery-showcase.ts`) → la page publique normalise sans jamais lire `jobs`.
  `source_job_id ON DELETE SET NULL`. Trigger `updated_at` avec `search_path` épinglé
  (pas de régression de l'advisor `function_search_path_mutable` fermé en R-018d).
- Sécurité : `get_advisors(security)` post-migration → **0 nouvelle alerte** (mon table +
  ma fonction n'apparaissent nulle part ; reste = bruit préexistant documenté R-018).
  Sanity SQL : table 0 ligne (aucun backfill), RLS on, 2 policies, trigger présent.
- Ne réintroduit **aucune** lecture directe `jobs` → galerie publique (la règle de Codex).
- Fichiers : `supabase/migrations/20260609_create_gallery_items.sql`, `agent/{tasks,review,log}.md`.
- Prochaine étape : T-1003 (Admin Gallery Manager : CRUD service-role gardé `isAdminEmail`,
  action `Publish to gallery`) puis T-1004 (refonte `/gallery` lisant published-only).

## 2026-06-09 — Claude (Opus 4.8) — T-901d : planners purs MCP (`create_director_plan`, `create_ugc_plan`)
- Fait : ajouté deux outils planner **purs / no-cost** au registre MCP (`lib/mcp/tools.ts`),
  scope `plan`, aucun insert, aucune dépense — toujours derrière `MCP_ENABLED` (off) + auth.
  - `create_director_plan({prompt, target_duration_seconds?, scenes?})` : réutilise
    `generateStoryboard` (pur) ; résout le plan réel de l'acteur via `resolveUserPlan` pour
    que le cap de scènes (MAX_SCENES) soit exact. Sortie `{ plan, scene_count,
    total_duration_seconds, scenes:[{scene_index,prompt,duration_sec}] }` — **pas de clé
    engine brute exposée**.
  - `create_ugc_plan({product, outfit?, angle, platform, creator, creator_label?,
    product_name?, key_benefit?, tone?})` : réutilise `buildUGCDirectorPlan` (pur) ; valide
    les enums (angle/platform/creator) → 400 sinon. Sortie provider-neutral (prompt global,
    beats de scènes hook/problem/demo/…, aspect ratio, social pack TikTok/Reels/Feed/YT).
- Refactor 1-source-de-vérité : extrait `resolveUserPlan(supabase, userId)` de la résolution
  de plan inline de `assertCanCreateJob` (`lib/jobs/guard.ts`) ; le gate l'appelle désormais.
  Comportement **identique** (les 7 tests route + 18 tests guard restent verts).
- Fichiers : `lib/mcp/tools.ts`, `lib/jobs/guard.ts` (resolveUserPlan), tests
  `lib/__tests__/mcp.test.ts` (+7) et `lib/__tests__/jobs-guard.test.ts` (+3 resolveUserPlan).
- Tests : npm test → **363 passed** (355 + 8) · tsc 0 · lint 0 · build OK (`/api/mcp` ok).
- Prochaine étape : T-901e (`create_video` derrière confirmation/preview-first) — **bloqué**
  tant que rate-limit + audit + activation `MCP_ENABLED`/`mcp_tokens` ne sont pas validés
  par Paul (R-019). Rien de payant livré.

## 2026-06-09 — Claude (Opus 4.8) — T-901c : squelette MCP read-only `/api/mcp`
- Fait : premier squelette de la surface MCP AlphoGen-side, read-only / no-cost, qui
  **réutilise** les helpers existants sans nouvelle logique de gate.
  - `app/api/mcp/route.ts` : dispatcher `POST {tool,input}` + `GET` (catalogue
    provider-neutral). Flag `MCP_ENABLED` → 404 par défaut (inerte). Auth fail-closed.
    Le service-role reste server-side, scoping par `actor.userId`, jamais renvoyé.
  - `lib/mcp/auth.ts` : PAT `agk_<id>_<secret>` (auth-design) — parse + vérif
    HMAC-SHA256+`MCP_TOKEN_PEPPER` en temps constant (`timingSafeEqual`). Résolution via
    token de test env (`MCP_TEST_TOKEN_*`), **aucun store DB** (le store `mcp_tokens` =
    migration future, go Paul). Fail-closed : pepper/token absent → 401.
  - `lib/mcp/serialize.ts` : `toPublicJob` provider-neutral (`getEngineDisplayName` +
    `cleanModelName`) ; jamais de clé engine brute / nom de provider ; scrub des
    `error_message`. `PUBLIC_JOB_COLUMNS` = projection sûre.
  - `lib/mcp/tools.ts` : `get_job`, `list_recent_jobs` (scope `read`, scoping `userId`,
    cap 20) ; `validate_job_payload` (scope `plan`, **preview** — appelle
    `assertCanCreateJob`, renvoie accepted/plan ou rejected/reason, **aucun insert**).
    **Aucun `create_video` payant.**
  - `lib/mcp/types.ts` ; docs : auth-design §12 (config env + garde-fous).
- Fichiers : `app/api/mcp/route.ts`, `lib/mcp/{auth,serialize,tools,types}.ts` (nouveaux),
  `lib/__tests__/mcp.test.ts` (24 tests) + `app/api/mcp/route.test.ts` (8 tests) (nouveaux),
  `docs/product/alphogen-mcp-auth-design.md` (§12), `agent/{tasks,review,log}.md`.
- Tests : npm test → **355 passed** (326 + 29) · `tsc --noEmit` → 0 · lint (fichiers
  touchés) → 0 · `next build` → OK (`/api/mcp` enregistrée comme route dynamique).
- Prochaine étape : T-901d (outils plan/validate purs `create_director_plan`/`create_ugc_plan`)
  puis activation derrière review — migration `mcp_tokens` + `MCP_ENABLED` sur compte de
  test = go Paul (R-019). Pas de `create_video` tant que rate-limit/audit absents.

## 2026-06-09 — Claude (Opus 4.8) — T-901b-impl : helper partagé `assertCanCreateJob`
- Fait : extrait la séquence de gate de `POST /api/jobs` (prompt → content-policy →
  references ownership → résolution plan depuis `profiles` → limite génération active →
  quota journalier → engine plan gate EvoLink/Bailian Pro+, HeyGen Premium + avatar/voix)
  dans un helper interne pur `lib/jobs/guard.ts` : `assertCanCreateJob(supabase, input)`
  → `{ ok:true, plan }` | `{ ok:false, status, body }`. `MAX_ACTIVE_JOBS` migré dans le
  helper. La route appelle le helper et réutilise `gate.plan`. **Aucune route MCP créée** —
  premier pas d'implémentation à faible risque (auth-design §5 : 1 source de vérité que le
  futur `/api/mcp/*` réutilisera au lieu de ré-implémenter).
- Comportement préservé à l'identique : `app/api/jobs/route.test.ts` (7 tests, le filet de
  régression) passe inchangé.
- Fichiers modifiés : `lib/jobs/guard.ts` (nouveau), `lib/__tests__/jobs-guard.test.ts`
  (nouveau, 18 tests : prompt/policy/script_text/references/active/quota/engine gates +
  anonyme + HeyGen avatar/look/voice), `app/api/jobs/route.ts` (appel du helper ; imports
  morts retirés : screenPrompt, validateReferences, PLAN_DAILY_QUOTA, const MAX_ACTIVE_JOBS).
- Tests : npm test → **326 passed** (308 + 18) · `tsc --noEmit` → 0 · lint (fichiers
  touchés) → 0 · `next build` → OK.
- Prochaine étape : T-901c (outils read-only `get_job`/`list_recent_jobs` sur compte de
  test) derrière review + go Paul ; le helper est prêt à être branché par le futur
  `/api/mcp/*`.

## 2026-06-09 — Claude (Opus 4.8) — T-901b : design auth /api/mcp (PAT, docs-only)
- Rédigé `docs/product/alphogen-mcp-auth-design.md` (design doc, docs-only). PAT par
  user `agk_<token_id>_<secret>` ; hash HMAC-SHA256 + `MCP_TOKEN_PEPPER` (one-way,
  pas `lib/encryption` qui sert à déchiffrer) ; table future `mcp_tokens` (RLS
  owner-scoped, migration additive plus tard = go Paul) ; flux résolution header→user
  (service-role UNIQUEMENT dans le resolver, jamais donné au serveur MCP) ; scopes
  least-privilege (read/plan/generate/export/assets ; défaut read+plan) ; réutilisation
  des gates via helper partagé `assertCanCreateJob(userId,payload)` (à extraire, 1 source
  de vérité) ; rate limit + audit (sans secret/provider) ; preview-first pour `generate`.
- **Docs-only** ; aucune route/API/DB/migration/secret. T-901b (design) done ;
  implémentation derrière review (+ migration `mcp_tokens` = process R-003).
- Fichiers : `docs/product/alphogen-mcp-auth-design.md`, `agent/tasks.md`, `agent/log.md`.

## 2026-06-09 — Claude (Opus 4.8) — T-901a : spec MCP AlphoGen (docs-only)
- `git pull` (à `451debb`). Rédigé `docs/product/alphogen-mcp-spec.md` (spec-only) après
  discussion d'avis avec Paul/Codex sur un MCP « studio API pour agents ».
- Contenu : objectif (MCP = client mince sur l'API interne, **jamais Supabase direct**),
  cas d'usage (dev QA Claude/Codex, agent réalisateur ChatGPT, preview payload, plan
  Director, suivi jobs), archi (serveur MCP externe + futur `/api/mcp/*` + PAT scoping,
  pas de service-role), outils V1 read-only/no-cost + V2 side-effect, règles sécu
  (confidentialité providers, réutiliser plan/quota/content-policy, audit, rate limit,
  actions coûteuses preview-first/confirmées), phasing T-901a→e, non-goals.
- Divergences vs proposition Codex notées dans la spec : auth = vrai chantier (PAT) ;
  `create_video` séquencé en DERNIER (coûte de l'argent) ; dev-tooling MCP avant le
  produit. Aucune route/API/DB/secret touché.
- Axe 9 ajouté à `agent/tasks.md` (T-901a done, T-901b→e todo).
- Fichiers : `docs/product/alphogen-mcp-spec.md`, `agent/tasks.md`, `agent/log.md`.

## 2026-06-09 — Claude (Opus 4.8) — SÉCU R-018d #3 : harden function search_path (go Paul)
- Relu les 14 corps de fonctions flaggées : refs non qualifiées = uniquement tables
  `public` (jobs/job_scenes watchdogs) ; reste qualifié + built-ins pg_catalog
  (`gen_random_uuid` = core, pas extensions). → `SET search_path = public, pg_temp`
  sûr/non cassant pour toutes.
- `apply_migration harden_function_search_path` (14 ALTER FUNCTION) +
  `supabase/migrations/20260609_harden_function_search_path.sql`. Vérifié : 14/14
  proconfig posé ; smoke-test is_admin()/current_user_id() OK ; advisor
  `function_search_path_mutable` vidé. Aucune donnée user ; aucun code applicatif.
- État advisor restant : `security_definer_executable` (#2, mitigé) +
  `leaked_password` (#4, Pro-only) + 2 INFO `rls_enabled_no_policy` (attendu).

## 2026-06-09 — Claude (Opus 4.8) — SÉCU R-018d : durcissement (cache #1 + audit #2/#3/#4)
- **#1 ✅** : drop des INSERT permissifs `music_cache_insert`/`video_cache_insert`
  (WITH CHECK true, authenticated). Audit : caches écrits uniquement par workers Python
  en service-role ; app TS n'y touche pas. `apply_migration
  cache_drop_permissive_insert_policies` + migration tracée. Advisor :
  `rls_policy_always_true` désormais **vide**.
- **#2 ⛔** : ne pas révoquer EXECUTE sur RPC admin — `is_admin()` est utilisé dans des
  policies RLS (projects/project_scenes/daily_themes/music_tracks/video_jobs_log) →
  casserait. Fonctions déjà gardées en interne (risque faible). Documenté.
- **#3 ⛔** : `search_path` non fixé à l'aveugle (risque casse via `gen_random_uuid()`
  etc. du schéma `extensions` non qualifié). Tranche dédiée recommandée. Documenté.
- **#4 ⛔ bloqué (plan Free)** : Paul a tenté le toggle « Prevent use of leaked
  passwords » → erreur Supabase « available on Pro Plans and up ». Feature HIBP =
  Pro+. Non activable sur Free ; WARN restera (non critique). Décision upgrade = Paul.
  Alternative gratuite : min password length 6→8 + password requirements.
- Détails dans `agent/review.md` R-018d. Aucun code applicatif ; aucune donnée user.

## 2026-06-09 — Claude (Opus 4.8) — SÉCU R-018c : drop SELECT permissif jobs (go Paul)
- **Fix appliqué (go Paul)** : `apply_migration jobs_drop_permissive_select_policy`
  → `drop policy "Users can view own jobs"` (SELECT `USING (true)`). Vérifié : policies
  `jobs` finales = `service_role_all_jobs` + `users_insert_own_jobs` (auth.uid()=user_id)
  + `users_select_own_jobs` (auth.uid()=user_id). Fuite lecture fermée.
- Tracé `supabase/migrations/20260609_jobs_drop_permissive_select_policy.sql`.
- Sûr (audit ci-dessous) ; aucune donnée user ; partage public/gallery/app intacts
  (service-role). R-018c → resolved.

## 2026-06-09 — Claude (Opus 4.8) — SÉCU R-018c : audit lecture jobs (AUDIT ONLY)
- `git pull` (à `87bd83d`). **Aucune migration / aucun changement de policy** (audit only).
- Audit read-only des 33 fichiers lisant `public.jobs` + chemins demandés :
  - `/v/[id]` (partage public) → `createServiceClient` (bypass RLS).
  - `/gallery` → `createServiceClient` (bypass).
  - `/jobs/[id]` via `app/api/jobs/[id]/route.ts` → `createServiceClient` (bypass) + ownership code.
  - `/library`, `/home`, `/projects`, `/create` → client navigateur (RLS) **et déjà
    `.eq("user_id", user.id)`**.
  - APIs social/thumbnail/duplicate/publish/export/metadata → service-role + auth check.
- **Conclusion** : aucun read d'un job d'autrui via client user/anon dépendant de
  `USING (true)`. Partage public/gallery en service-role → pas de policy partage requise.
  `users_select_own_jobs` (`auth.uid()=user_id`) existe déjà.
- **Fix proposé (NON appliqué, attente go)** :
  `drop policy if exists "Users can view own jobs" on public.jobs;`
- Consigné dans `agent/review.md` R-018c (tableau + réponses + SQL). Aucun code/migration.

## 2026-06-09 — Claude (Opus 4.8) — SÉCU R-018b : jobs INSERT policies cleanup
- `git pull` (déjà à `79e91c7`, Codex T-802c readiness par-dessus mon fix RLS).
- Audit (read-only) policies `public.jobs` : 3 INSERT permissives `WITH CHECK (true)`
  (`All users can create jobs`, `Allow authenticated to create jobs`, `Allow insert
  on jobs` [public→anon]) + 1 correcte `users_insert_own_jobs` (`auth.uid()=user_id`)
  + `service_role_all_jobs`. Audit code : tous les inserts `jobs` passent par
  `createServiceClient()` (route.ts:89,365…) ; aucun insert client/anon (grep repo).
- **Fix appliqué (go Paul, validé sûr)** : `apply_migration
  jobs_drop_permissive_insert_policies` → drop des 3 permissives. Vérifié :
  policies restantes OK ; advisor → les 3 `rls_policy_always_true` sur `jobs` ont
  disparu. Tracé `supabase/migrations/20260609_jobs_drop_permissive_insert_policies.sql`.
- **Aucun code applicatif modifié ; aucune donnée user ; création de jobs/quotas
  intacts** (service-role bypasse RLS).
- Découverte → **R-018c** (open) : SELECT `Users can view own jobs` `USING (true)`
  (authenticated) = fuite lecture (tout job lisible). NON modifié (audit lecture
  requis avant — consigne « stop & document »).
- Tests : `vitest 287/287` (DB-only, code inchangé).

## 2026-06-09 — Claude (Opus 4.8) — SÉCU R-018 : RLS app_settings (email Supabase)
- Retour, `git pull` (déjà à `8ee53df`), lecture tasks/log/review + contrat/audit UGC.
- Diagnostic Supabase (MCP `74b88f17…`, projet `qbrpzmuedfugbhoeytdj`, read-only) :
  advisor **ERROR `rls_disabled_in_public`** sur `public.app_settings` (= l'email).
  Audit code : tous les accès passent par service-role → activer RLS sans policy = sûr.
  Autres alertes (jobs INSERT permissif, RPC admin gardées, search_path, leaked-pwd) =
  non urgentes (R-018).
- **Fix appliqué (go explicite Paul)** : `apply_migration enable_rls_app_settings`
  (`ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;`). Vérifié :
  `rowsecurity=true` ; advisor ERROR → INFO `rls_enabled_no_policy` (sûr). Tracé dans
  `supabase/migrations/20260609_enable_rls_app_settings.sql`.
- Aucun code applicatif modifié ; aucune fonctionnalité cassée (service-role bypasse RLS).
- Reste R-018 (durcissement) : policies jobs INSERT, revoke anon RPC, search_path,
  leaked-password — tranche dédiée sur validation.
- Note état repo : T-301b/c finalisés par Codex pendant l'absence ; mon travail T-301b
  local non commité a été repris/incorporé (working tree propre à `8ee53df`).

## 2026-06-08 — Claude (Opus 4.8) — T-301a addendum : réutiliser SceneTimeline/ScenePanel
- Audit (read-only, correction de cadrage Codex) : la page job utilise DÉJÀ
  `components/editor/SceneTimeline.tsx` (board read-only complet : strip, thumbs,
  statuts, prompt, durée, seek, progress ; aucun modèle/provider) + `ScenePanel.tsx`
  (détail + prompt éditable + Save PATCH / Regenerate POST).
- Addendum docs-only à `scene-board-runtime-spec.md` (§9) : **ne pas créer de doublon** ;
  T-301b = réutiliser/évoluer ces composants ; board read-only ; garder Save (tous
  moteurs) ; **gater Regenerate** (R-010) ; `ScenePanel` libellé « Engine »→« Model » +
  `cleanModelName` (R-011) ; optionnel `lib/scene-status.ts` pur + test.
- Risques notés : R-010 (regen non gaté), R-011 (libellé/clé ScenePanel).
- **Docs-only** ; aucun code.
- Fichiers : `docs/product/scene-board-runtime-spec.md`, `agent/tasks.md`,
  `agent/log.md`, `agent/review.md`.

## 2026-06-08 — Claude (Opus 4.8) — T-301a : spec Scene Board runtime (docs-only)
- Inspecté (read-only) : `app/jobs/[id]/page.tsx` (scenes live déjà fetchées+mergées,
  failedScenes/doneScenes/hasRetryableScenes, retry-scenes, seek par scène),
  `retry-scenes/route.ts` (retry all failed, job failed), `scenes/[i]/route.ts`
  (PATCH prompt + POST regen single-scene EvoLink/Bailian only).
- Écrit `docs/product/scene-board-runtime-spec.md` : V1 = read-only + statuts live +
  retry failed + modèle provider-clean ; pas d'édition runtime (V2) ; composants
  (`scene-board.tsx`, `scene-card.tsx`, `lib/scene-status.ts`), endpoints existants,
  risques (R-010 : regen single-scene multi-provider non supporté), tests, découpage
  T-301a/b/c/d. R-009 gardé séparé.
- **Docs-only** ; aucun code/route/DB.
- Fichiers : `docs/product/scene-board-runtime-spec.md`, `agent/tasks.md`,
  `agent/log.md`, `agent/review.md`.
- Prochaine étape : sur validation spec → T-301b (SceneBoard read-only).

## 2026-06-08 — Claude (Opus 4.8) — T-202 fix P2 : risk sur les prompts de scènes
- Bug Codex (P2) : `computeDirectorQuality` n'analysait que `input.prompt`, alors que
  depuis T-201c les prompts envoyés sont `directorScenes[].prompt` → une scène éditée
  bloquée/warn pouvait rester « Good ».
- Fix : `DirectorQualityInput.scenes` porte maintenant `prompt?` ; le screening utilise
  `scenes.map(s=>s.prompt).filter(...).join("\n")` quand présent, sinon fallback
  `input.prompt`. (Cost/social/time inchangés.)
- Test (+1) : prompt original clean + scène bloquée → `risky` ; scène avec age-word →
  `medium` ; fallback original sans prompt de scène. Anti provider-leak toujours vert.
- **UI-only / helper pur** ; aucune route/API/DB. tsc · build · lint · **235 tests** verts.

## 2026-06-08 — Claude (Opus 4.8) — T-202 : quality/cost score réel (helper pur + réactif)
- Fait : `lib/director-quality.ts` (`computeDirectorQuality`, pur) — `QualityReadout`/
  `QualityTone` déplacés ici, le panel les ré-exporte. Branché : `screenPrompt`
  (prompt risk), `estimateBytePlusCost`+`SEEDANCE_USD_PER_MTOKEN` (cost sur somme des
  durées éditées), `faceCompat`/`uploadCompat` (model compat), aspect+durée (social).
- Page : `directorQuality` = `useMemo` (recalcul à chaque édition de scène) ;
  `buildDirectorPlan` ne renvoie que les scènes ; `engineCompat` wrappé en `useMemo`
  (corrige le warning exhaustive-deps).
- Test : `lib/__tests__/director-quality.test.ts` (+8) incl. cas **anti provider-leak**.
- **UI-only / helper pur** ; aucune route/API/DB/state machine. R-009 non traité.
- Fichiers : `lib/director-quality.ts`, `lib/__tests__/director-quality.test.ts`,
  `components/create/ai-director-panel.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `tsc` clean · `vitest` **234/234** · `lint` clean · `build` OK.

## 2026-06-08 — Claude (Opus 4.8) — T-605b : provider-leak cleanup page job (review OK)
- Contexte : review visuelle utilisateur **OK** (flux Director → job créé/terminé). Capture
  montrait « Provider Credits / EvoLink balance / Top up on EvoLink » + clé brute
  « Engine: seedance2_byteplus ».
- Fait (UI-only) : `app/jobs/[id]/page.tsx` — « Provider Credits »→« Generation Credits »,
  « EvoLink balance »→« Credit balance », « Top up on/ {label} »→« Top up credits » (×2,
  url conservée). `components/job/JobCostBadge.tsx` — affiche
  `cleanModelName(getEngineDisplayName(engine))` (ex. « Seedance 2.0 (Direct) ») + label
  « Model: » au lieu de « Engine: <clé brute> ».
- Gating confirmé : tous ces blocs sont **admin-only** ; nettoyés quand même. Reste
  uniquement des URLs dashboard (hrefs admin) + champ `label` non rendu dans
  `PROVIDER_TOP_UP`. Guard test non étendu (rendu JSX non trivial à tester) — le guard
  existant couvre déjà getEngineDisplayName/cleanModelName utilisés par JobCostBadge.
- **Aucune route/API/DB/state machine.** tsc clean · vitest 226/226 · lint clean · build OK.
- Prochaine étape : **T-202** (review OK reçu).

## 2026-06-08 — Claude (Opus 4.8) — Préparation T-202 (read-only, plan ; aucun code)
Helpers lus : `content-policy.ts` (`screenPrompt(prompt) → {blocked, findings[]}`,
findings level block/warn + message), `byteplus-cost.ts`
(`estimateBytePlusCost(res, durSec, {fps,usdPerMToken}) → {costUsd,…}` ;
`SEEDANCE_USD_PER_MTOKEN`), `engine-intentions.ts` (`faceCompat`/`uploadCompat`/
`cleanModelName`), `types.ts`. Inspecté `buildDirectorPlan()` + `QualityReadout`.

**Plan d'implémentation T-202 (à exécuter APRÈS « review OK »)** :
- Nouveau helper pur **`lib/director-quality.ts`** : `computeQuality(input) → QualityReadout`
  (déplacer le type `QualityReadout` ici, l'`ai-director-panel.tsx` l'importera).
  Input : `{ prompt, scenes[], hasFace, hasRawImage, engineCompat, selectedEngineKey, aspectRatio }`.
  Logique (remplace les heuristiques mock) :
  1. **prompt clarity/risk** ← `screenPrompt(prompt)` : `blocked`→risky « Review prompt » ;
     `warn`→medium (code/msg) ; sinon longueur → Good/Okay/Thin.
  2. **cost** ← somme des `durationSec` des scènes (reflète les éditions) ; si moteur
     Seedance (clé ∈ SEEDANCE_USD_PER_MTOKEN ou inclut seedance/byteplus/atlas) →
     `estimateBytePlusCost(res, totalDur, {usdPerMToken})` → `~$X` ; sinon « Estimated after plan ».
  3. **model/reference compat** ← `faceCompat`/`uploadCompat(engineCompat)` + présence @face
     (labels déjà provider-neutres).
  4. **social fit** ← `aspectRatio` + durée totale : 9:16 → « TikTok/Reels OK » (medium si
     totalDur > ~180s) ; 1:1 → « Square/Feed » ; 16:9 → « Landscape/YouTube ».
  - character (High/Medium/None) + time (`~n–2n min`) déplacés dans le helper.
- **Réactivité** : recalculer `directorQuality` quand `directorScenes` change (les
  éditions mettent à jour cost/social/risk en direct) — dérivé en render ou `useMemo`.
- (Option) surfacer une **note de risque** issue de `screenPrompt` dans le panneau.
- **Test** : `lib/__tests__/director-quality.test.ts` (tons ; cost présent pour Seedance ;
  social fit par aspect ; **aucun nom provider** dans les labels).
- Contraintes : helper **pur**, **UI-only**, pas de route/API/DB, providers confidentiels.
  Risque faible (la génération T-201c reste intacte ; seuls les libellés du read-out changent).

## 2026-06-08 — Claude (Opus 4.8) — Review Director : boot OK + vérif code (auth bloquante)
- Dev : `npm run dev` OK. `/create/story` → 307 (auth gate, **pas de 500 ni d'erreur de
  compilation**) ; `/login` → 200 ; **zéro erreur** dans le log dev.
- **Limite** : la passe visuelle *authentifiée* nécessite un login que je ne réalise pas
  (saisie de mot de passe = action que je ne fais pas ; pas d'identifiants). → à faire
  par un humain/Codex connecté.
- Vérif **par revue de code** des 5 points :
  1. Intégration : `AIDirectorPanel` rendu dans la colonne principale (form), avant le CTA. ✓
  2. Lisibilité desktop/mobile : quality read-out `flex flex-wrap`, scene cards pleine
     largeur empilées, actions `flex flex-wrap`. ✓ (structurel)
  3. Édition prompt (textarea) + durée `min=3/max=10` + clamp [3,10]. ✓
  4. Skip path `Generate Video` (type=submit) conservé ; « Plan with AI Director »
     uniquement quand le panneau est fermé. ✓
  5. `Generate now` → `submitJob({ directorScenes })` → body `scenes[]` (chemin
     clientScenes backend). ✓ **par code** ; la création réelle du job reste à
     confirmer en session authentifiée.
- Aucun code modifié pendant la passe.

## 2026-06-08 — Claude (Opus 4.8) — T-201c : cleanup commentaires obsolètes (review Codex)
- Fait (comments-only, zéro runtime) : en-tête `ai-director-panel.tsx` → « editable
  pre-generation plan panel » + mention submit câblé par la page ; `page.tsx` :
  « mock/static preview » → « edited plan » (état + bloc JSX + commentaire builder) ;
  « mock no-op » → « local no-op ». R-009 laissé ouvert (pas de mapping auto Director).
- Fichiers : `components/create/ai-director-panel.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `tsc` clean · `vitest` 226/226 · `lint` clean.

## 2026-06-08 — Claude (Opus 4.8) — T-201c : plan Director → génération (scenes[])
- Fait (UI-only) : `submitJob({ directorScenes? })` extrait de `handleSubmit`. Form
  `Generate Video` inchangé (`submitJob()` sans scènes). « Generate now » du Director →
  `submitJob({ directorScenes })` → body `scenes:[{prompt, duration_sec clamp[3,10],
  ...(selectedEngine!=="auto" && {engine})}]` (jamais `engine:"auto"`). Panel durée
  min3/max10 + clamp ; durées initiales clampées ; texte preview-only retiré/reformulé.
- **Aucune modif** route jobs/DB/migration/state machine/Modal/Stripe/auth. Providers
  confidentiels OK. Backend clientScenes (`:681-692`) consommé tel quel.
- Note R-009 : auto + Director → fallback engine `wan_i2v` côté backend (faible).
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`, `components/create/ai-director-panel.tsx`.
- Tests : `tsc` clean · `vitest` 226/226 · `build` OK · `lint` clean.

## 2026-06-08 — Claude (Opus 4.8) — Déblocage dev local (review visuelle Codex)
- Symptôme : `/create/story` → 500 en dev (`lib/supabase/middleware.ts` : « URL and
  Key are required »). Cause : le `.env.local` réel (gitignored) ne contenait que les
  7 vars R2, **aucune var Supabase** (le `.env.example` committé les liste pourtant).
- Fix : ajout dans `.env.local` (gitignored, non commité) de `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` —
  valeurs **publiques** (clé anon/publishable récupérées via Supabase MCP get_project_url
  / get_publishable_keys). **JAMAIS** la `SUPABASE_SERVICE_ROLE_KEY`.
- Vérif : `npm run dev` → `/create/story` renvoie **HTTP 307** (redirige `/login`,
  pas de session) = client Supabase OK, plus de 500. Dev server arrêté ensuite.
- **Aucun code applicatif touché** ; aucun secret commité (`.env.local` gitignored ;
  les valeurs ajoutées sont des clés publiques navigateur).
- Note pour Codex : si tu lances un autre checkout, copie `.env.example` → `.env.local`
  et renseigne les vars Supabase publiques (mêmes noms).

## 2026-06-08 — Claude (Opus 4.8) — Décision mapping Director→génération (pré-T-201c)
- Fait : `docs/product/director-plan-mapping-decision.md` après inspection read-only
  de `app/api/jobs/route.ts`. **Découverte** : le backend accepte déjà un tableau
  `scenes[]` (`:101`, `:129-130`, `:681-692`, « Phase C: editor-provided scenes »)
  qui alimente le même storyboard + state machine, avec validation serveur
  (cap MAX_SCENES[plan], duration clamp [3,10], prompt ≤2000).
- **Décision : Option B** (envoyer les scènes éditées) — zéro modif backend/state
  machine, fidèle au plan éditable. Option A (prompt unique re-splitté) rejetée.
  Résout R-008 ; cadre T-201c (mapping UI-only).
- **Docs-only** ; aucun code modifié.
- Fichiers : `docs/product/director-plan-mapping-decision.md`, `agent/tasks.md`,
  `agent/log.md`, `agent/review.md`.
- Tests : (validation ci-dessous).

## 2026-06-08 — Claude (Opus 4.8) — T-201b : AI Director mock panel
- Fait : `components/create/ai-director-panel.tsx` (mock/static) + câblage page
  (`buildDirectorPlan`, état directorOpen/scenes/quality, bouton « Plan with AI
  Director », actions locales). Quality read-out + scene cards éditables + 6 actions
  de direction (mutent le mock). Skip path `Generate Video` intact. Providers
  confidentiels (cleanModelName). Note R-008 : plan édité = preview-only (→ T-201c).
- **UI-only** : aucune route/DB/POST /api/jobs/state machine/Stripe/auth/Modal.
- Fichiers : `components/create/ai-director-panel.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `tsc` clean · `vitest` 226/226 · `build` OK · `lint` clean.
- Prochaine étape : review Codex UX, puis T-201c (connect storyboard) après décision archi.

## 2026-06-08 — Claude (Opus 4.8) — T-201a : spec AI Director (+ fix compteur HANDOVER)
- Fait : `docs/product/ai-director-spec.md` (spec-only) — UX flow (Plan with AI
  Director, storyboard éditable, actions Generate/Improve/Cinematic/Realistic/
  TikTok/Keep character), data par scène, quality score (réutilise content-policy/
  byteplus-cost/engine-intentions), contraintes (pas de state machine, pas de DB,
  providers confidentiels), découpage T-201a/b/c + T-202 + T-301, non-goals.
- Fix mini-suivi Codex : HANDOVER Quick start `220+ tests` → `226 tests`.
- **Docs-only** ; aucun code/route/DB.
- Fichiers : `docs/product/ai-director-spec.md`, `HANDOVER.md`, `agent/tasks.md`, `agent/log.md`.
- Tests : (validation ci-dessous).
- Prochaine étape : sur validation de la spec → T-201b (UI mock/static).

## 2026-06-08 — Claude (Opus 4.8) — T-601 fin : README court + HANDOVER status
- Fait : `README.md` remplacé par une version courte/actuelle (renvoi `HANDOVER.md`,
  stack réelle, commandes, coordonnées, checks) — plus de Runpod/SVI/AudioLDM2/
  LangGraph comme stack. `HANDOVER.md` « Known gaps » : README/CLAUDE/lint marqués ✅,
  compteur tests → 226, snapshot lint ajouté. R-001 → resolved.
- **Docs-only** ; aucun code/route/DB/secret.
- Fichiers : `README.md`, `HANDOVER.md`, `agent/tasks.md`, `agent/log.md`, `agent/review.md`.
- Tests : vitest **226/226** · tsc clean · lint clean · build OK.

## 2026-06-08 — Claude (Opus 4.8) — T-601 : refresh CLAUDE.md (ciblé)
- Fait : addendum daté 2026-06-08 en tête de `CLAUDE.md` (pipeline multi-provider
  BytePlus/Atlas/EvoLink/HeyGen/Wan ; Director Console ; composer TipTap + Assets
  panel + verified faces ; règle confidentialité providers T-102/T-605 + guard test ;
  226 tests + tsc/build/lint clean). Bandeau « HANDOVER.md = source de vérité ».
  Corps historique 2026-05-11 conservé (garde-fous). Pas de réécriture massive.
- **Docs-only** ; aucun code applicatif.
- Fichiers : `CLAUDE.md`, `agent/tasks.md`, `agent/log.md`.
- Tests : vitest 226 · tsc clean · lint clean · build OK.
- Reste : corps README (T-601 partiel).

## 2026-06-08 — Claude (Opus 4.8) — Guard test anti provider-leak (T-602)
- Fait : `lib/__tests__/provider-leak-guard.test.ts` — assure qu'aucun label public
  ne contient BytePlus/AtlasCloud/EvoLink/Bailian/Kie.ai/HeyGen (ENGINE_DISPLAY_NAMES,
  getEngineDisplayName, cleanModelName + cas réalistes + non-over-stripping). Verrouille
  T-102/T-605 contre toute régression future.
- Test-only ; aucun code applicatif modifié.
- Fichiers : `lib/__tests__/provider-leak-guard.test.ts`.
- Tests : **226/226** (10 fichiers) · `tsc` clean · `lint` clean · `build` OK.

## 2026-06-08 — Claude (Opus 4.8) — T-605 : remove public provider names
- Fait (UI-only ; aucune route/DB/Stripe/Modal) :
  - Avatar picker badge `HeyGen credits · ~60× cheaper` → `Avatar mode · lower cost`.
  - `friendlyError` page job (public) sans BytePlus/Kling O3/Atlas.
  - `lib/types.ts ENGINE_DISPLAY_NAMES` : retrait `(Kie.ai)/(Bailian)/(HeyGen)/(Atlas)`
    → corrige aussi `/gallery` + page job (getEngineDisplayName). `(Direct)` gardé.
  - faces-manager : texte du lien d'aide neutralisé.
- Audit : panneaux coût/crédits create + « EvoLink balance »/« Top up » + JobCostBadge
  sont **admin-gated** → laissés (conforme consigne). Avatar studio : 0 provider visible.
- Ouvert : R-006 (href console provider sur le lien d'aide, faible).
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`, `app/jobs/[id]/page.tsx`,
  `lib/types.ts`, `components/create/faces-manager.tsx`.
- Tests : `vitest` 220/220 · `tsc` clean · `build` OK · `lint` clean.

## 2026-06-08 — Claude (Opus 4.8) — T-102b : wording sans provider (review Codex)
- Fait : badge `BytePlus 2.0 only` → `Seedance 2.0 only` ; `cleanModelName()`
  retire les noms providers (HeyGen/BytePlus/AtlasCloud/EvoLink/Bailian/Kie.ai) des
  labels de modèles + caption « Powered by » ; faces-manager : `BytePlus Asset ID`
  → `Verified Face Asset ID` (+ message d'erreur) ; avertissement create reformulé
  sans BytePlus/Atlas. Vérif : mentions providers restantes = commentaires uniquement.
- Créé `[T-605]` (cleanup noms providers ailleurs : HeyGen credits, EvoLink balance,
  message job, lien console) — non mélangé à T-102b (consigne Codex).
- **UI-only**, aucune route touchée.
- Fichiers : `lib/engine-intentions.ts`, `components/create/faces-manager.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`.
- Tests : (à lancer ci-dessous).

## 2026-06-08 — Claude (Opus 4.8) — T-102 labels provider-friendly + badges compat
- Fait : `lib/engine-intentions.ts` (helper pur, display-only) → intentions produit
  (Realistic character / Fast draft / Avatar / Cinematic HD / General) + statut de
  compatibilité asset relatif au moteur. Dropdown Model mène par l'intention +
  caption « Powered by ». Badges de compat sur vignettes faces (AssetPanel +
  FacesManager mobile) et uploads (AssetPanel).
- **UI-only** : aucune route `jobs`/providers modifiée ; la valeur d'engine envoyée
  à l'API reste inchangée (le label est cosmétique). Donc rien à valider côté
  `review.md` au titre du protocole #4.
- Fichiers : `lib/engine-intentions.ts`, `components/create/asset-panel.tsx`,
  `components/create/faces-manager.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `vitest` 220/220 · `tsc` clean · `build` OK · `lint` clean.
- Prochaine étape : review ciblée Codex (UX + régression), puis T-201/T-301 selon Paul.

## 2026-06-08 — Claude (Opus 4.8) — Protocole multi-agents : rôles + backlog 6 axes
- Fait : ajout de la section « Rôles des agents » dans `AGENTS.md` (Claude Code /
  Codex local / ChatGPT : périmètres, droits, règle de non-collision avec owner) ;
  restructuration de `agent/tasks.md` en **6 axes Director Console** (polish create
  flow, AI Director, Scene Board, Saved Looks, post-gen studio, cleanup docs/lint/
  tests) avec `owner` par tâche.
- Fichiers : `AGENTS.md`, `agent/tasks.md`, `agent/log.md`. **Aucun code applicatif.**
- Tests : docs-only → build non requis.
- Prochaine étape : sur décision de Paul, démarrer T-102 (labels friendly + badges
  compat) ou un autre axe.

## 2026-06-08 — Claude (Opus 4.8) — T-001 Director Console (layout-only) + migration rétro
- Fait :
  - Rangée de contrôles unifiée **Model · Duration · Format · Scenes** en haut
    (dropdowns), suppression de l'ancienne grille Duration/Format/Scenes dupliquée.
  - Sections « Reference image » + « References » repliées dans un collapsible
    (fermé par défaut) → page nettement plus courte. Toujours accessibles pour
    les moteurs non-BytePlus.
  - Migration rétroactive `supabase/migrations/20260608_byteplus_assets_thumb_and_update_policy.sql`
    (additive, idempotente ; trace la colonne `thumb_path` + policy UPDATE déjà en
    prod). Non ré-appliquée (déjà présente). R-003 → résolu côté traçabilité.
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`,
  `supabase/migrations/20260608_byteplus_assets_thumb_and_update_policy.sql`.
- Tests : `tsc` clean · `build` OK · `lint` clean · `vitest` 220/220.
- Prochaine étape : T-002 (labels provider-friendly + badges statut assets) — sur
  décision R-002 (Paul a choisi « layout only » pour cette itération).

## 2026-06-08 — Claude (Opus 4.8) — Mise en place coordination multi-agents
- Fait : lecture `HANDOVER.md` + `CLAUDE.md` + `future-proof-notes.md` ; création
  des fichiers de coordination `AGENTS.md`, `agent/tasks.md`, `agent/log.md`,
  `agent/review.md`.
- Constat doc : `CLAUDE.md` et `future-proof-notes.md` datent du 2026-05-11 et
  décrivent une stack EvoLink/Modal antérieure au virage BytePlus/HeyGen/composer
  → noté dans `agent/review.md` (R-001).
- Fichiers : `AGENTS.md`, `agent/tasks.md`, `agent/log.md`, `agent/review.md`.
- Tests : changements docs-only (pas de code) → build non requis.
- Prochaine étape : T-001 (Director Console Phase 1) après validation du niveau
  souhaité (R-002).

## 2026-06-08 — Claude (Opus 4.8) — Lint 100% clean (liste CTO)
- Fait : `setPagination` fonctionnel (admin/jobs) ; suppression d'un
  `eslint-disable` inutilisé ; lucide `Image`→`ImageIcon` (library) ;
  `eslint-disable` sur 4 `<img>` intentionnels (avatar + create).
- Fichiers : `app/(admin)/admin/jobs/page.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`, `app/(workspace)/library/page.tsx`,
  `app/(workspace)/create/avatar/page.tsx`.
- Tests : `next lint` → no warnings/errors ; `build` OK ; `vitest` 220/220.
- Commit : `e91c5d5`.

## 2026-06-08 — Claude (Opus 4.8) — Consolidation CTO (build/handover/gallery)
- Fait : `/gallery` resilient au build sans `SUPABASE_SERVICE_ROLE_KEY`
  (try/catch) ; création `HANDOVER.md` ; bandeau `README.md`.
- Fichiers : `app/gallery/page.tsx`, `HANDOVER.md`, `README.md`.
- Tests : `build` OK de bout en bout ; `vitest` 220/220 ; `tsc` clean.
- Commit : `359d6e4`.

## 2026-06-08 — Claude (Opus 4.8) — Director Console : layout (A + contrôles)
- Fait : Model selector → dropdown compact (badges HD/Refs/verrou en texte) ;
  Duration/Format/Scenes → rangée compacte de dropdowns ; panneau Assets à droite
  (AssetPanel : onglets My Faces / Uploads, recherche, vignettes, click-to-insert) ;
  ancien bloc faces en fallback mobile.
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`,
  `components/create/asset-panel.tsx`.
- Tests : `build` OK ; `tsc` clean.
- Commits : `49960eb`, `6056ce0`, `0b434a2`.

## 2026-06-08 — Claude (Opus 4.8) — Faces self-service + asset:// validé end-to-end
- Fait : `FacesManager` (vignettes photo, add photo+assetId, attach photo, delete) ;
  colonne `byteplus_assets.thumb_path` ; API `GET/POST/PATCH/DELETE` (thumbs signés) ;
  upload image → chip `@image` + envoi via `references_payload` (uniquement les chips
  présents dans le prompt). Génération réussie avec visage vérifié (`asset://`) sur
  Seedance 2.0 Fast (job `e235de1e`).
- ⚠️ Opérations DB hors-protocole (faites avant ce protocole) → voir `review.md` R-003 :
  migration `thumb_path`, policy RLS `byteplus_assets_update_own`, insertion des
  assets vérifiés de l'utilisateur (groupe « Paul »).
- Fichiers : `components/create/faces-manager.tsx`,
  `app/api/byteplus-assets/route.ts`, `app/(workspace)/create/[mode]/page.tsx`,
  `components/create/prompt-composer.tsx`.
- Tests : `build` OK ; `tsc` clean ; `vitest` 220/220.
- Commits : `da38afc`, `4dbda8a`, `098b707`, `03eaffe`, `fc14560`, `8e702da`, `7ac7380`.

## 2026-06-08 — Codex — T-301b ScenePanel polish + regen gating
- Reprise apres limite de credit Claude : travail non committe finalise sans creer de nouveau SceneBoard.
- Fait : `lib/scene-status.ts` (helper pur client-safe : `sceneStatusMeta`, `supportsSingleSceneRegen`) + test ; `SceneTimeline` reutilise `sceneStatusMeta` pour ses labels ; `ScenePanel` affiche `Model` avec `cleanModelName(getEngineDisplayName(...))`, recoit `jobEngine` mobile+desktop, et masque `Regenerate` hors moteurs supportes (EvoLink/Bailian only, R-010).
- Scope : UI-only/helper pur ; aucune route/API/DB/state machine.
- Validation : `vitest` 240/240 · `tsc` clean · `lint` clean · `build` OK.

## 2026-06-08 — Codex — T-501a Post-generation Studio spec/audit
- Contexte : Claude Code indisponible ~48h (limite credit). Codex continue avec coordination explicite pour eviter les doublons.
- Audit read-only : la page job possede deja les actions principales (Download, Share, Copy link/prompt, Duplicate, Save as Look selon moteur, retry scenes) et rend `SocialExportPanel` sur les jobs done.
- Audit routes/components : `SocialExportPanel` couvre deja exports formats, thumbnail picker, AI copy, publish direct et schedule ; routes existantes : duplicate, export-social, social-pack, thumbnail, generate-metadata, looks, scheduled-posts. `upscale` est un stub 501 -> ne pas le mettre en action primaire.
- Livre docs-only : `docs/product/post-generation-studio-spec.md` avec decoupage T-501b/c/d/e et prompt de reprise pour Claude Code.
- Coordination : `agent/tasks.md` Axe 5 recadre (ne pas creer de doublon, reutiliser SocialExportPanel/ThumbnailPicker/routes existantes). `agent/review.md` ajoute R-012 duplicate fidelity et R-013 Use as reference decision.
- Scope : docs-only, aucun runtime/route/API/DB.

## 2026-06-08 — Codex — T-501b Job action bar premium
- Fait : action bar des jobs termines regroupee dans un rail responsive plus premium.
  Zone gauche : Download, Share, Copy link, Copy prompt. Zone droite : Duplicate job,
  Save as Look quand supporte.
- Decision UX : conserver `Duplicate job` au lieu de `Create variation`, car la route
  actuelle relance directement un job et ne garantit pas encore toute la fidelite des
  assets/options (R-012).
- Scope : UI-only (`app/jobs/[id]/page.tsx`) ; handlers/routes existants inchanges ; aucune route/API/DB/state machine.
- Validation : `vitest` 240/240 · `tsc` clean · `lint` clean · `build` OK.

## 2026-06-08 - Codex - T-501c Social Pack consolidation
- Fait : `components/job/social-export-panel.tsx` a maintenant un header plus studio et un resume compact des etats : Formats, Thumbnail, Copy, Channels.
- Comportement conserve : aucun changement de route/API/state ; export-social, thumbnail, generate-metadata, publish direct et scheduled-posts restent les chemins existants.
- Scope : UI-only ; gates free/pro/social connections conserves ; aucun provider visible.
- Validation : `vitest` 240/240 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501d Use as reference decision
- Audit read-only : le create flow envoie des references structurees (`ReferenceItem`/`ReferencePayload`) ; source canonique = `storage_path` dans le bucket prive `references` ; `upload?bucket=references` est image-only (JPG/PNG/WEBP). Les slots video/audio sont encore coming soon.
- Decision : V1 = `Use as image reference`, pas full video reference. Utiliser thumbnail/last_frame/image_url, role `outfit_style`, jamais `character_face` automatique.
- Livre docs-only : `docs/product/use-as-reference-decision.md` + backlog decoupe T-501d1/d2/d3. R-013 resolved.
- Scope : docs-only ; aucune route/API/DB/runtime.


## 2026-06-08 - Codex - T-501d1 Backend reference-image route
- Fait : nouvelle route `POST /api/jobs/[id]/reference-image` (auth + ownership + job done) qui prepare une image de reference depuis thumbnail/last_frame/image_url/R2 frame candidate.
- Stockage : copie server-side dans le bucket prive `references` sous `{user_id}/job-refs/...`, puis signed URL 6h pour preview. Retourne un `ReferenceItem` role `outfit_style`, jamais `character_face` automatique.
- Helper pur : `lib/job-reference-image.ts` (`pickJobReferenceImageSource`, path builder, item builder) + tests unitaires.
- Scope : backend additive route + helper ; aucune migration, aucune UI encore. Prochaine suite : T-501d2 create prefill.
- Validation : `vitest` 244/244 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501d2 Create prefill from reference job
- Fait : `app/(workspace)/create/[mode]/page.tsx` lit `reference_job_id` via `useSearchParams`, appelle `POST /api/jobs/[id]/reference-image`, puis ajoute la reference au state existant.
- Le prefill ajoute `job_reference` dans `references`, mappe la reference dans `composerUploadItems`, insere un chip `@reference`, ouvre la zone references, et affiche un statut loading/ready/error.
- Scope : glue UI vers route T-501d1 ; aucune nouvelle route/DB/migration. Prochaine suite : T-501d3 bouton `Use as reference` sur la page job.
- Validation : `vitest` 244/244 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501d3 Job page Use as reference action
- Fait : ajout du bouton `Use as reference` dans l action bar des jobs termines (`app/jobs/[id]/page.tsx`).
- Le bouton est un lien vers `/create/story?reference_job_id=<job_id>` ; il ne genere rien directement et s appuie sur T-501d1/T-501d2 pour preparer et attacher la reference.
- Scope : UI-only ; aucun nouveau endpoint, aucune DB/migration, aucun provider visible.
- Validation : `vitest` 244/244 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501e Duplicate fidelity audit
- Audit read-only : `app/api/jobs/[id]/duplicate/route.ts` forward vers `POST /api/jobs` mais ne copie que prompt, duration, engine, image_url et references_payload.
- Compare avec le contrat `POST /api/jobs` : manquent aspect_ratio, caption/audio fields, byteplus_asset_ids, multi_scene_chain, chain_strategy, et les scenes Director/storyboard.
- Livre docs-only : `docs/product/duplicate-fidelity-audit.md` avec gaps P1/P2/P3, recommendation T-501e1, test plan et copy guidance.
- Coordination : T-501e done ; T-501e1 ajoute comme implementation backend + tests ; R-012 reste open et passe medium jusqu a correction route.
- Scope : docs-only ; aucun runtime/route/API/DB modifie.


## 2026-06-08 - Codex - T-501e1 Duplicate route fidelity implementation
- Fait : helper pur `lib/job-duplicate-payload.ts` pour construire le body `POST /api/jobs` depuis une row jobs existante, sans copier outputs/status/couts.
- Route `app/api/jobs/[id]/duplicate/route.ts` : select etendu (storyboard, verified face IDs, aspect, audio/captions, chain settings, avatar_final) puis forward centralise vers `POST /api/jobs`.
- Fidelite : storyboard persiste -> `scenes[]` pour conserver les plans Director ; aspect ratio, captions/audio, chain settings, references/image_url et verified faces repris.
- Avatar/look jobs : blocage explicite 409 provider-neutral (pas de duplication trompeuse tant que les champs source dedies ne sont pas persistables/reconstructibles).
- Tests : `lib/__tests__/job-duplicate-payload.test.ts` couvre copie moderne, invalid optionals, non-copie plan/outputs, avatar block, prompt manquant.


## 2026-06-08 - Codex - R-009 AI Director Auto decision
- Decision Paul : Auto dans AI Director = Seedance 2.0 Fast, cle interne `seedance2_fast_byteplus`.
- Fait : nouveau helper pur `lib/director-engine.ts` + test ; `/create/[mode]` resout `selectedEngine === "auto"` vers cette cle pour `scenes[].engine` quand le Director genere.
- Le quality/cost read-out utilise la meme cle resolue ; labels publics restent provider-neutral.
- Priorites suivantes consignees : T-602, R-003, T-604, T-401, avatar/look duplicate, T-301c, R-006.


## 2026-06-08 - Codex - T-602a byteplus-assets route tests
- Fait : ajout de `app/api/byteplus-assets/route.test.ts`, tests route-level avec `createClient` Supabase mocke.
- Couverture : 401 sans user, GET scope `user_id` + signed thumbnail, POST validation asset id + upsert trimme, PATCH no-op + scope id/user, DELETE id requis + scope id/user.
- Aucun appel Supabase/provider reel ; pas de runtime modifie.
- Validation : `vitest` 258/258, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-08 - Codex - T-602b upload references route tests
- Fait : ajout de `app/api/upload/route.test.ts`, tests route-level du chemin `POST /api/upload?bucket=references`.
- Mocks : `createClient`, `uuid.v4`, `file-type/fromBuffer`; aucun appel Supabase/R2/provider reel.
- Couverture : auth 401, fichier requis, magic bytes absents, MIME mismatch, upload user-scoped `user_id/uuid.ext`, signed URL 6h, erreur storage.
- Validation : `vitest` 264/264, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-602c POST /api/jobs route tests
- Fait : ajout de `app/api/jobs/route.test.ts`, tests route-level de `POST /api/jobs` avec Supabase service/auth et providers mockes.
- Couverture : prompt min, content policy, reference storage ownership, active generation gate, daily quota free, plan gate moteur Pro.
- Aucun appel provider reel ; les tests restent sur les early exits/gates avant generation.
- Validation : `vitest` 270/270, `lint` clean, `build` OK, `tsc` clean (relance seule apres build pour eviter collision .next/types).


## 2026-06-09 - Codex - T-701 Schedule double-sidebar fix + visible roadmap
- Fait : suppression de la sidebar locale dans `app/(workspace)/schedule/page.tsx`; le layout workspace rend maintenant l unique navigation.
- Nettoyage : retrait du fetch profil local `plan/email` devenu inutile.
- Coordination : ajout Axe 7 Visible Premium Pass, R-014 (perception visuelle encore insuffisante), R-015 (dettes restantes rappelees par Paul), et push policy autonome.
- Validation : `vitest` 270/270, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-702 Landing public refresh
- Fait : refresh `app/page.tsx`, suppression du message date "open-source AI models on Modal".
- Nouveau positionnement : AI video direction workspace, Director plan, assets, post-generation studio, CTA "Create with Director".
- Scope : UI/copy-only, provider-neutral ; aucune route/API/DB.
- Validation : `vitest` 270/270, `tsc` clean, `lint` clean, `build` OK. Dev server local a repondu HTTP 200 ; Browser plugin indisponible pendant le check.


## 2026-06-09 - Codex - T-703 Create flow premium pass
- Fait : ajout d'une `Director Console` visible dans `app/(workspace)/create/[mode]/page.tsx`, juste apres les controles Model/Duration/Format/Scenes.
- UX : le Director n'est plus un bouton secondaire en bas ; la console montre Plan, Model, Readiness, propose `Plan with AI Director` et garde un skip path `Generate now`.
- Nettoyage : suppression du doublon bas du Director ; textes visibles de credits admin rendus provider-neutral dans le create flow.
- Scope : UI-only ; aucune route/API/DB/state machine.
- Validation : `vitest` 270/270, `tsc` clean, `lint` clean, `build` OK. Dev server local : `/create/story` -> HTTP 307 (auth gate, pas de 500). Browser plugin toujours indisponible dans cet environnement.


## 2026-06-09 - Codex - Playwright QA + T-704 Home command center
- Browser plugin KO confirme dans une session dediee : `windows sandbox failed: spawn setup refresh`.
- Fait : ajout de Playwright en dev dependency (`@playwright/test`) + script `npm run test:e2e`, config Chromium et smoke tests publics/auth gate.
- Fait : `/home` remplace le template picker par un command center premium : actions principales, production pulse, pipeline workspace, starters et projets recents.
- Scope T-704 : UI-only ; aucune route/API/DB. Les tests Playwright ne saisissent aucun login ; les routes workspace sont verifiees comme auth-gated sans session.
- Validation : `vitest` 270/270, `test:e2e` 3/3, `tsc` clean, `lint` clean, `build` OK. Note : un serveur dev stale a ete redemarre apres une erreur Turbopack locale (`[turbopack]_runtime.js` manquant).


## 2026-06-09 - Codex - T-705 Library asset studio pass
- Fait : `/library` transforme la grille simple en Asset Studio : hero, stats, recherche, filtres, cartes video premium.
- Actions par asset : utiliser comme reference (`/create/story?reference_job_id=<id>`), ouvrir Studio (`/jobs/<id>`), telecharger le master, ouvrir le job pour social pack.
- Scope : UI-only ; reutilise `jobs` done + `social_exports`, aucune route/API/DB.
- Validation : `vitest` 270/270, `test:e2e` 3/3, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-09 - Codex - Remaining roadmap cleanup
- R-006 : ajout de la page interne `/help/verified-face-id` et remplacement du lien fournisseur dans `FacesManager`.
- T-401 : spec Saved Looks livree dans `docs/product/saved-looks-spec.md` (docs-only, audit/migration deferees).
- Avatar/look duplicate : contrat livre dans `docs/product/avatar-look-duplicate-contract.md`; le 409 actuel reste volontaire tant que la reconstruction fidele n'est pas prouvee.
- T-301c : retry affordances cloturees via l'existant (`retry-scenes`) + gating single-scene regen deja livre par `supportsSingleSceneRegen()`.
- R-003 : migration retrospective deja presente et verifiee (`20260608_byteplus_assets_thumb_and_update_policy.sql`), sans donnees user ; aucune operation prod nouvelle.
- T-604/R-004 : `next.config.ts` ne contient plus `typescript.ignoreBuildErrors`; tsc/lint/build restent clean.


## 2026-06-09 - Codex - T-401a/T-401b Saved Looks first surface
- Audit livre : `docs/product/saved-looks-audit.md`.
- Constat : l'existant Saved Looks est `cinematic_looks` + `/api/looks`, limite aux jobs `heygen_avatar_shots`; aucune migration locale ne cree la table.
- Implementation safe slice : `/library` affiche les Saved Looks et propose `Create with look`.
- `/create/avatar?look_id=<id>` preselectionne le look et bascule en mode cinematic apres chargement des looks.
- Scope : aucune route/API/DB/migration/provider modifiee.
- Validation : `tsc` clean, `vitest` 270/270, `lint` clean, `build` OK, `test:e2e` 3/3.
- Browser plugin : KO dans cette session avec `windows sandbox failed: spawn setup refresh`; fallback Playwright utilise.


## 2026-06-09 - Codex - T-401c Saved Look reuse payload helper
- Ajout `lib/saved-look-payload.ts` : helper pur pour construire le body `POST /api/jobs`
  depuis un Look sauvegarde (`look_id`, script, voix, qualite lipsync).
- `/create/avatar` reutilise ce helper pour le chemin `Create with look`.
- Tests `lib/__tests__/saved-look-payload.test.ts` : contrat, validations, cap 2000,
  default `speed`, anti provider-leak.
- Scope : pas de route/API/DB/migration/provider.
- Validation : `tsc` clean, `vitest` 274/274, `lint` clean, `build` OK, `test:e2e` 3/3.


## 2026-06-09 - Codex - T-401d blocked audit + T-801a UGC Studio spec
- Supabase live audit tente en lecture seule : `list_tables` et `execute_sql` bloques
  par access-control ; `.env.local` sans service-role/DB URL.
- Livre `docs/product/saved-looks-supabase-audit.md` avec constat, evidence locale,
  requetes SQL lecture seule et recommandation de ne pas migrer avant audit privilegie.
- Livre `docs/product/ugc-studio-spec.md` : Product/UGC flow, references V1 via
  `outfit_style`, Verified Faces/Saved Looks/AI Director/Social Pack, slices T-801.
- Scope : docs/coordination only ; aucune route/API/DB/migration/runtime.
- Validation : `tsc` clean, `vitest` 274/274, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-801b UGC Director helper
- Ajout `lib/ugc-director.ts` : helper pur product/outfit/angle/platform/creator
  -> prompt global + aspect ratio + scenes Director.
- V1 utilise les labels de references compatibles (`image 1`, `image 2`) sans nouveau role DB.
- Tests `lib/__tests__/ugc-director.test.ts` : 6 scenes avec outfit, 5 sans outfit,
  mapping aspect ratio, variantes angle/creator, fallbacks, anti provider-leak.
- Scope : helper/test/docs only ; aucune UI, route, API, DB, migration ou provider.
- Validation : `tsc` clean, `vitest` 280/280, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-801c UGC panel in create flow
- Ajout d'un panneau UGC Studio UI-only sur `/create/product` et `/create/social`.
- Le panneau lit les images deja inserees dans le composer : premiere image = product,
  deuxieme image = outfit/style, sans nouveau role de reference.
- `Build UGC Director plan` appelle `buildUGCDirectorPlan()`, applique l'aspect ratio,
  plafonne scenes/duree selon le plan et ouvre le AI Director avec scenes locales.
- Scope : aucune route/API/DB/migration/provider ; `Generate Video` classique inchange.
- Validation : `tsc` clean, `vitest` 280/280, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-801d explicit UGC reference roles
- Ajout des roles image `product_reference` et `outfit_reference` au contrat `ReferenceRole` et a `validateReferences()` ; `outfit_style` reste accepte pour compat legacy.
- `/create/product` et `/create/social` affichent deux slots pres du composer : Product reference et Outfit/style, avec upload fichier ou drag/drop.
- Les uploads UGC portent le role explicite dans `references_payload`, mais le Director conserve les placeholders modele `image 1` / `image 2` via le serializer du composer.
- `ReferenceUpload` expose aussi Product + Outfit/Style comme slots images explicites.
- Scope : aucune DB/migration/route/provider/state machine.
- Validation : `tsc` clean, `vitest` 281/281, `lint` clean, `build` OK, `test:e2e` 3/3. Browser plugin KO connu (`windows sandbox failed: spawn setup refresh`), fallback Playwright utilise.

## 2026-06-09 - Codex - T-801e UGC creator identity polish
- Ajout d'un panneau `Creator identity` dans UGC Studio (`/create/product`, `/create/social`) : Product-first, Verified face, Saved Look, Avatar.
- Les cartes affichent disponibilite, miniatures quand disponibles et selecteurs si plusieurs assets existent.
- Chargement paresseux de `/api/looks` pour Saved Looks ; `/api/heygen` se charge aussi quand l'identite Avatar est choisie.
- `lib/ugc-director.ts` accepte `creatorLabel` et injecte le nom de l'identite choisie dans les prompts/scenes Director ; tests ajoutes.
- Scope : UI/helper/test only ; aucun changement route/API/DB/migration/provider/state machine.
- Validation : `tsc` clean, `vitest` 282/282, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-801f UGC Social Pack presets
- Ajout `lib/ugc-social-pack.ts` : presets TikTok/Reels, Instagram feed et Landscape ad avec aspect ratio, formats cibles, brief metadata, hook/CTA et hashtags.
- `buildUGCDirectorPlan()` integre le preset social dans le prompt global, les scenes hook/CTA et expose `plan.social`.
- UGC Studio affiche un encart `Social Pack preset` sur `/create/product` et `/create/social` ; le build UGC passe `caption_mode` a `auto`.
- Tests ajoutes/etendus : `ugc-social-pack.test.ts` + contrat Social Pack dans `ugc-director.test.ts`.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.
- Validation : `tsc` clean, `vitest` 286/286, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-802 UGC generation contract
- Livre `docs/product/ugc-generation-contract.md` : contrat produit/technique de la
  generation UGC V1.
- Clarifie la baseline actuelle : UGC Studio = references product/outfit + creator
  identity + AI Director + Social Pack sur le payload jobs existant.
- Verrouille les non-promesses V1 : pas de try-on exact garanti, pas de preservation
  parfaite produit/logo, pas de lipsync natif voix importee, pas de consistence 120s
  garantie sur tous les chemins modele.
- Ajoute R-017 pour garder ce risque visible avant tout futur T-803 exact try-on /
  product grounding.
- Scope : docs/coordination only ; aucune route/API/DB/migration/runtime/provider.

## 2026-06-09 - Codex - T-802b UGC payload audit
- Audit livre : `docs/product/ugc-payload-audit.md`.
- Conclusion : le `POST /api/jobs` existant preserve les champs UGC V1 importants :
  `references_payload`, `byteplus_asset_ids`, `aspect_ratio`, `caption_mode` et
  `scenes[]` -> `storyboard`/`job_scenes`.
- Ajout d'un test route-level dans `app/api/jobs/route.test.ts` pour verrouiller un
  payload UGC complet avec product/outfit refs, verified face assets, captions auto,
  format 9:16 et deux scenes Director clampées.
- Decision : pas de route dediee `/api/ugc/jobs` en V1 ; le contrat jobs existant
  suffit tant qu'on reste sur UGC planning/generation best-effort.

## 2026-06-09 - Codex - T-802c UGC readiness score
- Ajout `lib/ugc-readiness.ts` : helper pur qui classe le plan UGC en Ready,
  Missing product, Style-only, Needs identity ou Best effort.
- Panneau UGC (`/create/product` et `/create/social`) : nouvel encart readiness
  reactif avec checks Product / Style / Identity. Il informe sans bloquer le flow.
- Tests `lib/__tests__/ugc-readiness.test.ts` : statuts, identites indisponibles,
  copy best-effort pour outfit/try-on et guard anti provider-leak.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.

## 2026-06-09 - Codex - T-802d UGC backend decision
- Livre `docs/product/ugc-backend-decision.md`.
- Decision : pas de route dediee `/api/ugc/jobs` en V1. UGC reste une couche
  planning/orchestration au-dessus du `POST /api/jobs` existant.
- Raison : T-802b prouve que les champs UGC V1 sont preserves et que le chemin jobs
  garde validation references, quota, plan gates, content policy, routing et state
  machine centralises.
- Scope : docs/coordination only ; aucun runtime/route/API/DB/migration/provider.

## 2026-06-09 - Codex - T-803a exact try-on / product grounding spec
- Livre `docs/product/ugc-exact-tryon-grounding-spec.md`.
- Specifie les tiers de capacite futurs : product-grounded UGC, logo/text
  preservation, outfit style transfer, exact try-on.
- Cadre la copy autorisee/interdite, les besoins data/payload, consent/safety,
  evaluation harness et les tranches T-803b/c/d/e.
- Decision : ne pas ajouter de backend dedie sans validation modele/payload concrete.
- Scope : docs/coordination only ; aucun runtime/route/API/DB/migration/provider.

## 2026-06-09 - Codex - T-803b UGC capability matrix
- Ajout `lib/ugc-capabilities.ts` : matrice provider-neutral des capacites UGC par
  modele public (product grounding, logo/text, outfit style, exact try-on,
  verified identity, duree fiable, usages/cautions).
- Exact try-on est explicitement `none` pour tous les modeles actuels : pas de
  promesse avant validation T-803e.
- Tests `lib/__tests__/ugc-capabilities.test.ts` : Auto, product grounding,
  avatar vs product, defaults prudents, anti provider-leak.
- Scope : helper/test/docs only ; aucune route/API/DB/migration/provider/state machine.

## 2026-06-09 - Codex - T-1004 public gallery from curated rows
- Branche `/gallery` sur `gallery_items` via le client Supabase public/RLS :
  `status='published'` uniquement, tri featured puis sort_order puis published_at.
- `GalleryShowcasePage` accepte des lignes curatées et conserve le fallback
  placeholders privacy-first si aucun item n'est publié.
- Garanties : aucune lecture directe de `jobs`, aucune route admin, aucun service-role
  côté galerie publique ; le manager admin T-1003 reste la seule source de publication.

## 2026-06-09 - Codex - T-1005/1006 gallery lightbox/filter QA
- Finalise la tranche lightbox/create-similar/QA côté galerie publique.
- Le CTA `Create similar` reste sûr : il utilise `reference_job_id` seulement si
  l'item public curaté possède un `source_job_id`, sinon il démarre un create flow vierge.
- Les filtres de catégories sont maintenant fonctionnels côté client.
- QA réalisée sur `/gallery` : HTTP 200, capture Playwright OK, e2e 3/3.

## 2026-06-10 - Codex - T-1003 admin jobs Add to gallery
- Ajout d'une action `Add` dans `/admin/jobs` pour les jobs `done`.
- L'action appelle `POST /api/admin/gallery/from-job`, cree uniquement un brouillon
  galerie, puis redirige vers `/admin/gallery` pour edition/publication manuelle.
- Confidentialite conservee : aucun item n'est publie automatiquement et le prompt
  prive brut reste protege par `galleryDraftFromJob`.

## 2026-06-10 - Codex - Axe 11 Premium Product Experience T-1101/T-1102/T-1103
- Ajout `docs/product/premium-product-experience-spec.md` : direction globale
  Runway-like / Director Console, principes media-first, privacy-first, non-goals
  et ordre des passes futures.
- Ajout de primitives marketing premium partagees dans
  `components/premium/premium-marketing.tsx`.
- Rebuild de la landing `/` : hero Director Console, workflows, section UGC/product,
  post-generation studio, curation/privacy copy. Scope public UI-only.

## 2026-06-10 - Codex - T-1105 create flow premium polish
- Polish UI-only de `/create/[mode]` : fond warm-neutral, header `Production brief`,
  métriques plan/format/scènes, formulaire encadré premium, rail assets plus clair.
- Director Console transformée en surface sombre media-led cohérente avec la landing ;
  panel AI Director ouvert harmonisé au nouveau langage visuel.
- Aucun changement de submit, payload `POST /api/jobs`, routes, DB, provider routing ou
  state machine.

## 2026-06-10 - Codex - T-1106 job studio premium polish
- Polish UI-only de `/jobs/[id]` : fond warm-neutral, video principale en surface
  media-led sombre, bloc `Post-generation studio`, actions download/share/reference
  harmonisees et rail desktop plus editorial.
- Cartes Status/Production nettoyees ; labels modeles passes par
  `cleanModelName(getEngineDisplayName(...))` pour rester provider-neutral.
- Aucun changement handler, route, API, DB, retry, duplicate, save-look, scene panel ou
  Social Pack.

## 2026-06-10 - Codex - T-1107/T-1108 secondary workspace premium pass
- Polish UI-only de `/projects`, `/library`, `/analytics` et `/schedule` :
  fond warm-neutral, headers editoriaux, surfaces blanches, tabs/filtres plus sobres,
  cards et CTA harmonises avec landing/create/job.
- Analytics nettoie les noms modeles via `cleanModelName(getEngineDisplayName(...))`.
- Aucun changement requetes Supabase, endpoints, drag/drop schedule, actions projets,
  liens library, analytics API ou logique metier.

## 2026-06-10 - Codex - T-1104 home command center V2
- Polish UI-only de `/home` : fond warm-neutral, hero workspace blanc, CTA neutre,
  production pulse, pipeline, starters et recent projects alignes avec l'Axe 11.
- Aucun changement requete Supabase, navigation, auth, routes ou logique metier.

## 2026-06-10 - Codex - T-1109 public secondary pages premium pass
- Polish UI/copy-only de `/pricing`, `/about` et `/technology` pour les aligner
  avec la direction Axe 11 : warm-neutral, surfaces editoriales, CTA sobres,
  langage studio/Director plutot que template SaaS ou page stack.
- Confidentialite : textes publics provider-neutral ; `/technology` ne liste plus
  les providers/infra/modeles internes et parle de capacites/orchestration.
- Pricing conserve le flux checkout existant via `/api/stripe/checkout` ; aucune
  route/API/DB/auth/Stripe modifiee.
- Diagnostic Vercel : le commit `d6b4647` (signale en erreur cote Vercel) build
  correctement en local ; si Vercel echoue encore, recuperer les logs exacts.

## 2026-06-10 - Codex - T-1110 public utility pages premium pass
- Polish UI/copy-only de `/login`, `/generate`, `/blog`, `/blog/[slug]`,
  `/privacy`, `/terms` et `/help/verified-face-id` pour terminer l'homogeneite
  publique Axe 11.
- Login conserve les appels Supabase auth existants ; `/generate` conserve le
  POST `/api/jobs` existant, avec une orientation plus claire vers la Director Console.
- Blog/legal/help rendus provider-neutral : suppression des noms infra/providers
  visibles dans les articles, privacy/terms et aide verified face ID.
- Aucun changement route/API/DB/auth/generation/checkout.

## 2026-06-10 - Codex - T-1111 public premium E2E smoke QA
- Browser plugin indisponible dans cette session (`windows sandbox failed`) ;
  fallback Playwright local utilise sur `http://localhost:3002`.
- Mise a jour du smoke E2E : login accepte le nouveau CTA `Enter studio` et un
  test parcourt les pages publiques premium (`pricing/about/technology/blog/
  privacy/terms/help/generate`) en verifiant headlines + absence de noms
  providers visibles.
- Validation : Playwright 4/4, Vitest 399/399, tsc clean, lint clean.

## 2026-06-10 — Claude (Haiku 4.5) — T-802 + T-803 Lip-sync reuse end-to-end
- Fait : Feature end-to-end T-802 + T-803 en cascade (affordance UX + costing transparency).
- T-802 : Button "Reuse with new voice" sur page job (HeyGen Avatar Shots only)
  - Affiche après sauvegarde Look, navigue `/create/avatar?look_id={id}`
  - Capture `look.id` retourné par `POST /api/looks`, stocke dans `savedLookId` state
- T-803 : Cost estimation + display réactif
  - Nouveau `lib/lipsync-cost.ts` : `estimateLipsyncCost(scriptLength, mode, duration)`
  - Estime TTS (~0.01 cr/100 chars) + lip-sync (speed 2cr/s, precision 5cr/s)
  - Display `/create/avatar` : "X credits (~Y% of full video)" avec breakdown
  - Recalcule réactivement lors édition script ou changement mode
  - Nouveau `lib/__tests__/lipsync-cost.test.ts` : 6 unit tests (heuristiques, cas limites)
- Fichiers : `app/jobs/[id]/page.tsx`, `app/(workspace)/create/avatar/page.tsx`,
  `lib/lipsync-cost.ts`, `lib/__tests__/lipsync-cost.test.ts`
- Validation : tsc ✓, lint ✓, tests 408/408 ✓
- Commit : 6fd7e5c

## 2026-06-10 — Claude (Haiku 4.5) — T-801 Audit & Spec : Lip-sync existing video
- Fait : Audit complet docs-only de la feature lip-sync/reuse Look, sans runtime code.
  Examen des fichiers clés : `app/(workspace)/create/avatar/page.tsx` (Reuse Look UI),
  `lib/saved-look-payload.ts` (validation payload), `app/api/looks/route.ts`
  (save/list/delete), `app/api/jobs/route.ts` (look_id branch, lip-sync workflow),
  `lib/heygen-client.ts` (generateSpeech, createLipsync helpers).
- Livraison : `docs/product/lipsync-existing-video-spec.md` (~1400 lignes)
  - État ✅ implémenté : Save Look (`POST /api/looks`), Reuse Look (`/create/avatar`),
    TTS + lip-sync workflow (`POST /api/jobs` avec look_id), HeyGen helpers working
  - Limitations V1 ⚠️ : UX affordance ("Reuse with new voice" button manquante),
    costing non transparent, Library page inexistante
  - Out of scope V1 ❌ : arbitrary video lip-sync, ElevenLabs TTS, editing lip-sync results
  - Workflow synthèse : User complète Avatar Shots job → "Save as Look" → R2 persist
    → "Reuse with new voice" → nouveau script+voix → `generateSpeech()` + `createLipsync()`
    → lip-sync-only job (~5–20% coût vs full video)
  - Décisions : V1 = HeyGen Avatar Shots + HeyGen native TTS (cloned voices existantes) ;
    V2 = abstraction voice_provider pour ElevenLabs/open-source TTS
  - Open questions résolues : spec costing model, error handling, security/privacy
  - Appendix : API examples, testing strategy, rollout phases (V1/V2/V3)
- Mise à jour docs : `agent/tasks.md` ajout Axe 8 (T-801 done, T-802 affordance UI,
  T-803 costing transparency, T-804–T-805 V2 futures)
- Validation : spec review-ready, docs conf orme YAML/Markdown, aucun breaking change,
  tests 399/399 passing, tsc clean, lint clean

## 2026-06-10 — Codex — T-901 Favorites V1
- Fait : ajout d'un favori utilisateur par job vidéo, sans migration DB.
- Données : stockage dans `jobs.app_state.favorite`, avec helper pur
  `lib/job-favorite.ts` pour lire/écrire le flag sans écraser l'état existant.
- API : `PATCH /api/jobs/[id]` accepte `{ favorite: boolean }`, vérifie
  l'authentification + ownership, et ne modifie pas `updated_at`.
- UI :
  - bouton `Favorite/Favorited` sur la page job ;
  - filtre + badge `Favorites` dans Library ;
  - filtre + badge `Favorites` dans Projects.
- Tests : `lib/__tests__/job-favorite.test.ts` couvre les cas app_state true/false,
  préservation d'état et valeurs invalides.
