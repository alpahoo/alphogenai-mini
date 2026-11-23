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
