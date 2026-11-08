# 7. Coûts Modal et optimisations

Aucune dépense n'a été faite pour ce dossier. Les chiffres « mesurés » viennent du labo H3 (2026-11-08) et du POC
ComfyUI produit (2026-10-20). Les prix unitaires sont à revérifier sur la page de prix Modal avant chaque phase.

## 7.1 Prix unitaires

| Ressource | Prix | Preuve |
|---|---|---|
| H100 | 3,95 $/h, soit 0,001097 $/s | `verified-docs` (relevé le 2026-10-20) ; utilisé pour les coûts du labo |
| RTX PRO 6000 | 3,03 $/h | `verified-docs` (2026-10-20) |
| L40S | ~1,95 $/h | `unknown`, à vérifier (candidat pour MOSS) |
| CPU + mémoire (Studio, dispatcher) | quelques centimes par heure pour 2 cœurs / 8 Go | `unknown`, à vérifier |
| Stockage des volumes | à vérifier | `unknown` |

## 7.2 Coût par run H3 (mesuré, 480x832, 5 s, int8 + turbo v4)

| Situation | Durée GPU | Coût |
|---|---|---|
| Conteneur chaud | ~22 s | ~0,024 $ |
| Démarrage à froid (ComfyUI 12 à 14 s + chargement des modèles) | ~50 s | ~0,055 $ |
| Sans turbo (20 steps), pour comparaison | ~90 s | ~0,099 $ |
| Post-traitement `audio_shift` (ffmpeg, copie de la vidéo) | < 2 s | négligeable (CPU du même conteneur) |

**Coût caché principal : la fenêtre d'inactivité.** Avec `scaledown_window = 180 s` (valeur du labo), chaque fin
de rafale coûte 180 s de H100, soit **~0,20 $**, c'est-à-dire plus que 8 runs chauds. Réglage recommandé en
production : 60 s au départ (~0,066 $ par fin de rafale), ajusté selon la fréquence réelle des runs.

## 7.3 Scénario mensuel indicatif

Hypothèse : 1 000 clips H3 de 5 s par mois, 30 % de démarrages à froid, 300 fins de rafale de 60 s.

| Poste | Calcul | Coût |
|---|---|---|
| Runs chauds | 700 × 0,024 $ | 16,80 $ |
| Runs à froid | 300 × 0,055 $ | 16,50 $ |
| Inactivité | 300 × 60 s × 0,001097 $ | 19,75 $ |
| **Total** | | **~53 $ / mois, soit ~0,053 $ par clip** |

Ordre de grandeur de comparaison (relevés de prix d'octobre 2026, à revérifier) : un clip Seedance 2.0 de 5 s coûte
~0,48 $ chez AtlasCloud et ~2,50 $ chez EvoLink. H3 sur Modal est donc d'environ un ordre de grandeur moins cher
par clip, avec une qualité et des capacités différentes (768p maximum).

## 7.4 Optimisations, par ordre d'intérêt

| # | Optimisation | Gain attendu | Effort |
|---|---|---|---|
| O1 | `scaledown_window` court (60 s) et `min_containers = 0` | Supprime l'essentiel du coût d'inactivité | Nul |
| O2 | Memory snapshots Modal pour le démarrage de ComfyUI (pattern documenté par Modal pour ComfyUI) | Démarrage serveur de 12-14 s à quelques secondes | Faible (`verified-docs`, à valider sur v0.42.0) |
| O3 | Modèles int8 (déjà retenus) | Chargement plus court, moins de mémoire | Fait |
| O4 | Turbo v4 8 steps (déjà retenu) | ~4x moins cher que 20 steps | Fait |
| O5 | GPU choisi par template (H100 pour H3, GPU moins cher à mesurer pour MOSS) | 30 à 50 % sur l'image | Faible (champ `gpu` du manifeste) |
| O6 | Cache des nodes de ComfyUI dans un conteneur chaud (l'encodage d'un prompt identique n'est pas recalculé) | Variantes de seed moins chères | Gratuit, à préserver : ne pas redémarrer ComfyUI entre deux runs d'un même runtime |
| O7 | Volume de modèles partagé entre runtimes (fichiers communs) | Moins de stockage et de téléchargements | Faible |
| O8 | Préchauffage aux heures de pointe (`min_containers = 1` sur une plage horaire) | Meilleure latence | Coûteux (~3,95 $/h par conteneur H100) : uniquement sur décision |
| O9 | Studio en CPU, tests via le runner GPU | Évite un H100 inactif pendant l'édition | Prévu (D7) |

## 7.5 Garde-fous de coût

- Plafond par template : `timeout_s`, `limits` (durée, pixels, steps), nombre de sorties.
- `max_containers` par runtime (1 au départ) : borne la dépense maximale par heure.
- Tableau de bord admin : coût réel par jour, par template, par utilisateur, temps à froid et à chaud, part de
  l'inactivité (estimée à partir des intervalles entre runs).
- Alerte (e-mail admin) si le coût journalier dépasse un seuil configuré, ou si l'écart estimé / réel dépasse 20 %.
- Aucune ressource payante lancée par ce chantier sans **autorisation explicite** du propriétaire. Plafond global
  de tests : 3,00 $ jusqu'à MOSS inclus (D10).
- Toute estimation présentée pour autorisation inclut **quatre postes** : démarrage à froid (dont le démarrage
  de ComfyUI), chargement des modèles (téléchargement vers le volume et chargement en mémoire GPU), calcul à
  chaud, et temps GPU inactif avant arrêt. Détail par phase dans 05.
