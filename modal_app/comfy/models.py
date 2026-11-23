"""CPU-only, explicit preparation. Reuse verified lab files rather than downloading again."""
import hashlib
import json
import os
import shutil
from pathlib import Path

HF_HOST = "https://huggingface.co"


def _marker_name(runtime: str) -> str:
    return ".h3-verified.json" if runtime == "h3-video@1" else f".{runtime.split('@')[0]}-verified.json"


def _write_marker(destination: Path, catalog_path: Path, catalog: dict) -> None:
    (destination / _marker_name(catalog["runtime"])).write_text(json.dumps({
        "catalog_sha256": hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
        "runtime": catalog["runtime"],
    }))


def prepare(source: Path, destination: Path, catalog_path: Path):
    catalog = json.loads(catalog_path.read_text())
    for model in catalog["models"]:
        origin, target = source / model["path"], destination / model["path"]
        if not origin.is_file() or origin.stat().st_size != model["bytes"]:
            raise ValueError(f"MISSING_MODEL: {model['path']}")
        digest = hashlib.sha256()
        with origin.open("rb") as stream:
            for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != model["sha256"]:
            raise ValueError(f"MODEL_HASH_MISMATCH: {model['path']}")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, target)
    _write_marker(destination, catalog_path, catalog)


def pinned_url(model: dict) -> str:
    """Only Hugging Face, only a full 40-hex revision, only a relative source path from the catalog."""
    revision, source, repo = model["revision"], model["source"], model["repo"]
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("UNPINNED_REVISION")
    if source.startswith("/") or ".." in source.split("/") or repo.count("/") != 1 or ".." in repo:
        raise ValueError("INVALID_SOURCE")
    return f"{HF_HOST}/{repo}/resolve/{revision}/{source}"


def download(destination: Path, catalog_path: Path, fetch) -> None:
    """Download each catalog file at its pinned revision into a temporary name, verify size and SHA-256,
    then move it into place. Any mismatch deletes the partial file and fails closed (no marker written).
    `fetch(url)` returns an iterator of byte chunks; injected for tests."""
    catalog = json.loads(catalog_path.read_text())
    if catalog.get("custom_nodes"):
        raise ValueError("CUSTOM_NODES_NOT_ALLOWED")
    for model in catalog["models"]:
        if not str(model.get("license", "")).startswith("apache-2.0"):
            raise ValueError(f"LICENCE_NOT_APPROVED: {model['path']}")
        target = destination / model["path"]
        if target.is_file() and target.stat().st_size == model["bytes"] and _sha256(target) == model["sha256"]:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + ".partial")
        digest, size = hashlib.sha256(), 0
        try:
            with partial.open("wb") as out:
                for chunk in fetch(pinned_url(model)):
                    size += len(chunk)
                    if size > model["bytes"]:
                        raise ValueError(f"MODEL_TOO_LARGE: {model['path']}")
                    digest.update(chunk)
                    out.write(chunk)
            if size != model["bytes"] or digest.hexdigest() != model["sha256"]:
                raise ValueError(f"MODEL_HASH_MISMATCH: {model['path']}")
            os.replace(partial, target)
        finally:
            if partial.exists():
                partial.unlink()
    _write_marker(destination, catalog_path, catalog)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
