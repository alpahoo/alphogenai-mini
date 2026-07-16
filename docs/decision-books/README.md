# Decision Books — état des workflows AlphoGenAI

Chaque workflow produit est benchmarké puis figé dans un **Capability Decision Book**
(un fichier par workflow). Ordre de traitement : un workflow à la fois, on ne passe au
suivant qu'une fois le précédent gelé.

## État

| Workflow | Statut | Decision Book |
|---|---|---|
| **Podcast Premium** | ✅ **GELÉ** (V1 validée 15 juil. 2026) | [podcast-premium-v1.md](./podcast-premium-v1.md) |
| **URL → Video** | ✅ **GELÉ après hardening** (V1 validée en prod 16 juil. 2026 · Jogg, POC 80/100, job `75c17c27…` done · quick-wins P1 corrigés) | [**Decision Book V1**](./url-to-video-v1.md) · [benchmark](./url-to-video.md) · [POC/audit](./url-to-video-poc.md) · [intégration](./url-to-video-v1-integration.md) |
| **Product Ads** | ⏳ à venir | — |
| **Cinematic** (ex. Runway) | ⏳ à venir | — |
| **Avatar** (ex. HeyGen / Synthesia) | ⏳ à venir | — |
| **Editing / Video Enhancement** | 🔬 **Benchmark fait (7 acteurs, sources off.) · finalistes 🥇 Descript + 🥇 VEED, 🥉 réserve Riverside · pas de gagnant · POC à valider** | [**Decision Book**](./editing-video-enhancement.md) · [audit Descript](./editing-enhancement-descript-audit.md) |
| **Publication** | ⏳ **à benchmarker → Postiz** (open-source, self-hostable, API) | — |

## Légende

- ✅ **GELÉ** — décision prise, brique terminée & documentée, aucun nouveau dev sauf bug bloquant.
- 🔄 **Benchmark / En cours** — décision en préparation (benchmark, finalistes, POC).
- ⏳ **À venir** — pas encore démarré.

## Règles

- Un Decision Book = **capabilities + stratégie d'intégration**, sources officielles uniquement
  (marqueurs `[vérifié]` / `[reporté]` / **À VÉRIFIER**).
- On ne désigne un **gagnant** qu'après POC comparable entre finalistes.
- Un workflow **gelé** n'est plus modifié (voir son Decision Book pour rollback & P0).
