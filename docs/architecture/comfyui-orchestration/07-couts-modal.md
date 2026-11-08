# 7. Coûts Modal et optimisations

Révision 2 (2026-11-08), après revue Codex. Aucune dépense n'a été faite pour ce dossier.

## 7.1 Prix unitaires (modal.com/pricing, relevés le 2026-11-08, `verified-docs`)

| Ressource | Prix |
|---|---|
| H100 | 0,001097 $/s (3,95 $/h) |
| L40S | 0,000542 $/s (1,95 $/h) |
| L4 | 0,000222 $/s |
| CPU | 0,0000131 $/cœur physique/s (minimum 0,125 cœur par conteneur) |
| Mémoire | 0,00000222 $/Gio/s |
| CPU et mémoire non préemptibles | ×3 (0,00003942 $/cœur/s ; 0,00000667 $/Gio/s) |
| Volumes | 0,09 $/Gio/mois ; la page annonce 1 Tio/mois inclus (voir réserve ci-dessous) |
| Trafic sortant | 0,04 $/Gio (selon les franchises du plan) |
| Forfait Starter | 30 $ de calcul inclus par mois |

Un conteneur GPU facture son GPU **plus** son CPU et sa mémoire.

**Stockage : la franchise ne garantit pas un coût nul.** La page de prix annonce 1 Tio/mois inclus, mais :
la franchise dépend du plan et de ses conditions ; elle est partagée par **tous** les volumes de l'espace Modal
(`alphogenai-models`, `huggingface-cache`, `acestep-models`, `comfyui-models`, `h3-lab-models`, plus les nouveaux) ;
les copies en double d'un même modèle comptent ; le trafic sortant est facturé à part. Le stockage est donc un
poste **à mesurer** (taille totale des volumes relevée à chaque étape), pas un poste supposé gratuit.

## 7.2 Ce que les mesures du labo couvrent réellement

Correction (revue Codex, vérifiée dans `h3-lab/app.py`) : `start()` chronomètre à part le démarrage de ComfyUI
(12-14 s) ; `generate()` démarre son chronomètre juste avant `POST /prompt` et calcule `cost_usd = gen_s × prix GPU`.
Les chiffres du labo sont donc des **durées de génération converties en coût GPU**, pas un coût facturé.

| Poste | Mesuré au labo ? | Valeur utilisée |
|---|---|---|
| Démarrage du conteneur (image, montage du volume) | Non | ~20 s (`unknown`, à mesurer en étape 4) |
| Démarrage de ComfyUI | Oui, à part | 12-14 s |
| Chargement des modèles + premier calcul | Oui (« à froid ») | ~50 s |
| Calcul à chaud | Oui | ~22 s |
| Post-traitement `audio_shift` | Non (local) | < 2 s |
| CPU et mémoire du conteneur GPU | Non | mémoire supposée 64 Gio → +0,000142 $/s |
| Inactivité avant arrêt | Non | `scaledown_window` |
| Rapprochement avec la facture | Non | à faire en étape 4 |

## 7.3 Coût d'un run H3 isolé (480x832, 5 s) : **estimations**, selon la méthode de calcul

Aucun de ces chiffres n'est un coût facturé : ce sont des **estimations**. Le coût réel sera mesuré et rapproché de
la facture Modal à l'étape 4. Le tableau montre comment le chiffre change selon ce que l'on compte.

| Méthode | Ce qui est compté | Durée | Prix appliqué | Estimation |
|---|---|---|---|---|
| A. Labo (`cost_usd` de `h3-lab/app.py`) | génération seule, de `POST /prompt` à la fin | ~50 s | GPU seul | ~0,055 $ |
| B. A + démarrage ComfyUI | + 12-14 s mesurés à part par `start()` | ~63 s | GPU seul | ~0,069 $ |
| C. B + démarrage du conteneur + mémoire | + ~20 s (`unknown`) ; mémoire supposée 64 Gio | ~83 s | GPU + mémoire | ~0,103 $ |
| D. C + inactivité de 60 s | fenêtre `scaledown_window` = 60 s | ~143 s | GPU + mémoire | **~0,18 $** |
| E. C + inactivité de 180 s (valeur du labo) | `scaledown_window` = 180 s | ~263 s | GPU + mémoire | ~0,33 $ |
| Run chaud (pour comparaison) | génération seule, conteneur déjà démarré | ~22 s | GPU + mémoire | ~0,027 $ |

Hypothèses incertaines : démarrage du conteneur (~20 s, non mesuré), mémoire réservée (64 Gio, à dimensionner), CPU
du conteneur (non compté ici, faible), tarif préemptible. La méthode **D** sert de base aux demandes de budget,
parce qu'elle correspond à un run isolé avec la fenêtre d'inactivité recommandée. L'inactivité est le poste le plus
lourd pour un trafic faible.

## 7.4 Séparation des coûts et méthode d'allocation

| Catégorie | Contenu | Attribuée à |
|---|---|---|
| Coût de génération | durée entre la prise en charge du prompt par ComfyUI et la fin du post-traitement, × prix du conteneur | le run (`comfy_runs.gpu_seconds`, `cost_usd`) |
| Coût de conteneur | démarrage, chargement des modèles, inactivité | réparti au prorata des runs de la rafale (`container_seconds`) |
| Frais partagés | courtier, Studio, cron, stockage, trafic, modération | par période (jour), par runtime |

Le coût **par run** est une allocation. La précision vérifiée porte sur le **total d'une période** (écart < 10 % avec
la facture Modal), pas sur chaque run.

## 7.5 Scénario mensuel indicatif (H3)

Hypothèse : 1 000 clips de 5 s par mois, en 300 rafales.

| Poste | Calcul | Coût |
|---|---|---|
| Runs chauds | 700 × 0,027 $ | 18,90 $ |
| Premiers runs de rafale (démarrage + chargement) | 300 × 0,103 $ | 30,90 $ |
| Inactivité (60 s par rafale) | 300 × 60 s × 0,001239 $ | 22,30 $ |
| Courtier, cron, modération | à mesurer | quelques dollars |
| **Total** | | **~72 $ / mois + frais partagés, soit ~0,07 $ par clip** |

Ordre de grandeur de comparaison (relevés de prix d'octobre 2026, à revérifier) : un clip Seedance 2.0 de 5 s
coûte ~0,48 $ chez AtlasCloud et ~2,50 $ chez EvoLink. H3 sur Modal reste nettement moins cher par clip, avec une
qualité et des capacités différentes (768p maximum).

## 7.6 Studio

2 cœurs physiques + 8 Gio : 2 × 0,0000131 + 8 × 0,00000222 = 0,0000440 $/s, soit **~0,158 $/h** (préemptible). Si
le web server est facturé au tarif non préemptible : ~0,47 $/h (à vérifier). Arrêt après 10 min d'inactivité.

## 7.7 Optimisations (à mesurer, pas garanties)

| # | Optimisation | Effet attendu | Statut |
|---|---|---|---|
| O1 | `scaledown_window` court (60 s), `min_containers = 0` | réduit l'inactivité | à régler selon le trafic réel |
| O2 | Memory snapshots Modal (pattern documenté pour ComfyUI) | démarrage plus court | **hypothèse à mesurer** sur v0.42.0 et sur nos runtimes |
| O3 | Modèles int8 | chargement plus court | retenu |
| O4 | Turbo v4, 8 steps | ~4× moins de calcul que 20 steps | retenu |
| O5 | GPU par template (L40S candidat pour MOSS) | 30 à 50 % sur l'image | à mesurer aux limites autorisées, custom nodes et modération actifs |
| O6 | Cache des nodes ComfyUI dans un conteneur chaud | variantes de seed moins chères | seulement si la politique de réutilisation du runtime le permet (02 §2.7) |
| O7 | Mémoire du conteneur dimensionnée au plus juste | réduit le coût mémoire | à mesurer |
| O8 | Préchauffage (`min_containers = 1`) | latence | ~4,46 $/h par conteneur H100 : sur décision seulement |

## 7.8 Garde-fous de coût

- **Plafonds financiers** : périmètre, comptabilisation (réservation, règlement, libération, ajustement par
  rapprochement quotidien) et cinq mécanismes d'arrêt définis en 02 §2.5. Distincts des quotas utilisateurs et du
  budget de tests (`scope = 'tests'`).
- **Limite de dépense de l'espace Modal** en filet de sécurité. Elle couvre **tout l'espace**, production
  `alphogenai-v2` comprise : la placer au-dessus des besoins de la production, ou loger `alphogenai-comfy` dans un
  espace séparé (Q2).
- `max_containers` par runtime : borne le **débit** de dépense, pas son cumul.
- Plafonds par template : `timeout_s`, `limits`, nombre de sorties.
- Kill switch relu en base au dispatch, à la prise en charge et avant publication.
- Tableau de bord admin : coût par jour, template, runtime, part de l'inactivité ; alerte au-delà d'un seuil ou
  d'un écart de 20 % entre estimé et réel.
- Toute estimation soumise à autorisation inclut démarrage du conteneur, démarrage ComfyUI, chargement des modèles,
  calcul, post-traitement, inactivité, CPU et mémoire (05 §5.9).
