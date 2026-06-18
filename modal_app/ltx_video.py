"""
AlphoGenAI — LTX-2.3 Image-to-Video via SDK officiel Lightricks
================================================================

SDK    : github.com/Lightricks/LTX-2 (ltx-core + ltx-pipelines)
Pipeline : TI2VidTwoStagesPipeline (2-stage, qualité prod + distilled LoRA)

Fichiers sur volume 'huggingface-cache' (déjà téléchargés) :
  /cache/ltx23-base/ltx-2.3-22b-distilled-1.1.safetensors   ← transformer principal
  /cache/ltx23-base/ltx-2.3-22b-distilled-lora-384-1.1.safetensors  ← LoRA distillé
  /cache/ltx23-base/ltx-2.3-spatial-upscaler-x2-1.1.safetensors     ← upsampler spatial
  /cache/ltx23-distilled/text_encoder/                        ← Gemma 12B (HF format)

GPU : H100 80GB

Commandes :
    modal run modal_app/ltx_video.py::test_generation
    modal deploy modal_app/ltx_video.py
"""

import base64
import time
import uuid

import modal
from fastapi import Request, Response
from fastapi.responses import JSONResponse

# ─────────────────────────────────────────────────────────────────────────────
# Image Modal
# ─────────────────────────────────────────────────────────────────────────────

app = modal.App("alphogenai-ltx23")

LTX23_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.7.0",
        "torchvision",
        "torchaudio==2.7.0",
        "git+https://github.com/Lightricks/LTX-2.git#subdirectory=packages/ltx-core",
        "git+https://github.com/Lightricks/LTX-2.git#subdirectory=packages/ltx-pipelines",
        "transformers>=4.44.0",
        "accelerate>=0.33.0",
        "sentencepiece",
        "pillow",
        "soundfile",
        "scipy",
        "numpy",
        "huggingface_hub",
        "requests",
        "fastapi[standard]",
        "python-multipart",
        "einops",
        "omegaconf",
    )
)

# ─────────────────────────────────────────────────────────────────────────────
# Chemins modèles (volume huggingface-cache)
# ─────────────────────────────────────────────────────────────────────────────

CACHE_DIR = "/cache"
# FP8 checkpoint (~27.5 GB) → tient en VRAM avec offload_mode=NONE, pas d'I/O disque.
# Téléchargé via download_fp8 depuis Lightricks/LTX-2.3-fp8.
CHECKPOINT_PATH   = "/cache/ltx23-base/ltx-2.3-22b-distilled-fp8.safetensors"
CHECKPOINT_BF16   = "/cache/ltx23-base/ltx-2.3-22b-distilled-1.1.safetensors"  # fallback BF16 (46 GB)
LORA_PATH         = "/cache/ltx23-base/ltx-2.3-22b-distilled-lora-384-1.1.safetensors"
UPSAMPLER_PATH    = "/cache/ltx23-base/ltx-2.3-spatial-upscaler-x2-1.1.safetensors"
GEMMA_ROOT        = "/cache/ltx23-distilled"

hf_volume = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
secrets   = modal.Secret.from_name("alphogenai-secrets-corrected-v2")

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_image_bytes(source: str) -> bytes:
    import requests as req
    if source.startswith("data:"):
        _, encoded = source.split(",", 1)
        return base64.b64decode(encoded)
    if source.startswith(("http://", "https://")):
        r = req.get(source, timeout=30)
        r.raise_for_status()
        return r.content
    return base64.b64decode(source)


# ─────────────────────────────────────────────────────────────────────────────
# Classe modèle
# ─────────────────────────────────────────────────────────────────────────────

@app.cls(
    gpu="H100",
    image=LTX23_IMAGE,
    volumes={CACHE_DIR: hf_volume},
    secrets=[secrets],
    timeout=3600,
    scaledown_window=900,
    env={"PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"},
)
class LTX23Model:

    @modal.enter()
    def load_model(self):
        from ltx_pipelines.ti2vid_one_stage import TI2VidOneStagePipeline
        from ltx_pipelines.utils.types import OffloadMode
        from ltx_core.quantization import QuantizationPolicy
        from ltx_core.quantization.fp8_scaled_mm import (
            get_fp8_swap_module_ops,
            fp8_scaled_mm_fuse_rule,
        )
        import torch

        print("[ltx23] chargement TI2VidOneStagePipeline + FP8 scaled_mm + offload_mode=NONE…")
        print(f"  checkpoint : {CHECKPOINT_PATH}")
        print(f"  gemma_root : {GEMMA_ROOT}")

        # Policy FP8 : swappe les nn.Linear en FP8Linear (GEMM FP8 scaled).
        # Le checkpoint contient déjà weight(F8_E4M3) + weight_scale + input_scale.
        fp8_policy = QuantizationPolicy(
            module_ops=get_fp8_swap_module_ops(CHECKPOINT_PATH),
            fuse_rule=fp8_scaled_mm_fuse_rule,
        )

        self.pipeline = TI2VidOneStagePipeline(
            checkpoint_path=CHECKPOINT_PATH,
            gemma_root=GEMMA_ROOT,
            loras=[],
            quantization=fp8_policy,
            offload_mode=OffloadMode.NONE,
        )

        print(f"[ltx23] pipeline prêt ✓ — GPU après init : {torch.cuda.memory_allocated()/1e9:.2f} GB")

    @modal.method()
    def generate(
        self,
        image_bytes: bytes,
        prompt: str,
        negative_prompt: str = "worst quality, inconsistent motion, blurry, jittery, distorted, static",
        duration_seconds: float = 5.0,
        width: int = 768,
        height: int = 512,
        seed: int = 42,
        num_inference_steps: int = 40,
        frame_rate: float = 25.0,
    ) -> bytes:
        import tempfile
        from io import BytesIO
        from PIL import Image
        from ltx_core.components.guiders import MultiModalGuiderParams
        from ltx_pipelines.utils.args import ImageConditioningInput
        from ltx_pipelines.utils.media_io import encode_video

        import torch
        num_frames = max(9, int(round(duration_seconds * frame_rate)))
        print(f"[ltx23] {num_frames}f × {width}×{height} @ {frame_rate}fps | steps={num_inference_steps} | seed={seed}")
        print(f"[ltx23] prompt: {prompt[:100]}")
        print(f"[ltx23] GPU avant generate : {torch.cuda.memory_allocated()/1e9:.2f} GB / {torch.cuda.get_device_properties(0).total_memory/1e9:.2f} GB")

        # stg_scale=0 : désactive Skip-Transformer-Guidance (3 passes→2), économise VRAM
        video_params = MultiModalGuiderParams(
            cfg_scale=3.0,
            stg_scale=0.0,
            rescale_scale=0.7,
            modality_scale=3.0,
            stg_blocks=[],
        )
        audio_params = MultiModalGuiderParams(
            cfg_scale=7.0,
            stg_scale=0.0,
            rescale_scale=0.7,
            modality_scale=3.0,
            stg_blocks=[],
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = f"{tmpdir}/input.jpg"
            Image.open(BytesIO(image_bytes)).convert("RGB").save(img_path)

            out_path = f"{tmpdir}/output.mp4"
            t0 = time.time()
            # inference_mode englobe aussi encode_video : le décodage VAE est
            # paresseux (itérateur) et s'exécute pendant encode_video, donc les
            # tenseurs d'inférence doivent rester dans le même contexte.
            with torch.inference_mode():
                video, audio = self.pipeline(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    seed=seed,
                    height=height,
                    width=width,
                    num_frames=num_frames,
                    frame_rate=frame_rate,
                    num_inference_steps=num_inference_steps,
                    video_guider_params=video_params,
                    audio_guider_params=audio_params,
                    images=[ImageConditioningInput(img_path, 0, 1.0, 0)],
                )
                print(f"[ltx23] dénoising terminé en {time.time()-t0:.1f}s — encodage MP4…")
                encode_video(video, fps=frame_rate, audio=audio, output_path=out_path, video_chunks_number=1)
            print(f"[ltx23] terminé (gen+encode) en {time.time()-t0:.1f}s")
            return open(out_path, "rb").read()

    @modal.method()
    def health(self) -> dict:
        return {"status": "ok", "model": "LTX-2.3", "sdk": "Lightricks/LTX-2"}


# ─────────────────────────────────────────────────────────────────────────────
# API REST
# ─────────────────────────────────────────────────────────────────────────────

@app.function(
    image=LTX23_IMAGE,
    secrets=[secrets],
    timeout=660,
)
@modal.concurrent(max_inputs=50)
@modal.fastapi_endpoint(method="POST", label="ltx23-generate")
async def generate_api(request: Request) -> Response:
    """
    POST /generate
    Body JSON :
        image            str   URL ou base64 (requis)
        prompt           str   (requis)
        negative_prompt  str   (optionnel)
        duration_seconds float (défaut 5.0, max 10.0)
        width            int   (défaut 768)
        height           int   (défaut 512)
        seed             int   (défaut 42)
        num_inference_steps int (défaut 40)
    Réponse : video/mp4
    """
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "JSON invalide"}, status_code=400)

    image_src = data.get("image")
    prompt    = data.get("prompt")
    if not image_src or not prompt:
        return JSONResponse({"error": "Champs requis: image et prompt"}, status_code=422)

    duration = min(float(data.get("duration_seconds", 5.0)), 10.0)
    width    = int(data.get("width", 768))
    height   = int(data.get("height", 512))
    seed     = int(data.get("seed", 42))
    steps    = int(data.get("num_inference_steps", 40))
    neg      = data.get("negative_prompt", "worst quality, inconsistent motion, blurry, jittery, distorted, static")

    try:
        image_bytes = _load_image_bytes(image_src)
    except Exception as exc:
        return JSONResponse({"error": f"Impossible de charger l'image: {exc}"}, status_code=400)

    try:
        job_id = str(uuid.uuid4())[:8]
        t0 = time.time()
        video_bytes = LTX23Model().generate.remote(
            image_bytes=image_bytes,
            prompt=prompt,
            negative_prompt=neg,
            duration_seconds=duration,
            width=width,
            height=height,
            seed=seed,
            num_inference_steps=steps,
        )
        total = time.time() - t0
        print(f"[api] job={job_id} done in {total:.1f}s, {len(video_bytes)//1024}KB")
        return Response(
            content=video_bytes,
            media_type="video/mp4",
            headers={
                "X-Job-Id": job_id,
                "X-Generation-Time": f"{total:.1f}",
                "X-Seed": str(seed),
                "Content-Disposition": f'attachment; filename="{job_id}.mp4"',
            },
        )
    except Exception as exc:
        print(f"[api] ERREUR: {exc}")
        return JSONResponse({"error": str(exc)}, status_code=500)


@app.function(image=LTX23_IMAGE)
@modal.concurrent(max_inputs=100)
@modal.fastapi_endpoint(method="GET", label="ltx23-health")
def health_api() -> dict:
    return {"status": "ok", "model": "LTX-2.3", "sdk": "Lightricks/LTX-2"}


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoints locaux
# ─────────────────────────────────────────────────────────────────────────────

@app.local_entrypoint()
def test_generation(
    image_url: str = "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/guitar-man.png",
    prompt: str = "A man with short gray hair plays a red electric guitar on stage, dramatic spotlight, crowd in background",
    duration_seconds: float = 5.0,
    seed: int = 42,
):
    """Test I2V — coûte du GPU H100.
    Usage: modal run modal_app/ltx_video.py::test_generation
    """
    import requests
    print(f"[test] image: {image_url}")
    image_bytes = requests.get(image_url, timeout=30).content

    # Résolution et durée réduites pour le test (économie VRAM activations)
    # 480×272 @ 8fps × 3s = 24 frames, 8 steps = mode distillé optimal
    # 480×256 : multiples de 32, activations réduites pour le test VRAM
    print(f"[test] génération 3s @ 480×256 (low-res test), seed={seed}…")
    video_bytes = LTX23Model().generate.remote(
        image_bytes=image_bytes,
        prompt=prompt,
        duration_seconds=3.0,
        width=480,
        height=256,
        frame_rate=8.0,
        num_inference_steps=8,
        seed=seed,
    )

    out = "output_ltx23_i2v.mp4"
    with open(out, "wb") as f:
        f.write(video_bytes)
    print(f"[test] ✓ {len(video_bytes)//1024} KB → {out}")


@app.local_entrypoint()
def test_quality(seed: int = 42):
    """Test QUALITÉ — résolution prod 768×512, 5s, 25fps, 8 steps distillés.
    Enchaîne plusieurs sujets sur un conteneur chaud (moins cher).
    Usage: modal run modal_app/ltx_video.py::test_quality
    """
    import requests

    # (nom_fichier, url_image, prompt) — sujets variés : humain+musique, animal, ambiance/nature
    cases = [
        (
            "quality_guitar",
            "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/guitar-man.png",
            "A man with short gray hair plays a red electric guitar on stage, fingers moving on the strings, "
            "dramatic spotlight, cheering crowd in the background, energetic live concert",
        ),
        (
            "quality_cat",
            "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png",
            "A fluffy cat slowly blinks and turns its head, whiskers twitching, soft natural window light, "
            "calm and photorealistic, gentle ambient room tone",
        ),
        (
            "quality_astronaut",
            "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/astronaut.png",
            "An astronaut walks slowly across an alien landscape, dust drifting, cinematic wide shot, "
            "atmospheric wind and distant ambient sound",
        ),
    ]

    model = LTX23Model()  # même handle → conteneur chaud réutilisé entre les générations
    done = []
    for name, url, prompt in cases:
        try:
            print(f"\n[quality] {name} — téléchargement image…")
            image_bytes = requests.get(url, timeout=30).content
        except Exception as exc:
            print(f"[quality] ⚠ {name} : image inaccessible ({exc}), on saute")
            continue
        try:
            print(f"[quality] {name} — génération 768×512 / 5s / 25fps / 8 steps…")
            video_bytes = model.generate.remote(
                image_bytes=image_bytes,
                prompt=prompt,
                duration_seconds=5.0,
                width=768,
                height=512,
                frame_rate=25.0,
                num_inference_steps=8,
                seed=seed,
            )
            out = f"output_ltx23_{name}.mp4"
            with open(out, "wb") as f:
                f.write(video_bytes)
            print(f"[quality] ✓ {name} : {len(video_bytes)//1024} KB → {out}")
            done.append(out)
        except Exception as exc:
            print(f"[quality] ✗ {name} : échec génération — {exc}")

    print(f"\n[quality] terminé — {len(done)} vidéo(s) : {done}")


@app.function(image=LTX23_IMAGE, timeout=120)
def _inspect_sdk():
    """Lit le source du SDK pour trouver les options de mémoire — CPU only, pas de GPU."""
    import inspect
    import importlib

    results = {}

    # Signature du pipeline one-stage
    from ltx_pipelines.ti2vid_one_stage import TI2VidOneStagePipeline
    results["TI2VidOneStagePipeline.__init__"] = str(inspect.signature(TI2VidOneStagePipeline.__init__))

    # lipdub + a2vid : signatures __init__ ET __call__ + docstring (pour voix/lip-sync)
    for modname in ["lipdub", "a2vid_two_stage"]:
        try:
            mod = importlib.import_module(f"ltx_pipelines.{modname}")
            for cls_name in dir(mod):
                cls = getattr(mod, cls_name)
                if isinstance(cls, type) and cls_name.endswith("Pipeline"):
                    try:
                        results[f"{modname}.{cls_name}.__init__"] = str(inspect.signature(cls.__init__))
                    except Exception:
                        pass
                    try:
                        results[f"{modname}.{cls_name}.__call__"] = str(inspect.signature(cls.__call__))
                    except Exception:
                        pass
                    doc = (inspect.getdoc(cls) or "")[:600]
                    if doc:
                        results[f"{modname}.{cls_name}.doc"] = doc
        except Exception as e:
            results[f"{modname}"] = f"err: {e}"

    # Signature du TwoStages pour comparer
    from ltx_pipelines.ti2vid_two_stages import TI2VidTwoStagesPipeline
    results["TI2VidTwoStagesPipeline.__init__"] = str(inspect.signature(TI2VidTwoStagesPipeline.__init__))

    # Chercher DistilledPipeline
    try:
        from ltx_pipelines.distilled import DistilledPipeline
        results["DistilledPipeline.__init__"] = str(inspect.signature(DistilledPipeline.__init__))
    except ImportError as e:
        results["DistilledPipeline"] = f"ImportError: {e}"

    # Lire blocks.py pour trouver _transformer_ctx et gpu_model
    import ltx_pipelines.utils.blocks as blocks_mod
    blocks_src = inspect.getsource(blocks_mod)
    # Chercher cpu offload
    for keyword in ["cpu_offload", "offload", "cpu", "device_map", "sequential"]:
        if keyword.lower() in blocks_src.lower():
            results[f"blocks.py_has_{keyword}"] = True

    # Source de _transformer_ctx si présent
    for cls_name in dir(blocks_mod):
        cls = getattr(blocks_mod, cls_name)
        if hasattr(cls, "_transformer_ctx"):
            try:
                results[f"{cls_name}._transformer_ctx"] = inspect.getsource(cls._transformer_ctx)[:800]
            except Exception:
                pass

    # OffloadMode values
    try:
        from ltx_pipelines.utils.types import OffloadMode
        results["OffloadMode_values"] = {m.name: m.value for m in OffloadMode}
    except Exception as e:
        results["OffloadMode"] = str(e)

    # encode_video signature
    try:
        from ltx_pipelines.utils.media_io import encode_video
        results["encode_video.signature"] = str(inspect.signature(encode_video))
        results["encode_video.source"] = inspect.getsource(encode_video)[:1500]
    except Exception as e:
        results["encode_video"] = str(e)

    # QuantizationPolicy options
    try:
        from ltx_core.quantization.policy import QuantizationPolicy
        results["QuantizationPolicy_src"] = inspect.getsource(QuantizationPolicy)[:1500]
    except Exception as e:
        results["QuantizationPolicy"] = str(e)

    # Explore le package ltx_core.quantization pour trouver les factory FP8
    try:
        import pkgutil
        import ltx_core.quantization as quant_pkg
        submods = [m.name for m in pkgutil.iter_modules(quant_pkg.__path__)]
        results["quantization.submodules"] = submods
        # Membres publics du package + recherche fp8
        for name in dir(quant_pkg):
            if not name.startswith("_"):
                obj = getattr(quant_pkg, name)
                if callable(obj) and ("fp8" in name.lower() or "policy" in name.lower() or "quant" in name.lower()):
                    try:
                        results[f"quant.{name}.sig"] = str(inspect.signature(obj))
                    except Exception:
                        results[f"quant.{name}"] = repr(obj)
        # Inspecte chaque sous-module pour les fonctions/objets fp8
        for sm in submods:
            try:
                mod = importlib.import_module(f"ltx_core.quantization.{sm}")
                fp8_names = [n for n in dir(mod) if "fp8" in n.lower() and not n.startswith("_")]
                if fp8_names:
                    results[f"quant.{sm}.fp8_names"] = fp8_names
                    for n in fp8_names:
                        obj = getattr(mod, n)
                        if callable(obj):
                            try:
                                results[f"quant.{sm}.{n}.sig"] = str(inspect.signature(obj))
                            except Exception:
                                pass
            except Exception:
                pass
    except Exception as e:
        results["quantization_explore"] = str(e)

    # Cherche dans les pipelines / exemples comment FP8 est câblé
    try:
        import ltx_pipelines
        import pkgutil as _pk
        pipe_mods = [m.name for m in _pk.iter_modules(ltx_pipelines.__path__)]
        results["ltx_pipelines.submodules"] = pipe_mods
    except Exception as e:
        results["ltx_pipelines_explore"] = str(e)

    # Source complète de get_fp8_swap_module_ops + fp8_scaled_mm
    try:
        from ltx_core.quantization import fp8_scaled_mm as _fsm
        results["fp8_scaled_mm.get_fp8_swap_module_ops.src"] = inspect.getsource(_fsm.get_fp8_swap_module_ops)
        results["fp8_scaled_mm.FP8Linear.src"] = inspect.getsource(_fsm.FP8Linear)[:1800]
    except Exception as e:
        results["fp8_scaled_mm.src"] = str(e)

    # Grep dans tous les pipelines pour QuantizationPolicy / get_fp8_swap / quantization=
    try:
        import importlib as _il
        for sm in ["distilled", "ti2vid_one_stage", "ti2vid_two_stages"]:
            try:
                mod = _il.import_module(f"ltx_pipelines.{sm}")
                src = inspect.getsource(mod)
                hits = []
                for kw in ["QuantizationPolicy", "get_fp8_swap_module_ops", "fp8", "quantization"]:
                    if kw in src:
                        # extrait les lignes contenant le mot-clé
                        for ln in src.splitlines():
                            if kw in ln and ln.strip() not in hits:
                                hits.append(ln.strip())
                if hits:
                    results[f"pipeline.{sm}.fp8_hits"] = hits[:25]
            except Exception:
                pass
    except Exception as e:
        results["pipeline_fp8_grep"] = str(e)

    # Cherche un factory haut-niveau qui construit une QuantizationPolicy FP8 complète
    try:
        import importlib as _il2
        for modpath in ["ltx_pipelines.utils.args", "ltx_pipelines.utils.blocks", "ltx_core.quantization.policy"]:
            try:
                mod = _il2.import_module(modpath)
                src = inspect.getsource(mod)
                for ln in src.splitlines():
                    if "QuantizationPolicy(" in ln or "get_fp8_swap" in ln:
                        results.setdefault(f"{modpath}.policy_construction", []).append(ln.strip())
            except Exception:
                pass
    except Exception as e:
        results["policy_construction_grep"] = str(e)

    # _streaming_transformer_ctx source
    for cls_name in dir(blocks_mod):
        cls = getattr(blocks_mod, cls_name)
        if hasattr(cls, "_streaming_transformer_ctx"):
            try:
                results[f"{cls_name}._streaming_transformer_ctx"] = inspect.getsource(cls._streaming_transformer_ctx)[:1000]
            except Exception:
                pass

    return results


@app.local_entrypoint()
def inspect_sdk():
    """Inspecte le SDK Lightricks sans GPU pour trouver les options mémoire.
    Usage: modal run modal_app/ltx_video.py::inspect_sdk
    """
    result = _inspect_sdk.remote()
    for k, v in result.items():
        print(f"\n{'='*60}\n{k}:\n{v}")


@app.function(image=LTX23_IMAGE, volumes={CACHE_DIR: hf_volume}, secrets=[secrets], timeout=3600)
def _download_fp8():
    """Télécharge le checkpoint FP8 (~27.5 GB) sur le volume — idempotent, CPU only."""
    import os
    from huggingface_hub import hf_hub_download

    dst = CHECKPOINT_PATH
    if os.path.isfile(dst) and os.path.getsize(dst) > 25e9:
        print(f"[download] déjà présent : {dst} ({os.path.getsize(dst)/1e9:.2f} GB)")
        return {"status": "exists", "path": dst, "size_gb": round(os.path.getsize(dst)/1e9, 2)}

    print("[download] récupération ltx-2.3-22b-distilled-fp8.safetensors depuis Lightricks/LTX-2.3-fp8…")
    path = hf_hub_download(
        repo_id="Lightricks/LTX-2.3-fp8",
        filename="ltx-2.3-22b-distilled-fp8.safetensors",
        local_dir="/cache/ltx23-base",
        token=os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN"),
    )
    size = os.path.getsize(path)
    print(f"[download] ✓ {path} ({size/1e9:.2f} GB)")
    hf_volume.commit()
    return {"status": "downloaded", "path": path, "size_gb": round(size/1e9, 2)}


@app.local_entrypoint()
def download_fp8():
    """Usage: modal run modal_app/ltx_video.py::download_fp8"""
    print(_download_fp8.remote())


@app.function(image=LTX23_IMAGE, volumes={CACHE_DIR: hf_volume}, timeout=300)
def _inspect_fp8_keys():
    """Lit l'en-tête safetensors du checkpoint FP8 — quelles clés de scale ? CPU only."""
    import json
    import struct
    from collections import Counter

    path = CHECKPOINT_PATH
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(n))
    header.pop("__metadata__", None)

    dtypes = Counter(v["dtype"] for v in header.values())
    weight_keys = [k for k in header if k.endswith(".weight")]
    fp8_weights = [k for k in weight_keys if header[k]["dtype"] in ("F8_E4M3", "F8_E4M3FN")]
    weight_scale_keys = [k for k in header if k.endswith(".weight_scale")]
    input_scale_keys = [k for k in header if k.endswith(".input_scale")]

    # Combien de poids FP8 ont un .weight_scale frère ?
    ws_prefixes = {k.removesuffix(".weight_scale") for k in weight_scale_keys}
    fp8_with_scale = [k for k in fp8_weights if k.removesuffix(".weight") in ws_prefixes]
    fp8_without_scale = [k for k in fp8_weights if k.removesuffix(".weight") not in ws_prefixes]

    return {
        "total_tensors": len(header),
        "dtype_counts": dict(dtypes),
        "n_weight": len(weight_keys),
        "n_fp8_weight": len(fp8_weights),
        "n_weight_scale": len(weight_scale_keys),
        "n_input_scale": len(input_scale_keys),
        "n_fp8_with_scale": len(fp8_with_scale),
        "n_fp8_without_scale": len(fp8_without_scale),
        "sample_fp8_without_scale": fp8_without_scale[:15],
        "sample_fp8_with_scale": fp8_with_scale[:5],
        "sample_input_scale": input_scale_keys[:5],
    }


@app.local_entrypoint()
def inspect_fp8_keys():
    """Usage: modal run modal_app/ltx_video.py::inspect_fp8_keys"""
    import json
    print(json.dumps(_inspect_fp8_keys.remote(), indent=2))


@app.function(image=LTX23_IMAGE, volumes={CACHE_DIR: hf_volume}, timeout=120)
def _list_checkpoints():
    """Liste les .safetensors du volume — CPU only, pas de GPU."""
    import os
    out = {}
    for d in ("/cache/ltx23-base", "/cache/ltx23-distilled"):
        if os.path.isdir(d):
            entries = []
            for name in sorted(os.listdir(d)):
                p = os.path.join(d, name)
                size = os.path.getsize(p) if os.path.isfile(p) else None
                entries.append(f"{name}" + (f"  ({size/1e9:.2f} GB)" if size else "  [dir]"))
            out[d] = entries
        else:
            out[d] = "ABSENT"
    return out


@app.local_entrypoint()
def list_checkpoints():
    """Usage: modal run modal_app/ltx_video.py::list_checkpoints"""
    for d, entries in _list_checkpoints.remote().items():
        print(f"\n{'='*60}\n{d}:")
        if isinstance(entries, list):
            for e in entries:
                print(f"  {e}")
        else:
            print(f"  {entries}")
