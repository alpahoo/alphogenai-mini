# 4. Synchronisation entre workflows ComfyUI et paramètres du frontend

## 4.1 Principe

Le graphe API dit **ce qui s'exécute**. Le manifeste dit **ce que l'utilisateur peut changer** et **comment**.
`/object_info` (figé dans `object_info_snapshot` au moment de l'import) dit **ce que ComfyUI accepte**.

```
graph.api.json   ──┐
object_info figé ──┼──► validateur ──► formulaire (Simple / Advanced) ──► valeurs ──► graphe résolu ──► /prompt
manifest.json    ──┘
```

Règles :

1. Tout paramètre exposé pointe vers une entrée précise : `node_id` + `input`. Pas de recherche par nom de node.
2. Type, plage et options viennent de `object_info`. Le manifeste ne peut que les **restreindre**
   (intersection), jamais les élargir.
3. Une entrée non exposée garde la valeur du graphe. Le serveur ignore et journalise toute valeur non déclarée.
4. Les modifications de structure (ajout de node, lien) ne passent que par le Studio, sous forme de nouvelle
   version. En mode Advanced, une alternative de structure n'est possible que via une **variante déclarée** (D11).

## 4.2 Schéma du manifeste (v1)

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
               "moderation_profile": "strict", "user_terms": "minimax_h3_aup" },
  "plans": ["admin"],                         // puis ["pro","premium"] après la phase conformité
  "params": [ /* cf. 4.3 */ ],
  "variants": [ /* cf. 4.4 */ ],
  "derived": [ /* cf. 4.5 */ ],
  "outputs": [{ "node_id": "15", "kind": "video", "audio": true }],
  "postprocess": [{ "type": "audio_shift", "seconds": 0.4, "param": "audio_shift_s", "keep_raw": "keep_raw" }],
  "cost": { "model": "gpu_seconds", "estimate": { "base_s": 25, "per_output_second_s": 0 } },
  "limits": { "max_seconds": 10, "max_pixels": 921600 }
}
```

Champ de paramètre :

| Clé | Rôle |
|---|---|
| `key` | identifiant stable côté API et UI (`prompt`, `seconds`, `seed`…) |
| `target` | `{ "node_id": "6", "input": "prompt" }`, ou `null` si le paramètre ne sert qu'à un champ dérivé ou à un post-traitement |
| `widget` | `prompt`, `text`, `number`, `slider`, `select`, `toggle`, `seed`, `image`, `video`, `audio`, `lora`, `model`, `resolution` |
| `label`, `help` | libellés publics, sans nom de fournisseur |
| `modes` | `["simple","advanced"]` ou `["advanced"]` |
| `default` | valeur par défaut (doit être valide selon `object_info`) |
| `min`/`max`/`step`/`options` | restriction de la plage ComfyUI |
| `locked` | `true` : visible en Advanced en lecture seule, jamais modifiable (réglages validés) |
| `plans` | restriction par plan (ex. résolution maximale réservée à premium) |
| `required` | champ obligatoire |

## 4.3 Exemple : paramètres H3 (graphe du labo, `verified-runtime`)

Ids de nodes du graphe validé (`h3-lab/app.py`) : 1 UNET, 2 encodeur, 3-4 VAE, 5 LoRA turbo,
6 `MiniMaxH3ImageToVideo`, 8 bruit, 9 sampler, 10 scheduler, 11 sampling, 12-14 décodage, 15 sauvegarde,
20 image d'entrée (optionnelle).

| key | target | widget | modes | défaut | contrainte |
|---|---|---|---|---|---|
| `prompt` | 6.prompt | prompt (aide au format officiel) | simple, advanced | — | requis, ≤ 4000 car. |
| `first_frame` | 20.image (active la variante `i2v`) | image | simple, advanced | — | optionnel, modéré |
| `seconds` | — (dérivé) | slider | simple, advanced | 5 | 2 à 10, pas de 1 |
| `aspect` | 6.width / 6.height (dérivé) | select | simple, advanced | 9:16 | 9:16, 16:9, 1:1 |
| `width`, `height` | 6.width / 6.height | number | advanced | issus de `aspect` | multiples de 16, ≤ `limits.max_pixels` ; remplacent `aspect` s'ils sont fournis |
| `seed` | 8.noise_seed | seed | advanced | aléatoire | plage `object_info` |
| `quality` | variante `turbo_v4` / `full` | select | advanced | turbo_v4 | — |
| `steps` | 10.steps | number | advanced | 8 | **locked** tant que `quality = turbo_v4` |
| `sampler_name` | 9.sampler_name | select | advanced | euler | **locked** (réglage validé) |
| `scheduler` | 10.scheduler | select | advanced | beta | **locked** |
| `lora_strength` | 5.strength_model | slider | advanced | 1.0 | **locked** |
| `text_encoder` | 2.clip_name | model | advanced | int8_convrot | **locked** |
| `audio_shift_s` | — (post-traitement) | slider | advanced | 0.4 | 0 à 0.6, pas de 0.01 |
| `keep_raw` | — (post-traitement) | toggle | advanced | true | — |

Le mode Simple affiche 4 champs : prompt, image de départ, durée, format. Les champs verrouillés montrent la
valeur validée sans permettre de la changer : l'admin les déverrouille dans le manifeste s'il le veut.

## 4.4 Variantes

Une variante applique un patch déclaré au graphe. Elle couvre ce que le labo faisait en Python
(`TURBO_MODES`, image d'entrée facultative) sans code :

```jsonc
"variants": [
  { "key": "quality", "options": {
      "turbo_v4": { "set": { "5.lora_name": "minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors",
                             "9.sampler_name": "euler", "10.scheduler": "beta", "10.steps": 8 } },
      "full":     { "remove_nodes": ["5"], "relink": { "7.model": ["1", 0], "10.model": ["1", 0] },
                    "set": { "9.sampler_name": "res_multistep", "10.scheduler": "simple", "10.steps": 20 } } } },
  { "key": "i2v", "when": { "param_present": "first_frame" },
    "add_nodes": { "20": { "class_type": "LoadImage", "inputs": { "image": "$first_frame" } } },
    "relink": { "6.first_frame": ["20", 0] } }
]
```

Opérations autorisées : `set`, `remove_nodes`, `add_nodes` (uniquement des `class_type` de la liste blanche du
template), `relink`. Le résultat est revalidé comme un graphe complet.

## 4.5 Champs dérivés

Petite liste fermée de fonctions pures, testées unitairement, et non un langage d'expressions libre :

| Fonction | Usage |
|---|---|
| `frames_from_seconds(seconds, fps=24)` | formule du template officiel H3 : `n = max(5, round(s*fps)); n + (5 - n % 17) % 17` |
| `dims_from_aspect(aspect, max_pixels, multiple=16)` | largeur et hauteur à partir du format et du budget de pixels |
| `random_seed()` | seed tiré côté serveur si l'utilisateur n'en donne pas |

Nouvelle fonction = code TypeScript + test, une fois pour toutes (et non par workflow).

## 4.6 Exemple : MOSS-Image (deuxième template)

Source : `MOSS_IMAGE_ULTRA_WORKFLOW.json` (format UI, communauté). Nodes inventoriés (`verified-code` sur le
fichier) : cœur ComfyUI (`UNETLoader`, `CLIPLoader`, `KSampler`, `EmptyFlux2LatentImage`, `MOSSImageControl`,
`MOSSImageLayoutPrompt`, `TextGenerate`, `CreateBoundingBoxes`…), plus `comfyui-kjnodes`
(`SetNode`/`GetNode`, `Ideogram4PromptBuilderKJ`), `comfyui_controlnet_aux` (`DepthAnythingV2Preprocessor`) et
`rgthree-comfy` (nodes d'interface : groupes, comparateur, Power Lora Loader).

Procédure :

1. L'ouvrir dans le Studio admin (runtime `moss-image@1`), remplacer l'encodeur « abliterated » par
   `qwen3.5_9b_int8_convrot` officiel (Comfy-Org/MOSS-Image), retirer ce qui ne sert qu'à l'interface.
2. Export API. Les nodes virtuels (`SetNode`/`GetNode`) et d'interface rgthree disparaissent à l'export
   (`inferred`, à vérifier) : si un node rgthree **d'exécution** reste (Power Lora Loader), il doit être dans la
   liste blanche du runtime, sinon être remplacé par `LoraLoaderModelOnly`.
3. Manifeste V1 : `prompt`, `aspect`, `seed`, `steps` (advanced), `image_control` (variante contrôle profondeur,
   advanced). Sortie : node `SaveImage`.

C'est précisément ce test qui prouve la généricité : **aucune ligne de Python** entre H3 et MOSS, seulement un
nouveau runtime YAML et un nouveau dossier de template.

## 4.7 Synchronisation dans le temps

| Événement | Ce qui se passe |
|---|---|
| Nouvelle version d'un template (Studio) | Nouvelle ligne immuable. Les runs passés gardent leur version. L'admin publie quand il veut |
| Montée de version d'un runtime (ComfyUI, custom node) | Outil `comfy-drift` : relance `/object_info` sur le nouveau runtime, compare au `object_info_snapshot` de chaque template (entrée disparue, type changé, option retirée, plage réduite). Rapport bloquant avant de basculer un template sur le nouveau runtime |
| Paramètre exposé qui n'existe plus | Import refusé (entrée inconnue) |
| Valeur par défaut hors plage après mise à jour | Import refusé |
| Nouveau paramètre disponible dans un node | Proposé à l'admin dans l'éditeur de manifeste (non exposé par défaut) |

L'éditeur de manifeste admin propose automatiquement **toutes** les entrées scalaires du graphe (avec leur type et
leur plage issus d'`object_info`). L'admin coche ce qu'il expose, en quel mode, pour quels plans, et ce qu'il
verrouille. C'est ce qui permet au mode Advanced d'exposer « tout ce qui est techniquement compatible et autorisé ».
