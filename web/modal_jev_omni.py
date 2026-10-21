"""On-demand Jev-Omni image classification on Modal.

Prepare weights once on CPU: modal run modal_jev_omni.py::prepare
Deploy both cold-start variants: modal deploy modal_jev_omni.py
Benchmark with scripts/benchmark-modal-jev.py.
"""

from __future__ import annotations

import base64
import json
import tempfile
import time
import uuid
from pathlib import Path

import modal

APP_NAME = "collections-jev-omni"
MODEL_REPO = "akhilaaa3/Jev-Omni"
MODEL_REVISION = "5addda86ddee081a68fb067477ea100c221b8917"
MODEL_DIR = Path("/models/jev-omni")
WEIGHTS = modal.Volume.from_name("collections-jev-omni-weights", create_if_missing=True)
app = modal.App(APP_NAME)

download_image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install("huggingface_hub[hf_xet]")
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})
)

inference_image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "torch>=2.10,<2.11",
        "torchvision",
        "transformers==5.17.0",
        "accelerate",
        "huggingface_hub",
        "safetensors",
        "numpy",
        "Pillow",
        "opencv-python-headless",
        "soundfile",
        "librosa",
        "fastapi[standard]",
    )
    .env({"HF_HUB_OFFLINE": "1"})
)


@app.function(
    image=download_image,
    volumes={"/models": WEIGHTS},
    cpu=4,
    memory=32768,
    timeout=3600,
)
def download_weights() -> dict[str, str | int]:
    from huggingface_hub import snapshot_download

    path = snapshot_download(
        repo_id=MODEL_REPO,
        revision=MODEL_REVISION,
        local_dir=MODEL_DIR,
        allow_patterns=[
            "config.json",
            "generation_config.json",
            "model*.safetensors*",
            "processor_config.json",
            "tokenizer.json",
            "tokenizer_config.json",
            "chat_template.jinja",
            "decision_config.json",
            "head.pt",
            "jev_omni.py",
        ],
    )
    WEIGHTS.commit()
    return {"path": path, "model_bytes": (MODEL_DIR / "model.safetensors").stat().st_size}


@app.local_entrypoint()
def prepare() -> None:
    print(download_weights.remote())


def load_model():
    import sys

    import torch
    import transformers
    from transformers import AutoConfig, AutoProcessor

    sys.path.insert(0, str(MODEL_DIR))
    from jev_omni import JevOmni, _Head256, _find_backbone

    config = AutoConfig.from_pretrained(MODEL_DIR)
    model = getattr(transformers, config.architectures[0]).from_pretrained(
        MODEL_DIR, dtype=torch.bfloat16, device_map="cuda"
    ).eval()
    decision = json.loads((MODEL_DIR / "decision_config.json").read_text())
    head = _Head256(decision["hidden_size"]).to("cuda").eval()
    head.load_state_dict(torch.load(MODEL_DIR / "head.pt", map_location="cuda", weights_only=True))
    _, decoder = _find_backbone(model)
    return JevOmni(model, head, AutoProcessor.from_pretrained(MODEL_DIR), decoder, "cuda")


class ClassifierMixin:
    def _load(self) -> None:
        started = time.perf_counter()
        self.classifier = load_model()
        self.load_seconds = time.perf_counter() - started
        self.container_id = uuid.uuid4().hex[:12]

    def _classify(self, item: dict) -> dict:
        object_name = item.get("object")
        encoded = item.get("image_base64")
        if not isinstance(object_name, str) or not 2 <= len(object_name.strip()) <= 80:
            raise ValueError("object must be a string of 2-80 characters")
        if not isinstance(encoded, str) or len(encoded) > 4_000_000:
            raise ValueError("image_base64 must be a base64 string under 4 MB")
        image = base64.b64decode(encoded, validate=True)
        with tempfile.NamedTemporaryFile(suffix=".jpg") as file:
            file.write(image)
            file.flush()
            question = (
                f"Does this image visibly contain {object_name.strip()}? Answer yes only when the object "
                "can be identified in the pixels, not inferred from text or context."
            )
            started = time.perf_counter()
            result = self.classifier.predict(
                state="Classify only the supplied post image or the first video frame.",
                question=question,
                options=["Yes", "No"],
                media=file.name,
                modality="image",
            )
            inference_seconds = time.perf_counter() - started
        return {
            "answer": result["prediction"],
            "confidence": result["confidence"],
            "probabilities": result["probabilities"],
            "inference_seconds": inference_seconds,
            "load_seconds": self.load_seconds,
            "container_id": self.container_id,
            "revision": MODEL_REVISION,
        }


common = dict(
    image=inference_image,
    gpu="L40S",
    volumes={"/models": WEIGHTS},
    min_containers=0,
    max_containers=1,
    scaledown_window=10,
    startup_timeout=900,
    timeout=120,
)


@app.cls(**common)
class JevOmniPlain(ClassifierMixin):
    @modal.enter()
    def setup(self) -> None:
        self._load()

    @modal.method()
    def classify(self, item: dict) -> dict:
        return self._classify(item)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def classify_http(self, item: dict) -> dict:
        return self._classify(item)


@app.cls(
    **common,
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
)
class JevOmniSnapshot(ClassifierMixin):
    @modal.enter(snap=True)
    def setup(self) -> None:
        self._load()

    @modal.enter(snap=False)
    def after_restore(self) -> None:
        self.container_id = uuid.uuid4().hex[:12]

    @modal.method()
    def classify(self, item: dict) -> dict:
        return self._classify(item)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def classify_http(self, item: dict) -> dict:
        return self._classify(item)
