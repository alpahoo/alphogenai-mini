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
| A. Éditeur natif servi par ComfyUI, ouvert dans un nouvel onglet ou une iframe | Le conteneur Studio sert son propre frontend. AlphoGen ne fait que l'authentification et l'import/export | Faible | Usage interne : aucune redistribution à des tiers. Pour un Studio Pro, redistribution à des clients → obligations GPL sur **ce** composant (fourniture du code source, y compris des modifications), sans effet sur le code Next.js tant qu'il reste un programme séparé (`inferred`, avis juridique recommandé) | **Retenu** |
| B. Intégrer le paquet frontend dans l'app Next.js | Importer et monter les composants Vue du frontend dans React | Élevé, fragile (Vue dans React, état global, mises à jour) | Risque de former une œuvre combinée GPL avec le code AlphoGen | Écarté |
| C. Réécrire un éditeur de graphes (React Flow, etc.) | Éditeur maison sur la base `/object_info` | Très élevé, réinvente ComfyUI | — | Écarté (contraire au principe directeur) |
| D. Convertisseur maison format UI → format API | Pour importer des workflows sans ouvrir le Studio | Moyen, et casse à chaque évolution du frontend (sous-graphes, nodes virtuels) | — | Écarté : on passe par l'export du frontend natif |

## 3.3 Studio admin (V1)

```
Admin ── /admin/workflows/studio ── bouton « Ouvrir le Studio »
          │ POST /api/admin/comfy/studio-session (isAdminEmail) → URL signée courte durée
          ▼
Modal « alphogenai-comfy » : StudioServer (CPU, web_server)
   - ComfyUI + frontend natif, runtime choisi (h3-video@1, moss-image@1)
   - démarre en --cpu : l'édition et /object_info ne demandent pas de GPU (`inferred`, à confirmer en phase 5)
   - vérifie le jeton signé à chaque requête (middleware devant ComfyUI), cookie de session
   - arrêt après 10 min d'inactivité ; jamais plus d'un conteneur Studio
   - modèles visibles en lecture seule (volume monté en lecture seule si l'option est disponible)
          │ « Exporter vers AlphoGen » : l'admin exporte le graphe API (+ graphe UI)
          ▼
POST /api/admin/comfy/templates/import
   - validation (nodes ⊆ liste blanche du runtime, modèles ⊆ catalogue, pas de chemin)
   - capture de /object_info pour les nodes utilisés → object_info_snapshot
   - diff avec la version précédente (nodes ajoutés, retirés, paramètres changés)
   - création d'une version « draft » ; l'admin complète le manifeste (cf. 04)
```

Tester un graphe depuis le Studio : le bouton d'exécution natif du frontend lancerait le calcul sur le conteneur
CPU. Deux solutions, à trancher en phase 5 (`unknown`) :

1. Studio sur GPU à la demande (simple, plus cher : un H100 inactif pendant l'édition).
2. **Recommandé** : Studio en CPU pour l'édition, et bouton « Tester dans AlphoGen » qui crée un run admin
   normal sur le runner GPU (même chemin que la production, donc vraie mesure de coût et de compatibilité).

## 3.4 Studio Pro (plus tard, prévu dans la conception)

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
