# MuAPI Ecosystem Implementation Handbook

Status: living implementation reference  
Owner: AlphoGenAI product and engineering  
Last reviewed: 2026-08-01

## 1. Purpose

This handbook defines how AlphoGenAI may reuse MuAPI Apps, open-source SaaS templates,
Skills, Workflows, and Academy material without replacing AlphoGenAI or rebuilding
capabilities that already exist in the product.

The rule is simple:

> Reuse the smallest proven external brick that materially shortens delivery, while
> keeping AlphoGenAI's product experience, identity, data model, billing, storage,
> jobs, and provider independence.

This is not a mandate to use MuAPI for every module. It is a repeatable evaluation
method and a source map that prevents assumptions from becoming implementation facts.

## 2. Non-negotiable principles

1. **Outcome first.** Users select a result, never a provider or model.
2. **Inspect AlphoGenAI first.** Existing ingestion, jobs, storage, security, billing,
   UI, and media contracts are reused before external code is considered.
3. **Reuse selectively.** Import workflows, prompts, schemas, or UI patterns; do not
   transplant an entire SaaS shell merely because it runs.
4. **No provider-first abstraction.** Implement one real product slice first. Derive
   the smallest reusable contract from it, and generalize only after a second module
   proves the common surface.
5. **No unverified capability claims.** A README, marketing page, Skill, API schema,
   source file, and successful production run are different levels of evidence.
6. **One meaningful QA.** Prefer contract tests plus one capped end-to-end generation
   over many repetitive paid experiments.
7. **Reversible integration.** Provider-specific identifiers and payloads stay behind
   an adapter boundary. Durable AlphoGenAI records remain provider-neutral.
8. **Risk is documented, not silently removed.** For legal, consent, deepfake, health,
   minors, or IP concerns: record the risk, safeguards, and recommendation; the product
   owner makes the final decision.

## 3. Required investigation order

Every new module follows this order before runtime code:

1. **AlphoGenAI code and Decision Books**
   - Find existing routes, contracts, tables, storage, job states, UI controls, and QA.
   - State exactly what already exists and what gap remains.
2. **Ready-made App source**
   - Read the actual repository files, not only the README.
   - Extract product interaction patterns and useful contracts.
   - Exclude duplicate auth, billing, ORM, database, storage, and branding shells.
3. **Skills and recipes**
   - Read the full pinned `SKILL.md`.
   - Extract inputs, ordered outputs, prompts, validation rules, and fallback logic.
   - Treat model names as suggestions until checked against current schemas.
4. **Workflows and official API documentation**
   - Verify endpoint availability, async semantics, webhooks, costs, and output shape.
   - Record whether the workflow is discoverable, executable, or merely announced.
5. **Academy and commercial material**
   - Extract intake briefs, quality checklists, packaging, and batch operations.
   - Do not copy unverifiable revenue claims into product copy.

Only then may implementation begin.

## 4. Evidence and confidence labels

Every external fact used in a ticket must carry one of these labels:

| Label | Meaning | May drive production code? |
|---|---|---|
| `verified-code` | Read in a pinned source file | Yes, after local adaptation |
| `verified-docs` | Present in current official documentation | Yes, with contract tests |
| `verified-runtime` | Successfully exercised in a capped real run | Yes |
| `announced` | Marketing or roadmap claim only | No |
| `inferred` | Reasonable conclusion from related evidence | No, validate first |
| `unknown` | Not found or contradictory | No |

Source files should be pinned by commit or blob SHA whenever possible. Current model
IDs, pricing, limits, and terms must be rechecked immediately before a paid QA.

## 5. Source map

### 5.1 AlphoGenAI sources

| Source | What it proves | Confidence |
|---|---|---|
| `lib/ugc-shot-provider.ts` | Provider-neutral async UGC contracts already exist | verified-code |
| `lib/ugc-shot-pack.ts` | Three-shot roles and product-source constraints exist | verified-code |
| `lib/ugc-native-ad.ts` | Creator-led product ad contract and fidelity requirements exist | verified-code |
| `lib/ugc-capabilities.ts` | Engine capability/caution metadata exists | verified-code |
| `app/(workspace)/create/url/page.tsx` | URL intake, product media, presenter, language, voice, format and duration UI exist | verified-code |
| `docs/product/product-ad-ugc-shot-pipeline.md` | Native/directed UGC findings and failed product-fidelity lessons | verified-code |
| `docs/product/ugc-generation-contract.md` | Current shipped UGC baseline and reference semantics | verified-code |

### 5.2 Ready-made Amazon Product Studio

Repository: `SamurAIGPT/amazon-product-studio` (MIT).

| Source | Useful brick | Do not import |
|---|---|---|
| `src/app/page.js` | Up to 14 references, drag/drop, seven scene presets, aspect ratios, history, polling, download | Whole visual shell and branding |
| `src/app/api/creations/route.js` | Validation, async creation, status/history pattern | NextAuth, Prisma credits, BYO provider key |
| `src/app/api/upload/route.js` | Multipart upload flow | Provider CDN coupling and key logging |
| `src/app/api/webhooks/ai/route.js` | Async completion pattern | Unverified webhook trust model |
| `src/lib/services/ai.js` | Generation/poll service separation | MuAPI-specific durable records |
| `prisma/schema.prisma` | Minimal creation fields | Duplicate User/Auth/Session schema |

Notable source caution: the upload route logs environment-key names and a key prefix.
That pattern must never be copied.

### 5.3 Generative Media Skills

Pinned commit: `72be0ec3e2aad7503e1d89a7ffa925d8d3a272b1` (MIT repository).

| Skill | Reusable value | Caveat |
|---|---|---|
| `amazon-product-listing` | Four-output pack: hero, lifestyle, infographic, detail | Generated typography should be replaced by deterministic AlphoGen rendering |
| `multi-angle-shots` | Front, 3/4, back, top-down, hero roles and category notes | Single reference cannot prove unseen back/side geometry |
| `multi-angle-reshoot` | Camera vocabulary and identity consistency instructions | Better suited to creative reshoots than exact catalog truth |
| `product-campaign` | Cohesive hero, square, short video, story and banner pack | Too broad for the first Amazon slice |
| `product-video-ad-maker` | Approved still before animation | Product fidelity must be gated before video spend |

The Skills are LLM-orchestrated recipes, not production guarantees. Their hard-coded
model names must be resolved against current official schemas at execution time.

### 5.4 MuAPI official documentation

| Source | Verified capability | Confidence |
|---|---|---|
| `/docs/specialized-apps` | `ai-product-shot` and `ai-product-photography`; async prediction pattern | verified-docs |
| `/docs/agent-skills` | Schema-driven scripts, async mode, upload support, public recipe discovery | verified-docs |
| `/docs/workflows` | Multi-node workflows, API execution, webhook, CLI discovery | verified-docs |
| `/docs/design-agent-api` | Direct named skill execution including `ugc-ads-workflow` | verified-docs |
| `/providers/muapi` | Product photography listing and current public unit price | verified-docs; recheck before spend |

Commercial caveat: current Terms of Service include language concerning competing
services. Legal/commercial compatibility with AlphoGenAI must be confirmed before a
public paid module relies on MuAPI at scale. Open-source MIT code and recipe concepts
remain separately assessable.

### 5.5 AI Creator Academy

Repository: `Anil-matcha/ai-creator-academy` (MIT).

| Source | Reusable value | Confidence |
|---|---|---|
| `ROADMAP.md` | Track 7 and four product-photography modules are marked live | verified-code |
| `tracks/07-ai-product-photography/README.md` | Briefing, conversion audit, productized service and batch catalog structure | verified-code |
| `LESSON_TEMPLATE.md` | Problem-to-result documentation and honest tool comparison discipline | verified-code |

Academy content informs onboarding, presets, QA, and packaging. It does not execute
runtime media generation.

### 5.6 Priority module coverage map

This is a navigation map, not proof that every module is production-ready. Each row
must receive a targeted preparation sheet before implementation.

| AlphoGen module | App/template lead | Skill/recipe lead | Existing AlphoGen anchor | Current decision |
|---|---|---|---|---|
| Amazon / Product Photography | `amazon-product-studio` | `amazon-product-listing`, `multi-angle-shots` | URL ingestion, product references, jobs, R2 | Adapt first |
| Product Advertising | Open AI UGC and product app patterns | `product-video-ad-maker`, `product-campaign` | Product Ad, UGC contracts, directed shots | Complete/stabilize existing |
| UGC | Open AI UGC | `ugc-ads-workflow` | Native/directed UGC pipeline | Adapt recipes only |
| Clipping / Shorts | AI YouTube Shorts patterns | clipping/repurposing recipes to verify | Existing editorial/video jobs to audit | Targeted audit next |
| Headshot | Headshot app family in ecosystem audit | portrait/headshot recipes to verify | Persona/image upload patterns | Good second image module |
| Social Campaign | Campaign app patterns | `product-campaign` | Social export and scheduling surfaces | Compose after Amazon |
| Podcast Video | Podcast app patterns | voice/lipsync recipes are partial | Mature podcast dialogue, TTS, render and personas | Complement selectively |
| Voice | Voicebox/local voice patterns | audio/TTS/lipsync primitives | Voice Lab, catalog, normalization | Benchmark/adapter only |
| Storyboard | Workflow templates | storyboard public recipe | Scene Editor and research storyboard | Integrate recipe concepts |
| Thumbnail | Design app patterns | thumbnail recipe to verify | Image/media jobs | Small later slice |
| Fashion | Fashion try-on app | `fashion-try-on` named skill | Product/person reference semantics | Adapt with consent guards |
| Real Estate | Virtual staging app | staging workflow/recipe to verify | Image ingestion/jobs/storage | Adapt after core commerce |

Rows marked "to verify" must not be turned into endpoint names or model assumptions.
Their exact source files and current contracts are collected during that module's
preparation step.

## 6. Reuse decision matrix

| External brick | Default decision | Why |
|---|---|---|
| AlphoGen-equivalent auth/billing/database/storage | Ignore | Already owned and integrated |
| App UX interaction that closes a local gap | Adapt | Fast product gain without shell duplication |
| Skill input/output recipe | Adapt | Strong module specification starting point |
| Workflow graph | Test, then adapt | Useful only after exact contract and cost validation |
| Provider API | Optional adapter | Must remain replaceable and commercially acceptable |
| Academy checklist/template | Integrate into UX/docs | Low risk, high clarity |
| Marketing copy or income claims | Do not reuse directly | Requires independent evidence |

## 7. Module implementation template

Before coding a module, create a preparation sheet containing:

1. User outcome and delivered files.
2. Existing AlphoGen capabilities reused.
3. Exact product gap.
4. Pinned App files read.
5. Pinned Skills read.
6. Official workflow/API claims verified.
7. Academy intake and QA material reused.
8. Minimal product contract.
9. Provider-neutral job/result semantics.
10. Risks, safeguards, and recommendation.
11. Test budget and stop conditions.
12. PASS/FAIL acceptance criteria.

## 8. Testing discipline

For each vertical slice:

1. Pure contract/schema tests.
2. Route tests for auth, ownership, validation, idempotence, and provider error hiding.
3. Typecheck and production build.
4. One capped real generation on a representative asset.
5. Product QA against written acceptance criteria.
6. Stop after PASS or after the first decisive failure; diagnose before spending again.

Do not rerun a provider merely to collect another visually similar sample.

## 9. Priority sequence

1. **Amazon / Product Photography**: first vertical slice and source of the minimal
   reusable image-pack contract.
2. **Headshot or Thumbnail**: second module used to validate and generalize only the
   common orchestration surface.
3. **Campaign Pack**: compose already-proven image/video outputs.
4. Remaining catalog modules: each begins with its own preparation sheet.

This sequence does not alter the long-term product catalog. It is the shortest path to
real reuse without a premature generic platform.
