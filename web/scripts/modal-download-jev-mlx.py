"""Stage the public 4-bit Jev-Omni MLX checkpoint on a Modal Volume.

Run: modal run scripts/modal-download-jev-mlx.py::prepare
Then: modal volume get collections-jev-omni-weights /jev-omni-mlx-4bit ~/.cache
"""

from pathlib import Path

import modal

MODEL_DIR = Path("/models/jev-omni-mlx-4bit")
WEIGHTS = modal.Volume.from_name("collections-jev-omni-weights")
app = modal.App("collections-jev-omni-mlx-download")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install("huggingface_hub[hf_xet]")
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})
)


@app.function(image=image, volumes={"/models": WEIGHTS}, cpu=4, memory=8192, timeout=1800)
def download() -> dict:
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id="Ruiruiz30/Jev-Omni-MLX-4bit",
        local_dir=MODEL_DIR,
        allow_patterns=["*.json", "*.jinja", "weights-*.safetensors", "decision_head/*.safetensors"],
    )
    WEIGHTS.commit()
    files = [path for path in MODEL_DIR.rglob("*") if path.is_file() and ".cache" not in path.parts]
    return {"files": len(files), "bytes": sum(path.stat().st_size for path in files)}


@app.local_entrypoint()
def prepare() -> None:
    print(download.remote())
