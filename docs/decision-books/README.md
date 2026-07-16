# Decision Books — état des workflows AlphoGenAI

Chaque workflow produit est benchmarké puis figé dans un **Capability Decision Book**
(un fichier par workflow). Ordre de traitement : un workflow à la fois, on ne passe au
suivant qu'une fois le précédent gelé.

## État

| Workflow | Statut | Decision Book |
|---|---|---|
| **Podcast Premium** | ✅ **GELÉ** (V1 validée 15 juil. 2026) | [podcast-premium-v1.md](./podcast-premium-v1.md) |
| **URL → Video** | ✅ **VALIDÉ** · ⚙️ **intégration codée, gel après validation prod** (Jogg, POC 80/100) | [**Decision Book V1**](./url-to-video-v1.md) · [benchmark](./url-to-video.md) · [POC/audit](./url-to-video-poc.md) · [intégration](./url-to-video-v1-integration.md) |
| **Product Ads** | ⏳ à venir | — |
| **Cinematic** (ex. Runway) | ⏳ à venir | — |
| **Avatar** (ex. HeyGen / Synthesia) | ⏳ à venir | — |
| **Editing / Enhancement** (V1.1) | 🔬 **Descript audité — clé testée live (lecture), API REST propre/async/webhook/sans watermark · GO pré-V1.1 · P0 = chiffrer le coût réel en crédits/action** | [audit Descript](./editing-enhancement-descript-audit.md) |
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
