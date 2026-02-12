import base64
import json
import mimetypes
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Dict
from urllib import error as urlerror
from urllib import request as urlrequest

PIPELINE_NAME = "openai_gpt52"
DEFAULT_TIMEOUT_SEC = 30
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.2")
OPENAI_MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "3"))
OPENAI_BACKOFF_BASE_SEC = float(os.getenv("OPENAI_BACKOFF_BASE_SEC", "1.0"))


def _extract_text(payload: Dict[str, Any]) -> str:
    text = payload.get("output_text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    chunks = []
    for item in payload.get("output") or []:
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                ctext = content.get("text")
                if ctext:
                    chunks.append(ctext.strip())
    return "\n".join([c for c in chunks if c]).strip()


def _request_once(image_path: str, api_key: str, timeout_sec: int) -> str:
    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    with open(image_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    body = {
        "model": OPENAI_MODEL,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Extract all visible garment-care/tag text verbatim. "
                            "Return plain text only with no commentary."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime_type};base64,{encoded}",
                    },
                ],
            }
        ],
    }

    req = urlrequest.Request(
        "https://api.openai.com/v1/responses",
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


def _do_request_with_retries(image_path: str, api_key: str, timeout_sec: int) -> str:
    attempts = max(1, OPENAI_MAX_RETRIES + 1)

    for attempt_idx in range(attempts):
        try:
            return _request_once(image_path, api_key, timeout_sec)
        except urlerror.HTTPError as exc:
            if exc.code != 429 or attempt_idx >= attempts - 1:
                raise
            time.sleep(OPENAI_BACKOFF_BASE_SEC * (2 ** attempt_idx))

    return ""


def run(image_path: str) -> Dict[str, Any]:
    start = time.perf_counter()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    timeout_sec = int(os.getenv("OPENAI_TIMEOUT_SEC", str(DEFAULT_TIMEOUT_SEC)))

    if not api_key:
        return {
            "pipeline": PIPELINE_NAME,
            "status": "SKIPPED_MISSING_KEY",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": "OPENAI_API_KEY is not set",
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
            future = executor.submit(_do_request_with_retries, image_path, api_key, timeout_sec)
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
