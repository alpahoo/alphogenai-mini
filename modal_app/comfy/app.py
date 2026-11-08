"""Manual deployment only: modal deploy -m modal_app.comfy.app --env <isolated-env>.

Nothing in this module calls an executor or creates an authorization permit at import.
"""
import os
import secrets

import modal

REGION = os.environ.get("H3_MODAL_REGION")
if not REGION:
    raise RuntimeError("Set H3_MODAL_REGION to the privately approved compute region before loading this app")
app = modal.App("alphogenai-comfy")
runtime_environment = {
    "H3_MODAL_REGION": REGION,
    "H3_SOURCE_ENVIRONMENT": os.environ.get("H3_SOURCE_ENVIRONMENT", "main"),
    "H3_MODELS_VOLUME": os.environ.get("H3_MODELS_VOLUME", "alphogenai-comfy-models"),
}
volume = modal.Volume.from_name(os.environ.get("H3_MODELS_VOLUME", "alphogenai-comfy-models"), create_if_missing=False)
cpu_image = (modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")
             .pip_install("supabase==2.28.0", "requests==2.32.5", "fastapi==0.121.1", "av==17.0.0")
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


@app.function(image=gpu_image, gpu="H100", cpu=(2, 2), memory=(65536, 65536),
              volumes={"/models": volume.with_mount_options(read_only=True)},
              secrets=[], block_network=True, restrict_modal_access=True,
              single_use_containers=True, min_containers=0, max_containers=1,
              timeout=180, startup_timeout=120, retries=0, region=REGION)
def execute_graph(graph: dict, reference: bytes | None):
    from modal_app.comfy.executor import execute
    return execute(graph, reference)


@app.function(image=cpu_image, secrets=[broker_secret], timeout=420, retries=0, max_containers=1, region=REGION)
def broker(run_id: str):
    from modal_app.comfy.broker import database, run

    def invoke(graph, reference, run_id):
        call = execute_graph.spawn(graph, reference)
        try:
            database().table("comfy_runs").update({"modal_call_id": call.object_id}).eq("id", run_id).execute()
            return call.get(timeout=310)
        finally:
            # Also kill ComfyUI subprocesses; default cancel does not terminate a container.
            call.cancel(terminate_containers=True)
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
