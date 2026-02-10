import argparse
import csv
import importlib
import json
import os
import platform
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional, Tuple

import psutil

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(path: str) -> None:
        if not path or not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key or key in os.environ:
                    continue
                os.environ[key] = value.strip().strip('"').strip("'")


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
CODE_DIR = os.path.join(ROOT_DIR, "code")

sys.path.append(CODE_DIR)
sys.path.append(ROOT_DIR)

try:
    from calculate_co2 import estimate
    from schemas import MaterialComponent, TagRecord
    from tag_parser import parse_from_text
except ImportError as exc:
    print("CRITICAL ERROR: Could not import project modules from ./code")
    print(f"Python Error: {exc}")
    sys.exit(1)


ALLOWED_PIPELINES = ["gemini", "mistral_ocr2", "easyocr"]
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


class SystemSampler:
    def __init__(self, sample_interval_sec: float = 0.2):
        self.sample_interval_sec = sample_interval_sec
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.cpu_samples: List[float] = []
        self.rss_samples_mb: List[float] = []
        self.process = psutil.Process(os.getpid())

    def _run(self) -> None:
        while not self._stop.is_set():
            cpu = psutil.cpu_percent(interval=self.sample_interval_sec)
            rss_mb = self.process.memory_info().rss / (1024 * 1024)
            self.cpu_samples.append(float(cpu))
            self.rss_samples_mb.append(float(rss_mb))

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    def summary(self) -> Dict[str, float]:
        cpu_avg = statistics.mean(self.cpu_samples) if self.cpu_samples else 0.0
        rss_peak = max(self.rss_samples_mb) if self.rss_samples_mb else 0.0
        return {
            "cpu_avg_percent": round(cpu_avg, 3),
            "peak_rss_mb": round(rss_peak, 3),
            "samples": len(self.cpu_samples),
        }


def percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    rank = (len(values) - 1) * (p / 100.0)
    low = int(rank)
    high = min(low + 1, len(values) - 1)
    frac = rank - low
    sorted_vals = sorted(values)
    return sorted_vals[low] + (sorted_vals[high] - sorted_vals[low]) * frac


def normalize_origin(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def normalize_material_set(materials: List[MaterialComponent]) -> List[str]:
    return sorted({(m.fiber or "").strip().lower() for m in materials if (m.fiber or "").strip()})


def materials_to_str(materials: List[MaterialComponent]) -> str:
    items = [f"{m.fiber}:{round(float(m.pct), 2)}" for m in materials]
    return ";".join(items)


def load_manifest(manifest_path: str) -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(manifest_path):
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    with open(manifest_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            filename = (row.get("filename") or "").strip()
            if not filename:
                continue
            gt_origin = normalize_origin(row.get("gt_origin_country"))
            gt_materials = sorted(
                {
                    item.strip().lower()
                    for item in (row.get("gt_materials") or "").split(";")
                    if item.strip()
                }
            )
            out[filename] = {
                "gt_origin_country": gt_origin,
                "gt_materials": gt_materials,
            }
    return out


def _safe_pipeline_call(fn, image_path: str, pipeline_name: str) -> Dict[str, Any]:
    try:
        result = fn(image_path)
        if not isinstance(result, dict):
            raise TypeError("Pipeline returned non-dict response")
        return {
            "pipeline": pipeline_name,
            "status": result.get("status", "ERROR"),
            "text": result.get("text", "") or "",
            "latency_sec": float(result.get("latency_sec", 0.0) or 0.0),
            "error": result.get("error", "") or "",
        }
    except Exception as exc:
        return {
            "pipeline": pipeline_name,
            "status": "ERROR",
            "text": "",
            "latency_sec": 0.0,
            "error": str(exc),
        }


def get_pipeline_runners(selected: List[str]) -> Dict[str, Any]:
    runners: Dict[str, Any] = {}

    for name in selected:
        if name == "easyocr":
            runners[name] = build_easyocr_runner()
            continue
        module = importlib.import_module(f"benchmarks.pipelines.{name}")
        if not hasattr(module, "run"):
            raise ValueError(f"Pipeline module benchmarks.pipelines.{name} has no run(image_path)")
        runners[name] = module.run
    return runners


def build_easyocr_runner():
    lock = threading.Lock()
    state = {"reader": None}

    def run_easyocr(image_path: str) -> Dict[str, Any]:
        start = time.perf_counter()
        try:
            with lock:
                if state["reader"] is None:
                    import easyocr

                    state["reader"] = easyocr.Reader(["en"], gpu=False)

            result = state["reader"].readtext(image_path)
            text = " ".join([r[1] for r in result]) if result else ""
            status = "SUCCESS" if text else "OCR_FAIL"
            return {
                "pipeline": "easyocr",
                "status": status,
                "text": text,
                "latency_sec": round(time.perf_counter() - start, 4),
                "error": "",
            }
        except Exception as exc:
            return {
                "pipeline": "easyocr",
                "status": "ERROR",
                "text": "",
                "latency_sec": round(time.perf_counter() - start, 4),
                "error": str(exc),
            }

    return run_easyocr


def parse_record(text: str) -> Tuple[Optional[TagRecord], Optional[str], Optional[float]]:
    if not text:
        return None, None, None

    try:
        record = parse_from_text(text)
    except Exception:
        return None, None, None

    co2_total = None
    try:
        co2_total = float(estimate(record).total_kgco2e)
    except Exception:
        co2_total = None

    return record, normalize_origin(record.origin_country), co2_total


def record_has_fields(record: Optional[TagRecord]) -> bool:
    if not record:
        return False
    return bool(normalize_origin(record.origin_country) or normalize_material_set(record.materials))


def build_ensemble(
    mode: str,
    pipeline_order: List[str],
    results: Dict[str, Dict[str, Any]],
    records: Dict[str, Optional[TagRecord]],
) -> Dict[str, Any]:
    latencies = [float(results[name]["latency_sec"]) for name in pipeline_order if name in results]
    ensemble_latency = max(latencies) if latencies else 0.0

    if mode == "none":
        chosen_name = ""
        chosen_record = None
        chosen_text = ""
        for name in pipeline_order:
            if name in results and results[name].get("status") == "SUCCESS" and results[name].get("text"):
                chosen_name = name
                chosen_record = records.get(name)
                chosen_text = results[name].get("text", "")
                break
        status = "SUCCESS" if chosen_text else "OCR_FAIL"
        error = "" if chosen_name else "No successful pipeline text"
        return {
            "pipeline": "ensemble",
            "strategy": mode,
            "status": status,
            "latency_sec": round(ensemble_latency, 4),
            "text": chosen_text,
            "record": chosen_record,
            "source_pipeline": chosen_name,
            "error": error,
        }

    # field_union: deterministic merge by pipeline order.
    origin = ""
    merged_materials: List[MaterialComponent] = []
    seen_fibers = set()

    for name in pipeline_order:
        record = records.get(name)
        if not record:
            continue

        if not origin:
            origin = normalize_origin(record.origin_country)

        for material in record.materials:
            fiber = (material.fiber or "").strip().lower()
            if not fiber or fiber in seen_fibers:
                continue
            seen_fibers.add(fiber)
            merged_materials.append(MaterialComponent(fiber=fiber, pct=float(material.pct)))

    ensemble_record = TagRecord(materials=merged_materials, origin_country=origin or None)
    status = "SUCCESS" if (origin or merged_materials) else "OCR_FAIL"

    return {
        "pipeline": "ensemble",
        "strategy": mode,
        "status": status,
        "latency_sec": round(ensemble_latency, 4),
        "text": "",
        "record": ensemble_record if status == "SUCCESS" else None,
        "source_pipeline": "field_union",
        "error": "" if status == "SUCCESS" else "No fields to merge",
    }


def process_image(
    image_path: str,
    filename: str,
    pipeline_order: List[str],
    runners: Dict[str, Any],
    ensemble_mode: str,
) -> Dict[str, Any]:
    results: Dict[str, Dict[str, Any]] = {}

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(_safe_pipeline_call, runners[name], image_path, name): name
            for name in pipeline_order
        }
        for future in as_completed(futures):
            name = futures[future]
            result = future.result()
            results[name] = result

    records: Dict[str, Optional[TagRecord]] = {}
    parsed_summary: Dict[str, Dict[str, Any]] = {}

    for name in pipeline_order:
        result = results.get(name, {})
        record, origin, co2_total = parse_record(result.get("text", ""))
        records[name] = record
        parsed_summary[name] = {
            "origin_country": origin or "",
            "materials": normalize_material_set(record.materials) if record else [],
            "co2_total_kg": round(co2_total, 4) if co2_total is not None else None,
            "has_fields": record_has_fields(record),
        }

    ensemble = build_ensemble(ensemble_mode, pipeline_order, results, records)
    ensemble_record: Optional[TagRecord] = ensemble.get("record")
    ensemble_origin = normalize_origin(ensemble_record.origin_country) if ensemble_record else ""
    ensemble_materials = normalize_material_set(ensemble_record.materials) if ensemble_record else []

    return {
        "filename": filename,
        "image_path": image_path,
        "pipelines": results,
        "parsed": parsed_summary,
        "ensemble": {
            "status": ensemble.get("status", "OCR_FAIL"),
            "strategy": ensemble.get("strategy", ensemble_mode),
            "latency_sec": float(ensemble.get("latency_sec", 0.0)),
            "source_pipeline": ensemble.get("source_pipeline", ""),
            "error": ensemble.get("error", ""),
            "origin_country": ensemble_origin,
            "materials": ensemble_materials,
            "co2_total_kg": (
                round(float(estimate(ensemble_record).total_kgco2e), 4)
                if ensemble_record
                else None
            ),
            "has_fields": record_has_fields(ensemble_record),
        },
    }


def compute_accuracy(
    rows: List[Dict[str, Any]],
    manifest: Dict[str, Dict[str, Any]],
    pipeline_names: List[str],
) -> Dict[str, Any]:
    if not manifest:
        return {"enabled": False, "evaluated_items": 0, "by_pipeline": {}}

    counters: Dict[str, Dict[str, int]] = {
        name: {"n": 0, "origin_ok": 0, "materials_ok": 0, "doc_ok": 0}
        for name in pipeline_names + ["ensemble"]
    }

    for row in rows:
        filename = row["filename"]
        gt = manifest.get(filename)
        if not gt:
            continue

        gt_origin = gt["gt_origin_country"]
        gt_materials = gt["gt_materials"]

        for name in pipeline_names:
            pred = row["parsed"][name]
            pred_origin = normalize_origin(pred.get("origin_country"))
            pred_materials = sorted(pred.get("materials", []))
            origin_ok = pred_origin == gt_origin
            materials_ok = pred_materials == gt_materials
            counters[name]["n"] += 1
            counters[name]["origin_ok"] += int(origin_ok)
            counters[name]["materials_ok"] += int(materials_ok)
            counters[name]["doc_ok"] += int(origin_ok and materials_ok)

        epred = row["ensemble"]
        e_origin = normalize_origin(epred.get("origin_country"))
        e_materials = sorted(epred.get("materials", []))
        e_origin_ok = e_origin == gt_origin
        e_materials_ok = e_materials == gt_materials
        counters["ensemble"]["n"] += 1
        counters["ensemble"]["origin_ok"] += int(e_origin_ok)
        counters["ensemble"]["materials_ok"] += int(e_materials_ok)
        counters["ensemble"]["doc_ok"] += int(e_origin_ok and e_materials_ok)

    metrics: Dict[str, Any] = {}
    for name, c in counters.items():
        n = c["n"]
        metrics[name] = {
            "n": n,
            "origin_exact_pct": round((100.0 * c["origin_ok"] / n), 2) if n else 0.0,
            "materials_exact_set_pct": round((100.0 * c["materials_ok"] / n), 2) if n else 0.0,
            "doc_correct_pct": round((100.0 * c["doc_ok"] / n), 2) if n else 0.0,
        }

    return {
        "enabled": True,
        "evaluated_items": counters["ensemble"]["n"],
        "by_pipeline": metrics,
    }


def compute_summary(rows: List[Dict[str, Any]], pipeline_names: List[str], total_wall_sec: float) -> Dict[str, Any]:
    by_pipeline: Dict[str, Any] = {}

    for name in pipeline_names:
        statuses = [row["pipelines"][name]["status"] for row in rows]
        latencies = [float(row["pipelines"][name]["latency_sec"]) for row in rows]
        parse_success = [bool(row["parsed"][name]["has_fields"]) for row in rows]

        n = len(rows)
        by_pipeline[name] = {
            "n": n,
            "ocr_success_rate": round(100.0 * sum(s == "SUCCESS" for s in statuses) / n, 2) if n else 0.0,
            "field_success_rate": round(100.0 * sum(parse_success) / n, 2) if n else 0.0,
            "avg_latency_sec": round(statistics.mean(latencies), 4) if latencies else 0.0,
            "p95_latency_sec": round(percentile(latencies, 95), 4) if latencies else 0.0,
        }

    ensemble_statuses = [row["ensemble"]["status"] for row in rows]
    ensemble_latencies = [float(row["ensemble"]["latency_sec"]) for row in rows]
    ensemble_fields = [bool(row["ensemble"]["has_fields"]) for row in rows]
    n = len(rows)

    by_pipeline["ensemble"] = {
        "n": n,
        "ocr_success_rate": round(100.0 * sum(s == "SUCCESS" for s in ensemble_statuses) / n, 2) if n else 0.0,
        "field_success_rate": round(100.0 * sum(ensemble_fields) / n, 2) if n else 0.0,
        "avg_latency_sec": round(statistics.mean(ensemble_latencies), 4) if ensemble_latencies else 0.0,
        "p95_latency_sec": round(percentile(ensemble_latencies, 95), 4) if ensemble_latencies else 0.0,
    }

    throughput = (len(rows) / total_wall_sec) if total_wall_sec > 0 else 0.0

    return {
        "total_items": len(rows),
        "total_wall_time_sec": round(total_wall_sec, 4),
        "throughput_items_per_sec": round(throughput, 4),
        "by_pipeline": by_pipeline,
    }


def write_per_item_csv(path: str, rows: List[Dict[str, Any]], pipeline_names: List[str]) -> None:
    header = ["filename"]
    for name in pipeline_names:
        header.extend(
            [
                f"{name}_status",
                f"{name}_latency_sec",
                f"{name}_text_len",
                f"{name}_origin_country",
                f"{name}_materials",
                f"{name}_co2_total_kg",
                f"{name}_error",
            ]
        )
    header.extend(
        [
            "ensemble_strategy",
            "ensemble_status",
            "ensemble_latency_sec",
            "ensemble_source_pipeline",
            "ensemble_origin_country",
            "ensemble_materials",
            "ensemble_co2_total_kg",
            "ensemble_error",
        ]
    )

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)

        for row in rows:
            out = [row["filename"]]
            for name in pipeline_names:
                pres = row["pipelines"][name]
                parsed = row["parsed"][name]
                out.extend(
                    [
                        pres.get("status", ""),
                        round(float(pres.get("latency_sec", 0.0)), 4),
                        len(pres.get("text", "")),
                        parsed.get("origin_country", ""),
                        ";".join(parsed.get("materials", [])),
                        parsed.get("co2_total_kg", ""),
                        pres.get("error", ""),
                    ]
                )

            ens = row["ensemble"]
            out.extend(
                [
                    ens.get("strategy", ""),
                    ens.get("status", ""),
                    round(float(ens.get("latency_sec", 0.0)), 4),
                    ens.get("source_pipeline", ""),
                    ens.get("origin_country", ""),
                    ";".join(ens.get("materials", [])),
                    ens.get("co2_total_kg", ""),
                    ens.get("error", ""),
                ]
            )
            writer.writerow(out)


def write_report_md(
    path: str,
    args: argparse.Namespace,
    rows: List[Dict[str, Any]],
    metrics: Dict[str, Any],
    accuracy: Dict[str, Any],
    sampler_summary: Dict[str, Any],
    run_dir: str,
    manifest_present: bool,
) -> None:
    slowest = sorted(rows, key=lambda r: r["ensemble"]["latency_sec"], reverse=True)[:10]

    ocr_failures = []
    for row in rows:
        for name in args.pipelines_list:
            res = row["pipelines"][name]
            if res["status"] != "SUCCESS":
                ocr_failures.append(
                    {
                        "filename": row["filename"],
                        "pipeline": name,
                        "status": res["status"],
                        "error": res.get("error", ""),
                    }
                )

    lines: List[str] = []
    lines.append(f"# Benchmark Report ({args.run_id})")
    lines.append("")
    lines.append("## Environment")
    lines.append(f"- Timestamp: {datetime.now(UTC).isoformat()}")
    lines.append(f"- Python: {platform.python_version()}")
    lines.append(f"- Platform: {platform.platform()}")
    lines.append(f"- GEMINI_API_KEY set: {bool(os.getenv('GEMINI_API_KEY', '').strip())}")
    lines.append(f"- MISTRAL_API_KEY set: {bool(os.getenv('MISTRAL_API_KEY', '').strip())}")
    lines.append("")

    lines.append("## Dataset")
    lines.append(f"- Input dir: `{args.input_dir}`")
    lines.append(f"- Images processed: {len(rows)}")
    lines.append(f"- Manifest used: {manifest_present}")
    lines.append("")

    lines.append("## Methodology")
    lines.append(f"- Pipelines: {', '.join(args.pipelines_list)}")
    lines.append("- Per-image pipeline concurrency: ThreadPoolExecutor(max_workers=2)")
    lines.append(f"- Image-level workers: {args.workers}")
    lines.append(f"- Ensemble mode: {args.ensemble}")
    lines.append("- Ensemble latency: max(pipeline latencies) per image")
    lines.append("- Parser: `parse_from_text`; CO2 estimator: `estimate`")
    lines.append("")

    lines.append("## Results")
    lines.append("| Pipeline | OCR Success % | Field Success % | Avg Latency (s) | P95 Latency (s) |")
    lines.append("|---|---:|---:|---:|---:|")
    for name, values in metrics["by_pipeline"].items():
        lines.append(
            f"| {name} | {values['ocr_success_rate']:.2f} | {values['field_success_rate']:.2f} | {values['avg_latency_sec']:.4f} | {values['p95_latency_sec']:.4f} |"
        )
    lines.append("")
    lines.append(f"- Throughput: {metrics['throughput_items_per_sec']:.4f} items/sec")
    lines.append(f"- Total wall time: {metrics['total_wall_time_sec']:.4f} sec")
    lines.append(f"- CPU avg: {sampler_summary['cpu_avg_percent']:.3f}%")
    lines.append(f"- Peak RSS: {sampler_summary['peak_rss_mb']:.3f} MB")
    lines.append("")

    if accuracy.get("enabled"):
        lines.append("### Accuracy")
        lines.append("| Pipeline | N | Origin Exact % | Materials Exact-Set % | Doc-Correct % |")
        lines.append("|---|---:|---:|---:|---:|")
        for name, values in accuracy["by_pipeline"].items():
            lines.append(
                f"| {name} | {values['n']} | {values['origin_exact_pct']:.2f} | {values['materials_exact_set_pct']:.2f} | {values['doc_correct_pct']:.2f} |"
            )
        lines.append("")

    lines.append("## Key Takeaways")
    if rows:
        best_latency_name = min(
            metrics["by_pipeline"], key=lambda n: metrics["by_pipeline"][n]["avg_latency_sec"]
        )
        best_fields_name = max(
            metrics["by_pipeline"], key=lambda n: metrics["by_pipeline"][n]["field_success_rate"]
        )
        lines.append(f"- Fastest average latency: `{best_latency_name}`.")
        lines.append(f"- Highest field-success rate: `{best_fields_name}`.")
        lines.append(f"- Outputs written to: `{run_dir}`")
    lines.append("")

    lines.append("## Failure Cases")
    lines.append("### Slowest 10 by Ensemble Latency")
    lines.append("| Filename | Ensemble Latency (s) | Ensemble Status |")
    lines.append("|---|---:|---|")
    for row in slowest:
        lines.append(
            f"| {row['filename']} | {row['ensemble']['latency_sec']:.4f} | {row['ensemble']['status']} |"
        )
    lines.append("")

    lines.append("### OCR Failures")
    lines.append("| Filename | Pipeline | Status | Error |")
    lines.append("|---|---|---|---|")
    for item in ocr_failures:
        err = (item["error"] or "").replace("|", " ")
        lines.append(f"| {item['filename']} | {item['pipeline']} | {item['status']} | {err} |")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).strip() + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark OCR/VLM pipelines on garment tags")
    parser.add_argument("--input-dir", default="cropped_tags", help="Image directory (default: cropped_tags)")
    parser.add_argument(
        "--run-id",
        default=datetime.now().strftime("%Y%m%d_%H%M%S"),
        help="Run identifier used in benchmarks/outputs/<run_id>",
    )
    parser.add_argument("--limit", type=int, default=None, help="Optional max number of images")
    parser.add_argument(
        "--pipelines",
        default="gemini,mistral_ocr2",
        help="Comma-separated pipelines (gemini,mistral_ocr2,easyocr)",
    )
    parser.add_argument("--workers", type=int, default=1, help="Concurrent image workers")
    parser.add_argument(
        "--ensemble",
        default="none",
        choices=["none", "field_union"],
        help="Ensemble strategy for parsed output",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
    args = parse_args()

    pipelines_list = [p.strip() for p in args.pipelines.split(",") if p.strip()]
    invalid = [p for p in pipelines_list if p not in ALLOWED_PIPELINES]
    if invalid:
        print(f"ERROR: Unsupported pipeline(s): {invalid}")
        print(f"Allowed values: {ALLOWED_PIPELINES}")
        sys.exit(1)
    if not pipelines_list:
        print("ERROR: --pipelines resolved to empty list")
        sys.exit(1)

    args.pipelines_list = pipelines_list

    input_dir = args.input_dir
    if not os.path.isabs(input_dir):
        input_dir = os.path.join(ROOT_DIR, input_dir)

    if not os.path.isdir(input_dir):
        print(f"ERROR: Input directory not found: {input_dir}")
        sys.exit(1)

    images = sorted([f for f in os.listdir(input_dir) if f.lower().endswith(IMAGE_EXTENSIONS)])
    if args.limit is not None:
        images = images[: max(0, args.limit)]

    if not images:
        print("ERROR: No images found to process")
        sys.exit(1)

    run_dir = os.path.join(CURRENT_DIR, "outputs", args.run_id)
    os.makedirs(run_dir, exist_ok=True)

    manifest_path = os.path.join(CURRENT_DIR, "inputs", "manifest.csv")
    manifest = load_manifest(manifest_path)

    print("--- BENCHMARK START ---")
    print(f"Run ID: {args.run_id}")
    print(f"Input dir: {input_dir}")
    print(f"Images: {len(images)}")
    print(f"Pipelines: {', '.join(pipelines_list)}")
    print(f"Workers: {args.workers}")
    print(f"Ensemble: {args.ensemble}")

    runners = get_pipeline_runners(pipelines_list)
    sampler = SystemSampler(sample_interval_sec=0.2)

    rows: List[Dict[str, Any]] = []
    t0 = time.perf_counter()
    sampler.start()

    try:
        if args.workers <= 1:
            for i, filename in enumerate(images, start=1):
                image_path = os.path.join(input_dir, filename)
                row = process_image(image_path, filename, pipelines_list, runners, args.ensemble)
                rows.append(row)
                print(
                    f"[{i}/{len(images)}] {filename} | ensemble={row['ensemble']['status']} | "
                    f"latency={row['ensemble']['latency_sec']:.4f}s"
                )
        else:
            with ThreadPoolExecutor(max_workers=args.workers) as executor:
                futures = {
                    executor.submit(
                        process_image,
                        os.path.join(input_dir, filename),
                        filename,
                        pipelines_list,
                        runners,
                        args.ensemble,
                    ): filename
                    for filename in images
                }
                done = 0
                for future in as_completed(futures):
                    row = future.result()
                    rows.append(row)
                    done += 1
                    print(
                        f"[{done}/{len(images)}] {row['filename']} | ensemble={row['ensemble']['status']} | "
                        f"latency={row['ensemble']['latency_sec']:.4f}s"
                    )
    finally:
        sampler.stop()

    rows.sort(key=lambda r: r["filename"])
    total_wall_sec = time.perf_counter() - t0

    metrics = compute_summary(rows, pipelines_list, total_wall_sec)
    accuracy = compute_accuracy(rows, manifest, pipelines_list)
    sampler_summary = sampler.summary()

    per_item_path = os.path.join(run_dir, "per_item.csv")
    summary_path = os.path.join(run_dir, "summary.json")
    report_path = os.path.join(run_dir, "report.md")

    write_per_item_csv(per_item_path, rows, pipelines_list)

    summary = {
        "run_id": args.run_id,
        "config": {
            "input_dir": input_dir,
            "limit": args.limit,
            "pipelines": pipelines_list,
            "workers": args.workers,
            "ensemble": args.ensemble,
        },
        "dataset": {
            "images_processed": len(rows),
            "manifest_path": manifest_path,
            "manifest_present": os.path.exists(manifest_path),
            "manifest_rows_loaded": len(manifest),
        },
        "metrics": metrics,
        "accuracy": accuracy,
        "system": sampler_summary,
        "artifacts": {
            "per_item_csv": per_item_path,
            "summary_json": summary_path,
            "report_md": report_path,
        },
    }

    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    write_report_md(
        path=report_path,
        args=args,
        rows=rows,
        metrics=metrics,
        accuracy=accuracy,
        sampler_summary=sampler_summary,
        run_dir=run_dir,
        manifest_present=os.path.exists(manifest_path),
    )

    print("--- BENCHMARK COMPLETE ---")
    print(f"Artifacts: {run_dir}")
    print(f"Throughput: {metrics['throughput_items_per_sec']:.4f} items/sec")


if __name__ == "__main__":
    main()
