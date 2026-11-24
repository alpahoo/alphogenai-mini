"""Manual deployment only: modal deploy -m modal_app.comfy.app --env <isolated-env>.

Nothing in this module calls an executor or creates an authorization permit at import.
"""
import os
import secrets

import modal

from modal_app.comfy.avatar import AVATAR_RUNTIME, REPO_DIR as AVATAR_REPO_DIR, UPSTREAM_SHA as AVATAR_UPSTREAM_SHA, WEIGHTS_ROOT as AVATAR_WEIGHTS_ROOT, WEIGHTS_VOLUME_DEFAULT

REGION = os.environ.get("H3_MODAL_REGION")
if not REGION:
    raise RuntimeError("Set H3_MODAL_REGION to the privately approved compute region before loading this app")


# MOSS executor GPU, chosen explicitly at deploy time. L40S by default; H100 only when selected.
# Any other value stops the app from loading (no deploy, no GPU). There is no fallback between GPUs:
# the broker submits only to the selected executor. H3 (execute_graph) is not affected.
MOSS_EXECUTOR_GPUS = ("L40S", "H100")


def select_moss_executor_gpu(value: str | None) -> str:
    if value is None or value == "":
        return "L40S"
    if value not in MOSS_EXECUTOR_GPUS:
        raise RuntimeError("MOSS_EXECUTOR_GPU must be L40S or H100")
    return value


MOSS_EXECUTOR_GPU = select_moss_executor_gpu(os.environ.get("MOSS_EXECUTOR_GPU"))
app = modal.App("alphogenai-comfy")
runtime_environment = {
    "H3_MODAL_REGION": REGION,
    "H3_SOURCE_ENVIRONMENT": os.environ.get("H3_SOURCE_ENVIRONMENT", "main"),
    "H3_MODELS_VOLUME": os.environ.get("H3_MODELS_VOLUME", "alphogenai-comfy-models"),
    # Same selection inside the deployed containers as at deploy time.
    "MOSS_EXECUTOR_GPU": MOSS_EXECUTOR_GPU,
}
# Hosted staging rehearsal without a GPU (see modal_app/comfy/avatar.py::simulation_enabled): forwarded only when set at deploy time.
runtime_environment.update({k: os.environ[k] for k in ("AVATAR_SIMULATE", "AVATAR_SIMULATE_SUPABASE_REF") if k in os.environ})
volume = modal.Volume.from_name(os.environ.get("H3_MODELS_VOLUME", "alphogenai-comfy-models"), create_if_missing=False)
cpu_image = (modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")
             .pip_install("supabase==2.28.0", "requests==2.32.5", "fastapi==0.121.1", "av==17.0.0", "modal==1.6.3")
             .env(runtime_environment)
             .add_local_python_source("modal_app.comfy")
             .add_local_dir("workflows/comfy/runtimes", "/opt/comfy-catalog"))
gpu_image = (modal.Image.debian_slim(python_version="3.12")
             .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0")
             .run_commands("git clone --depth 1 --branch v0.42.0 https://github.com/Comfy-Org/ComfyUI /root/ComfyUI",
                           "pip install -r /root/ComfyUI/requirements.txt")
             .pip_install("requests==2.32.5", "fastapi==0.121.1")
             .env(runtime_environment)
             .add_local_python_source("modal_app.comfy")
             .add_local_dir("workflows/comfy/runtimes", "/opt/comfy-catalog"))
broker_secret = modal.Secret.from_name("alphogenai-comfy-broker")

# Capacity queue + GPU execution + transfer margin, all below the SQL 15-minute deadline.
# Queue time is not part of Modal's GPU execution timeout. H3 keeps its existing limits.
MOSS_START_WINDOW_SECONDS = 300
MOSS_COLLECT_TIMEOUT_SECONDS = 660
BROKER_TIMEOUT_SECONDS = 720


@app.function(image=gpu_image, gpu="H100", cpu=(2, 2), memory=(65536, 65536),
              volumes={"/models": volume.with_mount_options(read_only=True)},
              secrets=[], block_network=True, restrict_modal_access=True,
              single_use_containers=True, min_containers=0, max_containers=1,
              timeout=180, startup_timeout=120, region=REGION)
def execute_graph(graph: dict, reference: bytes | None, start_before: float):
    import time
    from modal_app.comfy.executor import execute
    from modal_app.comfy.transfer import output_frames
    # Publish the cancellation handle before ComfyUI starts. Small stream frames
    # stay on Modal's invocation channel, avoiding BlobCreate under restricted access.
    yield {"call_id": modal.current_function_call_id()}
    if time.time() >= start_before:
        raise TimeoutError("EXECUTOR_START_EXPIRED")
    yield from output_frames(execute(graph, reference))


# MOSS-Image text to image. Same isolation as H3: no secrets, no network, read-only verified volume,
# single-use container, one at a time. Separate function so the H3 executor definition stays unchanged.
@app.function(image=gpu_image, gpu="L40S", cpu=(2, 2), memory=(32768, 32768),
              volumes={"/models": volume.with_mount_options(read_only=True)},
              secrets=[], block_network=True, restrict_modal_access=True,
              single_use_containers=True, min_containers=0, max_containers=1,
              timeout=300, startup_timeout=120, region=REGION)
def execute_image_graph(graph: dict, start_before: float):
    import time
    from modal_app.comfy.executor import execute
    from modal_app.comfy.transfer import output_frames
    yield {"call_id": modal.current_function_call_id()}
    if time.time() >= start_before:
        raise TimeoutError("EXECUTOR_START_EXPIRED")
    yield from output_frames(execute(graph, None, runtime="moss-image@1"))


# MOSS-Image on H100: identical to execute_image_graph except the GPU type. Same isolation, same
# 300 s executor timeout and late-start guard, same region. Invoked only when MOSS_EXECUTOR_GPU=H100.
@app.function(image=gpu_image, gpu="H100", cpu=(2, 2), memory=(32768, 32768),
              volumes={"/models": volume.with_mount_options(read_only=True)},
              secrets=[], block_network=True, restrict_modal_access=True,
              single_use_containers=True, min_containers=0, max_containers=1,
              timeout=300, startup_timeout=120, region=REGION)
def execute_image_graph_h100(graph: dict, start_before: float):
    import time
    from modal_app.comfy.executor import execute
    from modal_app.comfy.transfer import output_frames
    yield {"call_id": modal.current_function_call_id()}
    if time.time() >= start_before:
        raise TimeoutError("EXECUTOR_START_EXPIRED")
    yield from output_frames(execute(graph, None, runtime="moss-image@1"))


# LongCat-Video-Avatar 1.6 (talking avatar, PR #124 POC recipe): H100, INT8, distilled 8 steps, 480p.
# Same isolation as the other executors (no secrets, no network, no Modal access, read-only weights volume) with one
# deliberate difference: the container is NOT single-use. It scales to zero after AVATAR_SCALEDOWN_SECONDS without a
# request, and a warm container may serve the next request of the same private admin gate. Each run works in a fresh
# private directory that is wiped afterwards (modal_app/comfy/avatar.py). Model load is ~170 s, so reuse inside the
# window only skips the container start; the weights are re-read per run (the in-memory model reuse is a later step).
AVATAR_SCALEDOWN_SECONDS = 60
AVATAR_START_WINDOW_SECONDS = 300
AVATAR_COLLECT_TIMEOUT_SECONDS = 660
AVATAR_EXECUTOR_TIMEOUT_SECONDS = 720
AVATAR_FLASH_ATTN_WHEEL = ("https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/"
                           "flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp310-cp310-linux_x86_64.whl")
avatar_volume = modal.Volume.from_name(os.environ.get("AVATAR_WEIGHTS_VOLUME", WEIGHTS_VOLUME_DEFAULT),
                                       environment_name=os.environ.get("H3_SOURCE_ENVIRONMENT", "main"),
                                       create_if_missing=False)
avatar_image = (modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04", add_python="3.10")
                .apt_install("git", "ffmpeg", "libsndfile1", "libgl1", "libglib2.0-0")
                .pip_install("torch==2.6.0", "torchvision==0.21.0", "torchaudio==2.6.0",
                             extra_index_url="https://download.pytorch.org/whl/cu124")
                .pip_install(AVATAR_FLASH_ATTN_WHEEL)
                .run_commands(
                    f"git clone https://github.com/meituan-longcat/LongCat-Video.git {AVATAR_REPO_DIR}",
                    f"git -C {AVATAR_REPO_DIR} checkout {AVATAR_UPSTREAM_SHA}",
                    # Deliberate differences from upstream requirements: torch/flash-attn installed above, streamlit (UI)
                    # not needed, libsndfile1 comes from apt, tritonserverclient==0.0.6 does not exist on PyPI and is
                    # never imported.
                    f"cd {AVATAR_REPO_DIR} && grep -v -E '^(torch|flash-attn|streamlit)==' requirements.txt > /tmp/req.txt",
                    f"cd {AVATAR_REPO_DIR} && grep -v -E '^(libsndfile1|tritonserverclient)==' requirements_avatar.txt > /tmp/req_avatar.txt",
                    "pip install -r /tmp/req.txt -r /tmp/req_avatar.txt")
                .pip_install("requests==2.32.5", "fastapi==0.121.1")
                .env(runtime_environment)
                .add_local_python_source("modal_app.comfy"))


# Memory: (request, LIMIT) in MiB. The first real staging render (2026-11-24) was killed with SIGKILL / exit 137 about two minutes in,
# while loading the 47 GB of weights, under a hard limit equal to the request (65536). The POC, which worked, passed a plain request.
@app.function(image=avatar_image, gpu="H100", cpu=(8, 8), memory=(65536, 131072),
              volumes={AVATAR_WEIGHTS_ROOT: avatar_volume.with_mount_options(read_only=True)},
              secrets=[], block_network=True, restrict_modal_access=True,
              min_containers=0, max_containers=1, scaledown_window=AVATAR_SCALEDOWN_SECONDS,
              timeout=AVATAR_EXECUTOR_TIMEOUT_SECONDS, startup_timeout=300, region=REGION)
def execute_avatar(payload: dict, start_before: float):
    import time
    from modal_app.comfy.avatar import execute
    from modal_app.comfy.transfer import output_frames
    # Publish the cancellation handle before the GPU work starts, exactly like the MOSS executors.
    yield {"call_id": modal.current_function_call_id()}
    if time.time() >= start_before:
        raise TimeoutError("EXECUTOR_START_EXPIRED")
    yield from output_frames(execute(payload))


def moss_executor(gpu: str | None = None):
    """The single MOSS executor for the deployed selection. Never another GPU, never H3's executor."""
    gpu = select_moss_executor_gpu(MOSS_EXECUTOR_GPU if gpu is None else gpu)
    return {"L40S": execute_image_graph, "H100": execute_image_graph_h100}[gpu]


@app.function(image=cpu_image, secrets=[broker_secret], timeout=BROKER_TIMEOUT_SECONDS, retries=0, max_containers=1, region=REGION)
def broker(run_id: str):
    from modal_app.comfy.broker import database, run

    def invoke(graph, reference, run_id, runtime="h3-video@1"):
        import asyncio
        import time
        from modal_app.comfy.transfer import receive_output

        if runtime == AVATAR_RUNTIME:
            from modal_app.comfy.avatar import simulated_output, simulation_enabled
            if simulation_enabled():
                return simulated_output(graph)  # staging rehearsal only: no GPU is submitted
            # `graph` is the avatar payload here (image, 16 kHz WAV, prompt, seed, segments), already validated by the
            # broker. Same bounded start window, call-id persistence and confirmed cancellation as MOSS.
            from modal_app.comfy.moss_queue import collect_moss
            def save_avatar_call_id(call_id):
                database().table("comfy_runs").update({"modal_call_id": call_id}).eq("id", run_id).execute()
            return asyncio.run(collect_moss(execute_avatar, graph, save_avatar_call_id,
                                           AVATAR_START_WINDOW_SECONDS, AVATAR_COLLECT_TIMEOUT_SECONDS))

        if runtime == "moss-image@1":
            from modal_app.comfy.moss_queue import collect_moss
            if reference is not None:
                raise ValueError("REFERENCE_NOT_SUPPORTED")
            def save_call_id(call_id):
                database().table("comfy_runs").update({"modal_call_id": call_id}).eq("id", run_id).execute()
            return asyncio.run(collect_moss(moss_executor(), graph, save_call_id,
                                           MOSS_START_WINDOW_SECONDS, MOSS_COLLECT_TIMEOUT_SECONDS))

        async def collect():
            call = None
            stream = execute_graph.remote_gen.aio(graph, reference, time.time() + 110)
            budget = 310
            try:
                async with asyncio.timeout(budget):
                    header = await anext(stream)
                    if not isinstance(header, dict) or not str(header.get("call_id", "")).startswith("fc-"):
                        raise ValueError("INVALID_EXECUTOR_HANDLE")
                    call_id = header["call_id"]
                    call = modal.FunctionCall.from_id(call_id)
                    # from_id creates a lazy handle: object_id is unavailable until
                    # hydration. Persist the ID already supplied by the executor.
                    database().table("comfy_runs").update({"modal_call_id": call_id}).eq("id", run_id).execute()
                    return await receive_output(stream)
            finally:
                # Also kill ComfyUI subprocesses; default cancel does not terminate a container.
                if call is not None:
                    await call.cancel.aio(terminate_containers=True)
                await stream.aclose()

        return asyncio.run(collect())
    run(run_id, invoke)


@app.function(image=cpu_image, secrets=[broker_secret], timeout=30, region=REGION)
@modal.fastapi_endpoint(method="POST")
def dispatch(body: dict, request: "Request"):
    import uuid
    from fastapi import HTTPException
    expected = os.environ.get("COMFY_DISPATCH_SECRET", "")
    if not expected or not secrets.compare_digest(request.headers.get("x-comfy-secret", ""), expected):
        raise HTTPException(401, "Unauthorized")
    try:
        run_id = str(uuid.UUID(body["run_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(400, "Invalid run")
    broker.spawn(run_id)
    return {"accepted": True}


# FastAPI resolves the endpoint annotation at deployment, not on an executor.
from fastapi import Request  # noqa: E402


@app.function(image=cpu_image, timeout=1800, retries=0, region=REGION,
              volumes={"/lab-models": modal.Volume.from_name("h3-lab-models", environment_name=os.environ.get("H3_SOURCE_ENVIRONMENT", "main")).with_mount_options(read_only=True),
                       "/models": volume})
def prepare_models():
    """Paid CPU operation: requires separate owner approval; never called by dispatch."""
    from pathlib import Path
    from modal_app.comfy.models import prepare
    prepare(Path("/lab-models"), Path("/models"), Path("/opt/comfy-catalog/h3-video@1.json"))
    volume.commit()


@app.function(image=cpu_image, timeout=3600, retries=0, region=REGION, volumes={"/models": volume})
def prepare_moss_models():
    """Paid CPU operation and ~15.4 GB download: requires separate owner approval; never called by dispatch.
    Downloads each catalogued file at its pinned revision, verifies size and SHA-256, then writes the marker."""
    from pathlib import Path
    import requests
    from modal_app.comfy.models import download

    def fetch(url):
        with requests.get(url, stream=True, timeout=60, allow_redirects=True) as response:
            response.raise_for_status()
            yield from response.iter_content(8 * 1024 * 1024)

    download(Path("/models"), Path("/opt/comfy-catalog/moss-image@1.json"), fetch)
    volume.commit()
