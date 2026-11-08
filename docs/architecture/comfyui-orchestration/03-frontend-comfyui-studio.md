# 3. Réutilisation du frontend ComfyUI (mode Studio)

## 3.1 Ce que l'on sait du frontend (`verified-code` / `verified-docs`)

- ComfyUI v0.42.0 embarque son frontend sous forme de paquet pip figé : `comfyui-frontend-package==1.55.18`
  (`requirements.txt` du tag). Le backend le sert sur `/`. On peut forcer une version (`--front-end-version`) ou un
  dossier (`--front-end-root`).
- Le frontend est un projet séparé, `Comfy-Org/ComfyUI_frontend`, sous **GPL-3.0**. Le backend ComfyUI est aussi
  sous **GPL-3.0** (annexe A).
- Le frontend gère tout ce que le Studio doit faire : édition du graphe, sous-graphes, widgets, exécution,
  aperçus, et export au **format API** (« Export (API) »). Le format UI (nodes + liens + sous-graphes, nodes
  virtuels comme `SetNode`/`GetNode`, nodes d'interface rgthree) n'est **pas** exécutable tel quel par
  `POST /prompt` : seule l'exportation par le frontend le convertit (`inferred` à partir des workflows de la
  communauté inspectés, qui contiennent ces nodes virtuels).
- Le backend expose `--multi-user` (stockage par utilisateur), `--enable-cors-header`, TLS, et une API
  `/object_info` qui décrit chaque node (entrées, types, plages, valeurs autorisées).

## 3.2 Options étudiées

| Option | Description | Coût de dev | Licence | Verdict |
|---|---|---|---|---|
| A. Éditeur natif servi par ComfyUI, ouvert dans un nouvel onglet | Le conteneur Studio sert son propre frontend. AlphoGen ne fait que l'authentification et l'import/export | Faible | Usage interne : aucune transmission à des tiers. Pour un Studio Pro, transmission à des clients → obligations GPL sur ce composant (sources correspondantes, notices, inventaire exact). Le servir séparément est une **précaution**, pas une garantie juridique (`inferred`, avis juridique avant diffusion) | **Retenu** |
| B. Intégrer le paquet frontend dans l'app Next.js | Importer et monter les composants Vue du frontend dans React | Élevé, fragile (Vue dans React, état global, mises à jour) | Risque de former une œuvre combinée GPL avec le code AlphoGen | Écarté |
| C. Réécrire un éditeur de graphes (React Flow, etc.) | Éditeur maison sur la base `/object_info` | Très élevé, réinvente ComfyUI | — | Écarté (contraire au principe directeur) |
| D. Convertisseur maison format UI → format API | Pour importer des workflows sans ouvrir le Studio | Moyen, et casse à chaque évolution du frontend (sous-graphes, nodes virtuels) | — | Écarté : on passe par l'export du frontend natif |

## 3.3 Studio admin (V1)

**Hypothèse à lever tôt** (I8) : ComfyUI démarre en `--cpu` avec les packs du runtime et sert `/object_info` et le
frontend sans GPU. Certains packs chargent des dépendances GPU à l'import. Vérification en **étape 1** (CPU, sans
génération, sur autorisation), pas après plusieurs phases.

```
Admin ── /admin/workflows/studio ── « Ouvrir le Studio »
   │ POST /api/admin/comfy/studio-session  → requireAdmin (contrôle serveur, app/api/admin/middleware.ts)
   │   → jeton signé à usage unique, validité 60 s, lié à l'admin et au runtime
   ▼
Modal « alphogenai-comfy » : STUDIO (CPU, web_server), runtime choisi
   - proxy d'authentification DEVANT ComfyUI (ComfyUI n'écoute que sur 127.0.0.1)
   - 1re requête : échange du jeton contre un cookie de session HttpOnly, Secure, SameSite=Strict, 30 min,
     puis redirection vers une URL SANS jeton
   - le proxy vérifie la session sur TOUTES les routes HTTP et sur la connexion WebSocket /ws
   - routes d'exécution REFUSÉES par le proxy : POST /prompt, /queue, /interrupt, /api/jobs*, /upload/*,
     /free, /history (écriture) → le Studio édite, il n'exécute pas
   - pas de ComfyUI-Manager, nodes d'API désactivés, modèles en lecture seule, aucun secret métier
   - arrêt après 10 min d'inactivité ; un seul conteneur Studio à la fois
   │ « Exporter vers AlphoGen » : export natif du graphe API (+ graphe UI) par l'admin
   ▼
POST /api/admin/comfy/templates/import (requireAdmin)
   - validation (class_type ⊆ liste blanche du runtime, modèles ⊆ catalogue, licences connues)
   - capture de /object_info des nodes utilisés → object_info_snapshot
   - diff avec la version précédente ; création d'une version « draft » ; manifeste à compléter (04)
```

Tester un graphe : bouton « Tester dans AlphoGen », qui crée un **run admin normal** (admission, budget,
courtier, exécuteur GPU). Même chemin que la production : vraie mesure de coût et de compatibilité, et aucune
exécution qui contournerait `/api/jobs`.

## 3.4 Studio Pro (perspective, sans impact sur le schéma V1)

| Exigence | Pourquoi | Comment |
|---|---|---|
| Conteneur par utilisateur | Un ComfyUI partagé mélange fichiers, historique et file d'attente | Classe Modal paramétrée par `user_id`, aucune réutilisation entre utilisateurs |
| Liste blanche courte | Un client ne doit pas pouvoir charger un node qui lit le disque ou appelle le réseau | Runtime `studio-pro@N` dédié, `--disabled-nodes-config`, validation serveur au moment de l'exécution |
| Aucune exécution dans le Studio | La sécurité ne peut pas dépendre du frontend | L'exécution passe toujours par `/api/jobs` → validateur → runner. Le Studio Pro n'a que la vue édition |
| Modèles imposés | Licences et coûts | Pas d'upload de modèle, seulement le catalogue du runtime + les LoRA de l'utilisateur (phase entraînement) |
| Conformité GPL | Le frontend est redistribué à des clients | Lien vers le code source exact de la version servie (et de nos éventuelles modifications) ; ne pas modifier le frontend si possible |
| Noms de fournisseurs | Les nodes portent des noms techniques | Acceptable dans un outil expert, sauf les nodes partenaires (désactivés). À valider produit |

## 3.5 Ce que le frontend AlphoGen ne fait pas

- Il ne dessine pas de graphe et ne modifie pas de liens.
- Il ne lit pas le format UI.
- Il ne connaît pas les `class_type` : il ne manipule que les clés du manifeste.
- Il ne fait jamais foi pour la sécurité.
