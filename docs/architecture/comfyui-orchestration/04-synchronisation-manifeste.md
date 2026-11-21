# 4. Synchronisation entre workflows ComfyUI et paramètres du frontend

Révision 2 (2026-11-08), après revue Codex (I4, mineurs). Correspondance : [09](09-correspondance-revue-codex.md).

## 4.1 Principe et partage des validations

```
graphs API (1 par variante) ─┐
object_info figé ────────────┼──► validation AlphoGen ──► formulaire ──► valeurs ──► graphe résolu ──► /prompt
manifest.json ───────────────┘    (autorisations, plafonds)                              (validation native ComfyUI)
```

| Couche | Valide |
|---|---|
| AlphoGen (avant admission) | clé déclarée, mode, plan, verrou, type et plage (manifeste ∩ `object_info`), plafonds, modèle du catalogue, rôle du champ |
| ComfyUI (au `POST /prompt`) | validation **sémantique native** des nodes, y compris celle écrite en Python par les custom nodes. Une erreur est rendue avec un code public (`INVALID_INPUT`) et le détail reste dans les logs admin |

Règles :

1. Tout paramètre exposé pointe vers une entrée précise : `node_id` + `input`, **dans chaque graphe de variante** où
   il s'applique. Pas de recherche par nom de node.
2. Type, plage et options viennent d'`object_info`. Le manifeste ne peut que les **restreindre**.
3. **Clé inconnue = rejet explicite** (400, code `UNKNOWN_PARAM`). Aucune valeur non déclarée n'est ignorée en silence.
4. La structure d'un graphe ne change que dans le Studio, sous forme de nouvelle version.

## 4.2 Contrat de widgets supportés

`/object_info` décrit des entrées, pas toute l'ergonomie : des custom nodes ajoutent des widgets JavaScript, des
comportements dynamiques ou des valeurs structurées. La génération automatique est donc **limitée à un contrat
explicite** :

| Type ComfyUI (`object_info`) | Widget AlphoGen | Validation par rôle |
|---|---|---|
| `INT` | `number`, `slider`, `seed` | entier, min/max/step |
| `FLOAT` | `number`, `slider` | min/max/step |
| `STRING` (multiline) | `prompt`, `text` | longueur max par template ; texte libre (les `/` et `\` sont autorisés) ; modération |
| `STRING` (une ligne) | `text` | longueur max ; motif optionnel déclaré dans le manifeste |
| `BOOLEAN` | `toggle` | booléen |
| COMBO (liste d'options) | `select`, `model`, `lora` | valeur ∈ options ∩ manifeste ; pour `model`/`lora` : ∈ catalogue du runtime |
| entrée image de `LoadImage` | `image` | upload privé de l'utilisateur, MIME et taille, modération ; **nom de fichier généré par le serveur** |
| entrée audio / vidéo (`LoadAudio`, `LoadVideo` ou équivalent du runtime) | `audio`, `video` | idem |
| tout autre type (boîtes, listes structurées, éditeurs spatiaux, widgets JS de custom nodes) | **non généré** | exposé seulement via une **extension de widget déclarée** (composant + schéma JSON + validation serveur), écrite une fois et réutilisable. Sinon : non exposable, la valeur du graphe s'applique |

Le mode Advanced expose **tout** ce que l'admin autorise dans ce contrat, sans autre limite. L'éditeur de manifeste
signale les entrées hors contrat, au lieu de prétendre les gérer.

## 4.3 Schéma du manifeste (v1)

```jsonc
{
  "schema": "alphogen.comfy.manifest/1",
  "slug": "minimax-h3",
  "title": "MiniMax H3",                    // libellé public (obligatoire pour H3, licence IV.2)
  "kind": "video",
  "capabilities": ["t2v", "i2v"],
  "runtime": "h3-video@1",
  "gpu": "H100", "timeout_s": 900,
  "license": { "ids": ["minimax-h3-community", "apache-2.0"], "notices": ["minimax_h3_ui", "ai_generated"],
               "user_terms": "minimax_h3_aup" },
  "moderation_profile": "h3_fail_closed",
  "plans": [],                               // vide = admin seulement ; rempli après l'étape de conformité
  "variant_axes": { "first_frame": ["absent", "present"], "quality": ["turbo", "full"] },
  "variants": {                              // table COMPLÈTE : chaque combinaison des axes a une entrée
    "absent|turbo":  { "graph": "graph.t2v.api.json" },
    "absent|full":   { "graph": "graph.t2v_full.api.json" },
    "present|turbo": { "graph": "graph.i2v.api.json" },
    "present|full":  { "unsupported": "UNSUPPORTED_COMBINATION" }   // pas de graphe i2v_full exporté en V1
  },
  "params": [ /* §4.4 */ ],
  "derived": [ /* §4.6 */ ],
  "outputs": [{ "node_id": "15", "kind": "video", "mime": "video/mp4", "audio": true }],
  "postprocess": [{ "type": "audio_shift", "seconds_param": "audio_shift_s", "keep_raw_param": "keep_raw",
                    "content_preserving": true }],
  "asset_capabilities": ["voiceover", "social_export"],   // seulement après test ; overlay exclu en V1
  "limits": { "max_seconds": 10, "max_pixels": 921600, "prompt_max_chars": 2000 },
  "cost": { "estimate": { "warm_s": 22, "per_extra_second_s": 4 } }
}
```

## 4.4 Exemple : paramètres H3 (graphe validé du labo, `verified-runtime`)

Ids du graphe (`h3-lab/app.py`) : 1 UNET, 2 encodeur, 3-4 VAE, 5 LoRA turbo, 6 `MiniMaxH3ImageToVideo`, 8 bruit,
9 sampler, 10 scheduler, 11 sampling, 12-14 décodage, 15 sauvegarde, 20 image d'entrée (graphe `i2v` seulement).

| key | target | widget | modes | défaut | contrainte |
|---|---|---|---|---|---|
| `prompt` | 6.prompt | prompt (aide au format officiel) | simple, advanced | — | requis, ≤ 2 000 car. (limite commune actuelle de `guard.ts`) |
| `first_frame` | 20.image (variante `i2v`) | image | simple, advanced | — | optionnel, modéré |
| `seconds` | — (dérivé) | slider | simple, advanced | 5 | 2 à 10, pas de 1 |
| `aspect` | 6.width / 6.height (dérivé) | select | simple, advanced | 9:16 | 9:16, 16:9, 1:1 |
| `width`, `height` | 6.width / 6.height | number | advanced | issus de `aspect` | multiples de 16, ≤ `max_pixels` ; remplacent `aspect` s'ils sont fournis |
| `seed` | 8.noise_seed | seed | advanced | tiré par le serveur et **figé** dans le run | plage `object_info` |
| `quality` | axe de variante `turbo` / `full` (§4.5) | select | advanced | `turbo` | `full` refusé si `first_frame` est présent (V1) |
| `steps` | 10.steps | number | advanced | **valeur du graphe de la variante** | verrouillé (turbo : 8 ; full : 20) |
| `sampler_name` | 9.sampler_name | select | advanced | **valeur du graphe** | verrouillé (turbo : euler ; full : res_multistep) |
| `scheduler` | 10.scheduler | select | advanced | **valeur du graphe** | verrouillé (turbo : beta ; full : simple) |
| `lora_strength` | 5.strength_model | slider | advanced | 1.0 | verrouillé ; **n'existe pas** dans la variante full (pas de node 5) |
| `text_encoder` | 2.clip_name | model | advanced | int8_convrot | verrouillé |
| `audio_shift_s` | — (post-traitement) | slider | advanced | 0.4 | 0 à 0.6, pas de 0.01 |
| `keep_raw` | — (post-traitement) | toggle | advanced | true | — |

Mode Simple : 4 champs (prompt, image de départ, durée, format). Les verrous sont des décisions de l'admin, qu'il
peut lever dans le manifeste.

## 4.5 Variantes : graphes complets exportés nativement (I4)

Pour ne pas créer un moteur de graphes, une variante **structurelle** (avec ou sans image d'entrée, avec ou sans
LoRA turbo) est un **graphe API complet**, conçu et exporté dans le Studio. Il n'y a ni ajout, ni suppression, ni
rebranchement de nodes par AlphoGen.

**Sélection sans ambiguïté.** Le manifeste déclare des **axes** (`variant_axes`) et une **table complète** : chaque
combinaison des valeurs des axes a exactement une entrée, soit un graphe, soit `unsupported`. Le validateur de
manifeste refuse une table incomplète ou une clé en double. À l'exécution, la combinaison est calculée à partir des
paramètres, puis :

- combinaison `unsupported` → rejet 400 (`UNSUPPORTED_COMBINATION`) **avant** admission, avec un message clair ;
- sinon, le graphe de la combinaison est utilisé. Il n'y a pas de règles ordonnées, donc pas de conflit possible.

Pour H3 en V1 : image présente × full n'est pas proposé (aucun graphe `i2v_full` exporté) ; l'UI désactive `full`
quand une image est fournie, et le serveur rejette la combinaison si elle arrive quand même.

**Défauts et verrous par variante.** Un paramètre verrouillé n'est **jamais écrit** par AlphoGen : sa valeur est celle
du graphe de la variante choisie (8 / euler / beta en turbo ; 20 / res_multistep / simple en full). Un paramètre
dont la cible n'existe pas dans le graphe choisi (ex. `lora_strength` en full) est ignoré s'il est verrouillé, et
**rejeté** (400) s'il est envoyé explicitement. Les défauts affichés dans l'UI sont lus dans le graphe de la variante
courante.

La seule opération sur un graphe est `set` : écrire une valeur dans une entrée déclarée et non verrouillée. Le
résultat est soumis tel quel à ComfyUI, qui le valide nativement.

Test d'acceptation (05 étape 3) : les 4 combinaisons image absente/présente × turbo/full. Trois produisent le bon
graphe, avec des valeurs verrouillées identiques à celles du graphe exporté ; la quatrième est rejetée avant
admission. S'y ajoutent un `lora_strength` explicite en full → 400, et un manifeste à table incomplète → refusé à
l'import.

## 4.6 Champs dérivés

Liste fermée de fonctions pures, testées, versionnées avec le résolveur (`resolver_version`) :

| Fonction | Usage |
|---|---|
| `frames_from_seconds(seconds, fps=24)` | formule du template officiel H3 : `n = max(5, round(s*fps)); n + (5 - n % 17) % 17` (5 s → 124, 7 s → 175) |
| `dims_from_aspect(aspect, max_pixels, multiple=16)` | largeur et hauteur à partir du format |
| `random_seed()` | seed tiré par le serveur, **stocké** dans `params_effective` |

Nouvelle fonction = code TypeScript + test + incrément de `resolver_version`, une fois pour toutes.

## 4.7 MOSS-Image (deuxième template) : texte vers image seul en V1

Source : `MOSS_IMAGE_ULTRA_WORKFLOW.json` (format UI, communauté). Nodes inventoriés (`verified-code` sur le
fichier) : cœur ComfyUI (`UNETLoader`, `CLIPLoader`, `KSampler`, `EmptyFlux2LatentImage`, `MOSSImageLayoutPrompt`,
`TextGenerate`, …) et packs `comfyui-kjnodes`, `comfyui_controlnet_aux`, `rgthree-comfy`.

1. Studio admin (runtime `moss-image@1`) : remplacer l'encodeur « abliterated » par `qwen3.5_9b_int8_convrot`
   officiel ; VAE `flux2-vae_small` (licence vérifiée) ; **retirer la branche contrôle de profondeur** (LoRA en attente de clarification,
   annexe A.3) ; retirer ce qui ne sert qu'à l'interface.
2. Export API natif. Vérifier ce qui reste comme `class_type` : si un pack n'est plus nécessaire après l'export, il
   sort du runtime (moins de code tiers, réutilisation plus sûre).
3. Manifeste V1 : `prompt`, `aspect`, `seed`, `steps` (advanced). Sortie `SaveImage` → asset `image/png`.
4. Les textes produits par `TextGenerate` (si conservé) sont modérés comme du texte (02 §2.8).

## 4.8 Synchronisation dans le temps

| Événement | Ce qui se passe |
|---|---|
| Nouvelle version d'un template | Nouvelle ligne immuable ; les runs passés gardent leur version ; publication manuelle |
| Montée de version d'un runtime | Outil `comfy-drift` : `/object_info` du nouveau runtime comparé à l'`object_info_snapshot` de chaque template (entrée disparue, type changé, option retirée, plage réduite). Rapport bloquant avant bascule |
| Paramètre exposé qui n'existe plus | Import refusé |
| Défaut hors plage après mise à jour | Import refusé |
| Nouvelle entrée disponible | Proposée à l'admin (non exposée par défaut) si elle entre dans le contrat de widgets (§4.2) |
