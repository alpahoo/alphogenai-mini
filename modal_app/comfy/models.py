"""CPU-only, explicit preparation. Reuse verified lab files rather than downloading again."""
import hashlib
import json
import shutil
from pathlib import Path


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
    (destination / ".h3-verified.json").write_text(json.dumps({
        "catalog_sha256": hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
        "runtime": catalog["runtime"],
    }))
