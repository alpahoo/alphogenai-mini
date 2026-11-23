# LongCat-Video-Avatar 1.6 : POC Modal (T-1170)

App Modal privee `alphogenai-longcat-avatar-poc`. Hors perimetre : Vercel, Supabase, routes, jobs, Studio, apps/volumes/secrets Modal existants.

## Reproduction (depuis ce dossier, Windows : `PYTHONUTF8=1`)

```
python -m modal run app.py --step weights   # CPU, ~3,5 min, 47,3 Go dans le volume poids
python -m modal run app.py --step inputs    # CPU, portrait + WAV de demo upstream
python -m modal run app.py --step run       # GPU PAYANT : H100, timeout 1500 s
python -m modal volume get alphogenai-longcat-avatar-poc-io outputs/demo ./out   # recuperation privee
```

Sortie privee : volume `alphogenai-longcat-avatar-poc-io` (`outputs/demo/*.mp4` + `metrics.json`). Aucune URL publique.

## Versions epinglees
- Code : `meituan-longcat/LongCat-Video` @ `58eb336edc5c8c63389838727e40b8c18434e54e`
- Poids Avatar 1.6 : `acfc628244201fc53fb6fe8a8903c5bac9bdf68f` (INT8 `base_model_int8`, `loraA` DMD, `loraB` OPSD, whisper-large-v3, vocal_separator)
- Poids base (tokenizer, text_encoder, vae) : `meituan-longcat/LongCat-Video` @ `03b55529b1d1d4045f5fbe14d65c8c6e8116b278`
- Runtime : CUDA 12.4.1 + cuDNN, Python 3.10, torch 2.6.0+cu124, flash-attn 2.7.4.post1 (wheel precompile)

## Commande upstream executee
`torchrun --nproc_per_node=1 run_demo_avatar_single_audio_to_video.py --stage_1=ai2v --resolution=480p --use_int8 --use_distill --lora_path loraB/lora.safetensors --model_type avatar-v1.6 --mix_steps=4 --mix_alpha=1.0` (valeurs du README officiel).

## Ecarts volontaires vs requirements upstream
`torch`/`flash-attn` installes a part ; `streamlit` retire (UI inutile) ; `libsndfile1==0.0.1` (pas un paquet pip, remplace par apt) ; `tritonserverclient==0.0.6` retire (inexistant sur PyPI, jamais importe).

## Notes
- Le script upstream mappe `avatar-v1.6` sur le chemin v1.5 : un seul segment de 93 images. Mesure reelle : MP4 768x512, 25 fps, 3,72 s (pas 480x832 / 16 fps comme suppose avant le rendu).
- Les temps charge/inference sont deduits des lignes de log (approximatifs) ; le script upstream n'emet pas de timers.
- Pas de ComfyUI pour ce premier essai.

## Resultat du premier rendu (2026-11-23, H100, run `demo`)
| Mesure | Valeur |
|---|---|
| Demarrage a froid Modal (client moins conteneur) | ~12,6 s (image deja buildee) |
| Chargement modeles (lecture 47 Go du volume + LoRA, approx.) | ~222,7 s |
| Inference (8 etapes, 7,18 s/etape) | ~56,5 s (barre tqdm : 57 s) |
| Total conteneur | 279,2 s ; mur client 291,8 s |
| MP4 | 768x512, 25 fps, 93 images, 3,72 s, 1,23 Mo |
| Memoire GPU pic (nvidia-smi, echantillon 0,5 s) | 51 217 MiB (~50 Go) |
| Cout GPU estime (tarif x duree conteneur) | ~0,31 $ ; CPU/memoire en sus non compte (~0,07 $) |
Qualite visuelle et synchro labiale : non evaluees automatiquement, a juger sur le MP4 (`outputs/demo/ai2v_demo_1.mp4`). Le chargement a froid domine : un 2e rendu avec cache de volume chaud n'a pas ete mesure.

## Test Luz : deux rendus dans la meme invocation (2026-11-23, H100, run `luz`)
Entrees privees (volume `-io`, `inputs/`) : portrait `luz_face.png` (fiche personnage validee, `01_visage_face`, de face, bouche degagee) et voix FR `luz_fr.wav` (Emma validee, 9,72 s : « Salut ! Moi, c'est Luz, l'assistante virtuelle d'Atussa. Chaque semaine, je te montre des astuces simples pour bricoler, voyager et lancer tes projets. On commence ? », contient des p, b, m). INT8, distille 8 etapes, 3 segments (continuation), meme graine (`generator.manual_seed(seed)` avant chaque rendu), modele garde en memoire GPU entre les deux.

| Mesure | Valeur |
|---|---|
| Chargement initial (modeles + preparation audio, volume a froid) | 168,6 s |
| Rendu 1 (3 segments) | 183,9 s |
| Rendu 2, a chaud (modele deja en memoire) | 182,0 s |
| Total conteneur / mur client | 544,0 s / 552,0 s (demarrage a froid ~8 s) |
| Pic VRAM | 42 289 MiB alloue par torch ; 52 429 MiB vu par nvidia-smi |
| MP4 (x2) | 544x736, 25 fps, 253 images, 10,12 s, 10,4 Mo ; piste AAC 9,68 s |
| Coût | ~0,60 $ GPU (544 s x 0,001097 $/s) + ~0,13 $ CPU/memoire estimes = ~0,73 $ |

Constats : le chargement represente ~31 % du temps ; le 2e rendu n'est pas plus rapide (182 s contre 184 s) car les 3 segments de denoising dominent (~61 s/segment). Les deux MP4 sont identiques octet pour octet (meme MD5), le pipeline est deterministe a graine fixe. Voix presente sur toute la duree (energie non nulle chaque seconde, mesuree sur la piste du MP4) ; la video depasse l'audio de ~0,4 s. Synchro labiale et fidelite du visage : jugees visuellement par Paul, non mesurees automatiquement.

Reproduction (depuis ce dossier, `PYTHONUTF8=1`), apres `--step weights` :
```
python -m modal volume put alphogenai-longcat-avatar-poc-io <portrait.png> inputs/luz_face.png
python -m modal volume put alphogenai-longcat-avatar-poc-io <voix_16k_mono.wav> inputs/luz_fr.wav
python -m modal run --detach app.py --step twice --run-tag luz --image-name luz_face.png --wav-name luz_fr.wav --segments 3 --prompt "<prompt>"   # GPU payant, plafond ~1,6 $ (timeout 1200 s)
python -m modal volume get alphogenai-longcat-avatar-poc-io outputs/luz ./out
```
`--detach` evite qu'une interruption du client local ne tue le rendu. Prompt utilise : « A young woman with long curly dark hair and light blue eyes, wearing a white t-shirt, facing the camera in a front-facing close-up, centred in frame, soft even light, plain light grey background. She speaks in French with a natural friendly expression, her mouth clearly visible, subtle natural head movement. »

Note sur le test precedent (`man_voiced`) : deux tentatives ont ete interrompues cote client avant la fin du chargement ; aucun resultat, cout non mesure (faible).
