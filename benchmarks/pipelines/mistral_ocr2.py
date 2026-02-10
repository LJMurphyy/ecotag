import base64
import json
import mimetypes
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Dict
from urllib import error as urlerror
from urllib import request as urlrequest

PIPELINE_NAME = "mistral_ocr2"
DEFAULT_TIMEOUT_SEC = 30
MISTRAL_MODEL = os.getenv("MISTRAL_OCR_MODEL", "mistral-ocr-latest")


def _extract_text(payload: Dict[str, Any]) -> str:
    chunks = []

    # Newer response shapes
    for page in payload.get("pages") or []:
        page_text = page.get("markdown") or page.get("text") or ""
        if page_text:
            chunks.append(page_text.strip())

    # Fallback response shapes
    if not chunks:
        output = payload.get("output") or {}
        text = output.get("text") or ""
        if text:
            chunks.append(text.strip())

    if not chunks and isinstance(payload.get("text"), str):
        chunks.append(payload["text"].strip())

    return "\n".join([c for c in chunks if c]).strip()


def _do_request(image_path: str, api_key: str, timeout_sec: int) -> str:
    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    with open(image_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    body = {
        "model": MISTRAL_MODEL,
        "document": {
            "type": "image_url",
            "image_url": f"data:{mime_type};base64,{encoded}",
        },
    }

    req = urlrequest.Request(
        "https://api.mistral.ai/v1/ocr",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urlrequest.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read().decode("utf-8")
    payload = json.loads(raw)
    return _extract_text(payload)


def run(image_path: str) -> Dict[str, Any]:
    start = time.perf_counter()
    api_key = os.getenv("MISTRAL_API_KEY", "").strip()
    timeout_sec = int(os.getenv("MISTRAL_TIMEOUT_SEC", str(DEFAULT_TIMEOUT_SEC)))

    if not api_key:
        return {
            "pipeline": PIPELINE_NAME,
            "status": "SKIPPED_MISSING_KEY",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": "MISTRAL_API_KEY is not set",
        }

    if not os.path.exists(image_path):
        return {
            "pipeline": PIPELINE_NAME,
            "status": "ERROR",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": f"Image not found: {image_path}",
        }

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_request, image_path, api_key, timeout_sec)
            text = future.result(timeout=timeout_sec)

        status = "SUCCESS" if text else "OCR_FAIL"
        return {
            "pipeline": PIPELINE_NAME,
            "status": status,
            "text": text or "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": "",
        }
    except FutureTimeout:
        return {
            "pipeline": PIPELINE_NAME,
            "status": "TIMEOUT",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": f"Timed out after {timeout_sec}s",
        }
    except urlerror.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8")[:500]
        except Exception:
            detail = ""
        return {
            "pipeline": PIPELINE_NAME,
            "status": "ERROR",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": f"HTTP {exc.code}: {detail}".strip(),
        }
    except urlerror.URLError as exc:
        return {
            "pipeline": PIPELINE_NAME,
            "status": "ERROR",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": f"Network error: {exc.reason}",
        }
    except Exception as exc:
        return {
            "pipeline": PIPELINE_NAME,
            "status": "ERROR",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": str(exc),
        }
