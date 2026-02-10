# Benchmarks

This folder contains a reproducible benchmark runner to evaluate OCR/VLM pipelines on real garment-care tag photos.

## Goal

Parallelize two VLM/OCR pipelines (Gemini + Mistral OCR2), measure performance + reliability, and document a repeatable baseline on a representative dataset.

---

## Quickstart

### 1) Install dependencies
```bash
pip install -r requirements.txt
```

### 2) Configure API keys
```bash
cp .env.example .env
# then fill GEMINI_API_KEY and/or MISTRAL_API_KEY
```

The benchmark loads `.env` automatically via `python-dotenv`.

### 3) Run the default benchmark
```bash
python benchmarks/run_bench.py
```

---

## Running the benchmark

### Default run (Gemini + Mistral OCR2)
```bash
python benchmarks/run_bench.py
```

### Limited smoke test (fast sanity check)
```bash
python benchmarks/run_bench.py --limit 2
```

### Useful options (typical “ticket run”)
```bash
python benchmarks/run_bench.py \
  --input-dir cropped_tags \
  --run-id my_run_001 \
  --limit 20 \
  --pipelines gemini,mistral_ocr2 \
  --workers 2 \
  --ensemble field_union
```

#### Flags
- `--pipelines` accepts: `gemini`, `mistral_ocr2`, `easyocr`
- `--ensemble` accepts: `none`, `field_union`
- `--workers` controls *image-level concurrency* (how many images are processed at the same time)

---

## Parallelism model (what actually runs in parallel)

This benchmark uses **two layers of concurrency**:

1) **Per-image pipeline concurrency**
- For each image, selected pipelines run concurrently using:
  - `ThreadPoolExecutor(max_workers=2)` inside `process_image()`
- **Ensemble latency** is defined as `max(pipeline latencies)` per image because pipelines are in-flight at the same time.

2) **Image-level concurrency**
- Multiple images are processed concurrently when `--workers > 1` using:
  - `ThreadPoolExecutor(max_workers=--workers)` in `main()`

**Rough in-flight request estimate**:
- Max concurrent pipeline calls ≈ `workers × min(num_pipelines, 2)`

**Why this helps**:
- These pipelines are mostly **network/API-bound** (waiting on remote inference), so concurrency improves throughput by overlapping waits.

**Tradeoff**:
- More concurrency can increase **rate limits (HTTP 429)** and **timeouts**.

---

## Metric definitions (quick glossary)

- **OCR Success %**: % of images where the pipeline returns non-empty OCR text (`status == SUCCESS` and `text_len > 0`).
- **Field Success %**: % of images where the parser extracts **at least one** target field (origin country or any material).
- **Avg latency**: average per-image latency for that pipeline across the run.
- **P95 latency**: 95th percentile latency (95% of images are faster than this; 5% are slower). Shows “tail latency”.
- **Throughput**: images processed per second over full wall time (includes waiting on APIs, timeouts, failures).
- **CPU avg / Peak RSS**: process-level CPU utilization (avg) and memory usage (peak resident set size) measured during the run.

---

## Accuracy manifest (optional, for true accuracy)

If `benchmarks/inputs/manifest.csv` exists, accuracy metrics are computed.

Expected schema:
```csv
filename,gt_origin_country,gt_materials
img_001.jpg,china,cotton;polyester
img_002.jpg,india,cotton
```

Rules:
- `filename` must match the image filename in the input directory.
- `gt_materials` is `;`-separated material names.
- Comparisons are case-insensitive.

**Note on “accuracy” without a manifest**:
- If `manifest.csv` is missing, reported “success rates” are **proxy metrics**:
  - OCR success % = “did we get text?”
  - Field success % = “did we extract any target fields?”
- These measure **reliability**, not correctness.

---

## Outputs

Each run writes to:
`benchmarks/outputs/<run_id>/`

Artifacts:
- `per_item.csv`: per-image status, latency, parsed fields, and errors.
- `summary.json`: config, dataset stats, performance, accuracy, system metrics.
- `report.md`: environment, methodology, results table, takeaways, slowest items, failures.

---

## Recommended runs

### Baseline (balanced)
```bash
python benchmarks/run_bench.py --pipelines gemini,mistral_ocr2 --workers 2 --ensemble field_union
```

### Rate-limit safe mode (more stable, fewer 429s)
```bash
python benchmarks/run_bench.py --pipelines gemini,mistral_ocr2 --workers 1 --ensemble field_union
```

### Quick check (single image)
```bash
python benchmarks/run_bench.py --limit 1 --pipelines gemini --workers 1
```

---

# Benchmark Results (latest)

## Results snapshot (Run ID: `20260209_170758`)

**Command**
```bash
python benchmarks/run_bench.py --workers 2 --pipelines gemini,mistral_ocr2 --ensemble field_union
```

**Dataset**
- 76 images from `cropped_tags/`
- Manifest used: False (proxy metrics only)

### Pipeline summary

| Pipeline | OCR Success % | Field Success % | Avg Latency (s) | P95 Latency (s) |
|---|---:|---:|---:|---:|
| gemini | 69.74 | 56.58 | 8.2602 | 15.4368 |
| mistral_ocr2 | 94.74 | 61.84 | 10.2786 | 24.0030 |
| ensemble (field_union) | 73.68 | 73.68 | 11.1663 | 24.0030 |

### System / run totals

| Metric | Value |
|---|---:|
| Throughput (items/sec) | 0.1783 |
| Total wall time (sec) | 426.2661 |
| CPU avg (%) | 13.005 |
| Peak RSS (MB) | 295.250 |

---

## Ticket requirements coverage (Run ID: `20260209_170758`)

| Ticket requirement | What we measured / reported | Where it appears | Result (this run) | Notes / interpretation |
|---|---|---|---:|---|
| **Latency (per image / per document)** | Per-item latency + aggregate stats (avg, p95). Ensemble latency = `max(pipeline latencies)` per image. | `report.md`, `per_item.csv`, `summary.json` | Avg ensemble **11.1663s**, P95 **24.0030s**, worst **60.5415s** | Tail latency matters here: a few slow requests dominate perceived performance. |
| **Throughput (images/sec)** | `images_processed / total_wall_time` | `report.md`, `summary.json` | **0.1783 items/sec** | Includes API wait time + timeouts + failures. |
| **CPU utilization** | Process-level average CPU sampled during run | `report.md`, `summary.json` | **13.005% avg** | Low CPU suggests workload is mostly network/API bound. |
| **Memory usage** | Peak RSS during the run | `report.md`, `summary.json` | **295.250 MB peak** | Stable + modest memory usage. |
| **Bottlenecks / failure cases** | Slowest-10 by ensemble latency + per-pipeline failures with error strings | `report.md`, `per_item.csv` | Gemini: **HTTP 429 RESOURCE_EXHAUSTED**; Mistral: **TIMEOUT (30s)** | Main bottlenecks: rate limiting + timeouts + tail latency spikes. |
| **Representative dataset** | Real-world garment tag photos (lighting, blur, small fonts, layouts) | `report.md` dataset section + `cropped_tags/` | **76 images** | This is representative of “phone photo of tag” conditions. |
| **Consistent & reproducible** | Same command generates same artifact structure; recommend multi-trial to address API variance | This doc + outputs | Artifacts at `benchmarks/outputs/<run_id>/` | API conditions vary: run 3 trials + report mean/p95 range for stability. |

---

## Key takeaways (Run ID: `20260209_170758`)

- **Gemini** had the **fastest average latency** (8.26s) but reliability was impacted by **HTTP 429 RESOURCE_EXHAUSTED** errors.
- **Mistral OCR2** had the **highest OCR success** (94.74%) but also showed **timeouts (30s)** and higher tail latency (P95 24.00s).
- **Ensemble (field_union)** improved **field success rate** to **73.68%** by merging extracted fields across pipelines.
- Low CPU usage suggests further speedups come mainly from:
  - tuning concurrency to avoid 429s
  - better timeout/retry strategy

---

## Common failure modes + mitigations

- **Gemini HTTP 429 (RESOURCE_EXHAUSTED / quota / rate limit)**
  - Mitigate by lowering `--workers`, adding retry + exponential backoff, or increasing quota/billing tier.
- **Mistral TIMEOUT (30s)**
  - Mitigate by increasing timeout threshold, retrying timeouts, or lowering concurrency.
- **Tail latency spikes (outliers)**
  - Track P95/P99 and list the slowest items; consider per-request time caps and retry rules.

---

## Reproducibility checklist

- **Dependencies**
  - Recommended: generate a lockfile:
    ```bash
    pip freeze > requirements-lock.txt
    ```
- **Fixed dataset**
  - Run against the same `cropped_tags/` directory.
- **Record command + run_id**
  - Save the exact command used and include the run ID in writeups.
- **Multiple trials**
  - Run 3 trials and report mean and a range for P95 to account for rate-limit/network variance.

---

## Notes on missing keys

If `GEMINI_API_KEY` or `MISTRAL_API_KEY` is not set, that pipeline is marked `SKIPPED_MISSING_KEY` and the run still completes.
