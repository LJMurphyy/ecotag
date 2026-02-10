# Benchmarks

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Configure API keys:
   ```bash
   cp .env.example .env
   # then fill GEMINI_API_KEY and/or MISTRAL_API_KEY
   ```

The benchmark loads `.env` automatically via `python-dotenv`.

## Default Run (Gemini + Mistral OCR2)

```bash
python benchmarks/run_bench.py
```

## Limited Smoke Test

```bash
python benchmarks/run_bench.py --limit 2
```

## Useful Options

```bash
python benchmarks/run_bench.py \
  --input-dir cropped_tags \
  --run-id my_run_001 \
  --limit 20 \
  --pipelines gemini,mistral_ocr2 \
  --workers 2 \
  --ensemble field_union
```

- `--pipelines` accepts: `gemini`, `mistral_ocr2`, `easyocr`
- `--ensemble` accepts: `none`, `field_union`

## Accuracy Manifest (Optional)

If `benchmarks/inputs/manifest.csv` exists, accuracy metrics are computed.

Expected schema:

```csv
filename,gt_origin_country,gt_materials
img_001.jpg,china,cotton;polyester
img_002.jpg,india,cotton
```

Rules:

- `filename` must match image filename in the input directory.
- `gt_materials` is `;`-separated material names.
- Comparisons are case-insensitive.

## Outputs

Each run writes to:

`benchmarks/outputs/<run_id>/`

Artifacts:

- `per_item.csv`: per-image status, latency, parsed fields, and errors.
- `summary.json`: config, dataset stats, performance, accuracy, system metrics.
- `report.md`: environment, methodology, results table, takeaways, and failures.

### Goal:

Parallelize two VLM/OCR pipelines (Gemini + Mistral OCR2), measure performance + reliability, and document a reproducible baseline on a representative dataset.

### Metrics + Observations (Run ID: `20260209_170758`)

| Ticket requirement                    | How we measure it                                                                                                                                        |                                                     Result (this run) | Notes / interpretation                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------- |
| **Latency (per image)**               | Per-item latency recorded in `per_item.csv`. Ensemble latency = `max(pipeline latencies)` for that image (because pipelines run concurrently per image). |         **Avg:** 11.1663s \| **P95:** 24.0030s \| **Worst:** 60.5415s | P95 shows “tail latency” (slowest ~5%). One image was a major outlier (`IMG_8570.JPG`).                               |
| **Throughput (images/sec)**           | `images_processed / total_wall_time`                                                                                                                     |                                                  **0.1783 items/sec** | 76 images / 426.2661s. Throughput varies with API rate limits and timeouts.                                           |
| **CPU utilization**                   | Process-level average CPU during run, saved to `summary.json` and `report.md`.                                                                           |                                                       **13.005% avg** | Low CPU suggests the benchmark is mostly **network/API bound**, not compute bound.                                    |
| **Memory usage**                      | Peak RSS (resident set size) during the run.                                                                                                             |                                                   **295.250 MB peak** | Memory stayed modest and stable.                                                                                      |
| **Accuracy proxy: OCR success %**     | % of images where a pipeline returns non-empty OCR text (`SUCCESS` vs `OCR_FAIL/ERROR/TIMEOUT`).                                                         |     **Gemini:** 69.74% \| **Mistral:** 94.74% \| **Ensemble:** 73.68% | Proxy only: measures “did we get text?” not correctness of extracted fields.                                          |
| **Accuracy proxy: Field success %**   | % of images where the parser extracts at least one target field (e.g., origin country/materials) from OCR text.                                          |     **Gemini:** 56.58% \| **Mistral:** 61.84% \| **Ensemble:** 73.68% | Ensemble improves extraction via field union across pipelines.                                                        |
| **Failure cases / bottlenecks**       | Inspect slowest-10 latency + per-image error logs in `report.md` and `per_item.csv`.                                                                     | Gemini: **HTTP 429 RESOURCE_EXHAUSTED** \| Mistral: **TIMEOUT (30s)** | Main bottlenecks were **rate limiting (429)** and **timeouts**. Tail latency dominated by a few slow images/requests. |
| **Representative dataset**            | Benchmark on diverse, real garment-care tag images.                                                                                                      |                                    **76 images** from `cropped_tags/` | Includes varied lighting, blur, orientation, small fonts, and layouts typical of real tag photos.                     |
| **Consistent & reproducible results** | Same command produces same artifact structure; to reduce variance, run multiple trials and report mean/std.                                              |                           Artifacts at `benchmarks/outputs/<run_id>/` | Results can vary due to external API conditions (rate limits, network). Recommend **3 trials** and report mean/std.   |

### Reproducibility Checklist

- **Dependencies:** pinned via `requirements-lock.txt` (or generate one with `pip freeze > requirements-lock.txt`)
- **Fixed dataset:** run against the same `cropped_tags/` directory
- **Record command:** store the exact command and `run_id`
- **Multiple trials:** run 3 times and report mean/p95 range (important due to 429/timeout variability)

### Notes on “Accuracy”

Without `benchmarks/inputs/manifest.csv`, “accuracy” here is proxy-based:

- **OCR success %** = “did we get any text?”
- **Field success %** = “did the parser extract target fields?”
  To measure real accuracy, add a `manifest.csv` ground truth and rerun.
