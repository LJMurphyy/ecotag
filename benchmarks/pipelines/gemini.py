import base64
import json
import mimetypes
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Dict
from urllib import error as urlerror
from urllib import request as urlrequest

PIPELINE_NAME = "gemini"
DEFAULT_TIMEOUT_SEC = 30
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


def _extract_text(payload: Dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    chunks = []
    for candidate in candidates:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            text = part.get("text")
            if text:
                chunks.append(text.strip())
    return "\n".join([c for c in chunks if c]).strip()


def _do_request(image_path: str, api_key: str, timeout_sec: int) -> str:
    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    with open(image_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Extract all visible garment-care/tag text verbatim. "
                            "Return plain text only with no commentary."
                        )
                    },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": encoded,
                        }
                    },
                ]
            }
        ]
    }

    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={api_key}"
    )
    req = urlrequest.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urlrequest.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read().decode("utf-8")
    payload = json.loads(raw)
    return _extract_text(payload)


def run(image_path: str) -> Dict[str, Any]:
    start = time.perf_counter()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    timeout_sec = int(os.getenv("GEMINI_TIMEOUT_SEC", str(DEFAULT_TIMEOUT_SEC)))

    if not api_key:
        return {
            "pipeline": PIPELINE_NAME,
            "status": "SKIPPED_MISSING_KEY",
            "text": "",
            "latency_sec": round(time.perf_counter() - start, 4),
            "error": "GEMINI_API_KEY is not set",
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
