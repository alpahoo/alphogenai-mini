# AGENTS.md — Règles communes de coordination

Ce dépôt est travaillé par **plusieurs agents** (Claude Code, Codex local, ChatGPT)
en coordination avec l'équipe humaine (Paul + CTO). Ce fichier fixe les **règles
partagées**. Lis-le avant toute session.

## Fichiers de coordination (à la racine + `agent/`)

| Fichier | Rôle |
|---|---|
| `AGENTS.md` | Ce fichier — règles communes. |
| `agent/tasks.md` | Backlog partagé (objectif, fichiers probables, risques, critères de validation). |
| `agent/log.md` | Journal chronologique des actions (qui/quoi/tests/résultat/next). |
| `agent/review.md` | Points de review, risques, décisions ouvertes. |

## Sources de vérité (ordre de priorité)

1. **`HANDOVER.md`** — état **actuel** du système (source de vérité courante).
2. Le **code + migrations** (`supabase/migrations/`, `app/`, `lib/`).
3. `CLAUDE.md` et `docs/architecture/future-proof-notes.md` — utiles pour les
   **garde-fous** et le **pourquoi historique**, mais **datés (2026-05-11)** et
   antérieurs au virage BytePlus/HeyGen/composer. En cas de contradiction avec
   `HANDOVER.md` ou le code, **`HANDOVER.md` gagne** — et on note la divergence
   dans `agent/review.md`.

## Rôles des agents

Trois agents collaborent. Chacun a un périmètre. Le **handoff se fait par les
fichiers `agent/*`** (tasks → log → review), jamais par mémoire implicite.

### Claude Code (Anthropic) — *implémentation & intégration*
- Accès complet au repo (lecture/écriture), exécution de `npm test` / `tsc` /
  `build`, Git (commit + push → déploiement Vercel auto sur `main`).
- Accès Supabase MCP (lecture DB, migrations **avec validation** — protocole #4),
  Vercel MCP (état des déploiements).
- **Responsable de** : features multi-fichiers, refactors, debugging end-to-end,
  migrations DB (additives, validées), mise à jour des fichiers `agent/*`.
- Crée une entrée `tasks.md` avant, une entrée `log.md` après, signale les
  risques dans `review.md`.

### Codex local (OpenAI, CLI local) — *exécution ciblée & tests*
- Accès au code local + shell ; pas d'accès MCP DB/Vercel ni de secrets prod.
- **Responsable de** : tâches bien cadrées issues de `tasks.md` (composants UI
  isolés, helpers `lib/`, écriture de tests Vitest), itérations rapides sur des
  fichiers précis.
- **Ne fait pas** : migrations DB, modifs Stripe/auth/Modal/webhooks/config
  critiques. Si nécessaire → ouvrir un point dans `review.md` et laisser à Claude.
- Met à jour `log.md` après chaque session ; respecte le protocole de validation.

### ChatGPT (OpenAI, conversationnel) — *architecture, review & produit*
- Pas d'écriture directe sur le repo (propose des diffs / specs à appliquer).
- **Responsable de** : design d'architecture, revue de PR/diffs, décisions
  produit (roadmap Director Console), rédaction/relecture de docs, arbitrage des
  risques listés dans `review.md`.
- Sortie attendue : entrées dans `tasks.md` (specs cadrées) et décisions dans
  `review.md` que Claude/Codex exécutent ensuite.

### Règle de non-collision
- Une tâche `in_progress` dans `tasks.md` **appartient à un seul agent à la fois**
  (champ « owner »). Ne pas prendre une tâche déjà `in_progress` par un autre.
- Toujours `git pull` avant de commencer ; commits petits pour limiter les conflits.

## Protocole (obligatoire)

1. **Avant** un changement important : ajouter une entrée dans `agent/tasks.md`
   (objectif · fichiers probables · risques · critères de validation).
2. **Après** chaque session : entrée dans `agent/log.md` (fait · fichiers
   modifiés · tests lancés · résultat · prochaine étape).
3. Tout **risque produit/technique** → `agent/review.md` (ne pas le laisser implicite).
4. **Ne pas modifier sans le noter dans `agent/review.md` ET attendre validation** :
   Stripe, auth / service-role, pipeline Modal, webhooks, migrations DB, fichiers
   de config critiques (`next.config.ts`, `tsconfig.json`, `package.json`,
   `.github/workflows/`). Voir aussi la liste « ne pas toucher » de
   `future-proof-notes.md` §2.1.
5. Garder les changements **petits et vérifiables** (idéal : < 3 fichiers ou
   < 100 LOC par commit logique).
6. Après chaque changement significatif, lancer **au minimum** :
   ```bash
   npm test
   npx tsc --noEmit -p tsconfig.json
   npm run build
   ```
7. Si un test/build échoue : **s'arrêter**, documenter l'échec dans
   `agent/log.md`, proposer le fix (ne pas empiler par-dessus un build cassé).
8. En cas de doute doc vs code : **le code + `HANDOVER.md` priment**.

## Garde-fous sécurité (rappel, détails dans `future-proof-notes.md` §2.4)

- Jamais exposer `SUPABASE_SERVICE_ROLE_KEY` côté client.
- Jamais committer de valeurs d'env / secrets.
- Jamais loguer secrets / tokens déchiffrés.
- Toujours valider les inputs API côté serveur + plan gate.
- Jamais `--no-verify`, jamais force-push sur `main`.

## Git

- Branche prod : `main`. Commits : `feat:` / `fix:` / `chore:` / `docs:` /
  `refactor:` / `test:`.
- Tag de co-auteur pour les commits assistés IA :
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

## Validation rapide (health check)

```bash
npm run dev        # next dev --turbopack
npm test           # vitest (220+ tests)
npx tsc --noEmit -p tsconfig.json
npm run build      # passe sans secrets (/gallery dégrade proprement)
npm run lint       # next lint → doit rester "no warnings or errors"
```
