"""Run Jev-Omni's trained yes/no decision head locally with 4-bit MLX weights.

Download the matching conversion to ~/.cache/jev-omni-mlx-4bit, then run:
  .venv-jev-local/bin/python scripts/local-jev-omni.py
"""

import argparse
import base64
import json
import time
from io import BytesIO
from pathlib import Path
from threading import Lock
from urllib.request import urlopen

import mlx.core as mx
from mlx_vlm.models.gemma4_unified.processing_gemma4_unified import Gemma4UnifiedProcessor
from mlx_vlm.utils import load_model, prepare_inputs
from PIL import Image

SAMPLE_IMAGE = "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=512&q=80"
STATE = "Classify only the supplied post image or the first video frame."


def classify(model, processor, head, image, object_name, image_tokens):
    question = (
        f"Does this image visibly contain {object_name}? Answer yes only when the object "
        "can be identified in the pixels, not inferred from text or context."
    )
    prompt = (
        f"{STATE}\n\n---\n\nQUESTION: {question}\n\nOPTIONS:\n1. Yes\n2. No\n\n"
        "Reply with only the number of the correct option (1-2).\n"
        "Output a single number and nothing else."
    )
    processor.image_processor.max_soft_tokens = image_tokens
    processor.image_seq_length = image_tokens
    formatted = processor.apply_chat_template(
        [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": prompt}]}],
        add_generation_prompt=True,
        tokenize=False,
        enable_thinking=False,
    )
    started = time.perf_counter()
    inputs = prepare_inputs(processor, images=[image], prompts=formatted, add_special_tokens=False)
    inputs = {
        key: value.astype(mx.bfloat16)
        if isinstance(value, mx.array) and mx.issubdtype(value.dtype, mx.floating)
        else value
        for key, value in inputs.items()
    }
    ids = inputs["input_ids"]
    extra = {key: value for key, value in inputs.items() if key not in {"input_ids", "attention_mask"}}
    embedded = model.get_input_embeddings(input_ids=ids, **extra)
    hidden = model.language_model.model(
        inputs_embeds=embedded.inputs_embeds,
        per_layer_inputs=embedded.per_layer_inputs,
        mm_token_type_ids=inputs.get("mm_token_type_ids"),
    )
    features = (hidden[:, -1].astype(mx.float32) - head["mu"]) / head["sd"]
    logits = features @ head["linear.weight"][:2].T + head["linear.bias"][:2]
    probabilities = mx.softmax(logits, axis=-1)[0]
    mx.eval(probabilities)
    values = probabilities.tolist()
    return {
        "answer": "Yes" if values[0] >= values[1] else "No",
        "confidence": max(values),
        "probabilities": {"Yes": values[0], "No": values[1]},
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "image_tokens": image_tokens,
        "peak_metal_gb": round(mx.get_peak_memory() / 1e9, 3),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, default=Path.home() / ".cache/jev-omni-mlx-4bit")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--object", default="cat")
    parser.add_argument("--image-tokens", type=int, choices=[10, 20, 35, 70, 140, 280], default=280)
    parser.add_argument("--serve", action="store_true", help="Serve a local POST /classify API on 127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    started = time.perf_counter()
    mx.set_cache_limit(256 * 1024**2)
    model = load_model(args.model_dir, strict=True)
    processor = Gemma4UnifiedProcessor.from_pretrained(args.model_dir, trust_remote_code=False)
    head = mx.load(str(args.model_dir / "decision_head/weights.safetensors"))
    mx.eval(head)
    load_seconds = time.perf_counter() - started

    if args.serve:
        from fastapi import FastAPI, HTTPException
        from pydantic import BaseModel
        import uvicorn

        class Request(BaseModel):
            object: str
            image_base64: str

        server = FastAPI(title="Local Jev-Omni classifier")
        lock = Lock()

        @server.get("/health")
        def health():
            return {"ready": True, "model_load_seconds": round(load_seconds, 3)}

        @server.post("/classify")
        def classify_request(item: Request):
            if not 2 <= len(item.object.strip()) <= 80 or len(item.image_base64) > 4_000_000:
                raise HTTPException(400, "Invalid object or image size")
            try:
                image = Image.open(BytesIO(base64.b64decode(item.image_base64, validate=True))).convert("RGB")
            except Exception as error:
                raise HTTPException(400, "Invalid image_base64") from error
            with lock:
                return classify(model, processor, head, image, item.object.strip(), args.image_tokens)

        uvicorn.run(server, host="127.0.0.1", port=args.port)
        return

    if args.image:
        image = Image.open(args.image).convert("RGB")
    else:
        with urlopen(SAMPLE_IMAGE, timeout=30) as response:
            image = Image.open(BytesIO(response.read())).convert("RGB")
    first = classify(model, processor, head, image, args.object, args.image_tokens)
    second = classify(model, processor, head, image, args.object, args.image_tokens)
    print(json.dumps({"model_load_seconds": round(load_seconds, 3), "first": first, "second": second}, indent=2))


if __name__ == "__main__":
    main()
