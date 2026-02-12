# Benchmarks — OCR/VLM Pipeline Comparison

This document compares benchmark runs on the same dataset of garment-care tag images (`cropped_tags/`, 76 images).  
Each run executes **two pipelines in parallel per image**, measures performance/reliability, and (when `manifest.csv` is present + populated) computes **true accuracy**.

---

## What’s measured

- **Latency**: average + P95 (tail) latency per pipeline (seconds)
- **Throughput**: images processed per second (items/sec)
- **CPU avg** and **Peak RSS** during the benchmark process
- **Reliability**
  - **OCR Success %**: pipeline returned non-empty text (`SUCCESS`)
  - **Failures**: timeouts / HTTP errors recorded per image
- **Extraction quality**
  - **Field Success %**: parser extracted at least one target field (origin or materials)
- **True accuracy (manifest-enabled)**
  - **Origin Exact %**
  - **Materials Exact-Set %**
  - **Doc-Correct %** (both origin + materials correct)

> Important: **“OCR Success %” is not accuracy**. Accuracy requires a filled `benchmarks/inputs/manifest.csv`.

---

## How parallelism works

There are two concurrency layers:

1. **Per-image pipeline concurrency**  
   For each image, all selected pipelines run concurrently via a `ThreadPoolExecutor(max_workers=<num_pipelines>)`.

2. **Image-level workers (`--workers`)**  
   Controls how many images are processed concurrently (another `ThreadPoolExecutor`).

---

## What `field_union` does

`--ensemble field_union` **merges parsed fields** across pipelines in pipeline order:

- **Origin**: first non-empty origin in the pipeline order
- **Materials**: union of fibers; first occurrence wins when conflicts occur

**Ensemble latency** is defined as `max(pipeline latencies)` per image (because pipelines run concurrently, ensemble “waits” for the slowest).

> Note on interpretation: in `field_union` mode, the **ensemble `SUCCESS`** status is driven by **whether any fields were produced** (origin/materials), not whether the ensemble produced OCR text (the ensemble text is intentionally empty in the implementation).

---

# Run A — OpenAI GPT‑5.2 + Mistral OCR2 (no merge)

**Run ID:** `20260210_154502`  
**Pipelines:** `openai_gpt52`, `mistral_ocr2`  
**Workers:** `2`  
**Ensemble:** `none`  
**Manifest:** `True` (accuracy enabled)

Reproduce:

```bash
python benchmarks/run_bench.py   --run-id 20260210_154502   --input-dir cropped_tags   --pipelines openai_gpt52,mistral_ocr2   --workers 2   --ensemble none
```

### Performance + reliability

| Pipeline | OCR Success % | Field Success % | Avg Latency (s) | P95 Latency (s) |
|---|---:|---:|---:|---:|
| openai_gpt52 | 100.00 | 80.26 | 3.4048 | 4.8414 |
| mistral_ocr2 | 100.00 | 65.79 | 2.4881 | 3.7208 |
| ensemble | 100.00 | 80.26 | 3.4103 | 4.8414 |

- **Throughput:** 0.5826 items/sec  
- **Total wall time:** 130.4446 sec  
- **CPU avg:** 14.851%  
- **Peak RSS:** 275.359 MB

### True accuracy (manifest enabled)

| Pipeline | N | Origin Exact % | Materials Exact-Set % | Doc-Correct % |
|---|---:|---:|---:|---:|
| openai_gpt52 | 76 | 97.37 | 98.68 | 96.05 |
| mistral_ocr2 | 76 | 88.16 | 86.84 | 81.58 |
| ensemble | 76 | 97.37 | 98.68 | 96.05 |

**Interpretation**
- Strong baseline: **perfect OCR success** and strong **doc-correct** for `openai_gpt52`.
- With `--ensemble none`, the “ensemble” result is **not a merge**; it reflects the selected pipeline output (no field union).

---

# Run B — Gemini + Mistral OCR2 (merge via field_union)

**Run ID:** `live_20260210_161002_gemini_mistral_w2_field_union`  
**Pipelines:** `gemini`, `mistral_ocr2`  
**Workers:** `2`  
**Ensemble:** `field_union`  
**Manifest:** `True` (accuracy enabled)

Reproduce:

```bash
python benchmarks/run_bench.py   --run-id live_20260210_161002_gemini_mistral_w2_field_union   --input-dir cropped_tags   --pipelines gemini,mistral_ocr2   --workers 2   --ensemble field_union
```

### Performance + reliability

| Pipeline | OCR Success % | Field Success % | Avg Latency (s) | P95 Latency (s) |
|---|---:|---:|---:|---:|
| gemini | 65.79 | 55.26 | 3.7008 | 6.2343 |
| mistral_ocr2 | 98.68 | 65.79 | 4.0524 | 6.9394 |
| ensemble (field_union) | 75.00 | 75.00 | 4.7886 | 8.9879 |

- **Throughput:** 0.4157 items/sec  
- **Total wall time:** 182.8228 sec  
- **CPU avg:** 10.758%  
- **Peak RSS:** 300.797 MB

### True accuracy (manifest enabled)

| Pipeline | N | Origin Exact % | Materials Exact-Set % | Doc-Correct % |
|---|---:|---:|---:|---:|
| gemini | 76 | 84.21 | 80.26 | 75.00 |
| mistral_ocr2 | 76 | 88.16 | 88.16 | 82.89 |
| ensemble (field_union) | 76 | 96.05 | 96.05 | 94.74 |

### Bottlenecks / failure modes (from report)

- **Gemini:** HTTP 429 `RESOURCE_EXHAUSTED` (rate limiting) → lowers OCR success + increases tail latency
- **Mistral OCR2:** occasional `TIMEOUT` after 30s → large tail spikes
- Worst tail examples (ensemble latency):
  - `IMG_8609.JPG` — 30.3265s (OCR_FAIL)
  - `IMG_8607.JPG` — 29.1906s (OCR_FAIL)
  - `IMG_8604.JPG` — 18.2271s (SUCCESS)
  - `IMG_8709.JPG` — 14.2608s (SUCCESS)

**Interpretation**
- `field_union` substantially improved **doc-correct** vs either pipeline alone (**94.74%**).
- Reliability and tail latency suffered due to **429s** and **timeouts**, reducing throughput.

---

# Run C — OpenAI GPT‑5.2 + Mistral OCR2 (merge via field_union)

**Run ID:** `openai_mistral_w2_field_union`  
**Pipelines:** `openai_gpt52`, `mistral_ocr2`  
**Workers:** `2`  
**Ensemble:** `field_union`  
**Manifest:** `True` (accuracy enabled)

Reproduce:

```bash
python benchmarks/run_bench.py   --run-id openai_mistral_w2_field_union   --input-dir cropped_tags   --pipelines openai_gpt52,mistral_ocr2   --workers 2   --ensemble field_union
```

### Performance + reliability

| Pipeline | OCR Success % | Field Success % | Avg Latency (s) | P95 Latency (s) |
|---|---:|---:|---:|---:|
| openai_gpt52 | 100.00 | 80.26 | 10.1683 | 20.0154 |
| mistral_ocr2 | 98.68 | 64.47 | 10.1229 | 21.1039 |
| ensemble (field_union) | 80.26 | 80.26 | 11.5879 | 22.6273 |

- **Throughput:** 0.1722 items/sec  
- **Total wall time:** 441.4213 sec  
- **CPU avg:** 12.006%  
- **Peak RSS:** 223.609 MB

### True accuracy (manifest enabled)

| Pipeline | N | Origin Exact % | Materials Exact-Set % | Doc-Correct % |
|---|---:|---:|---:|---:|
| openai_gpt52 | 76 | 97.37 | 100.00 | 97.37 |
| mistral_ocr2 | 76 | 86.84 | 85.53 | 80.26 |
| ensemble (field_union) | 76 | 97.37 | 100.00 | 97.37 |

### Bottlenecks / failure modes (from report)

- **Mistral OCR2:** at least one `TIMEOUT` after 30s (`IMG_8705.JPG`)  
- **Tail latency:** worst ensemble latency observed was **40.3768s** (`IMG_8705.JPG`)
- A few slow requests dominate P95 and pull throughput down sharply in this run.

**Interpretation**
- Accuracy stayed high (ensemble doc-correct **97.37%**), but **performance regressed heavily** vs Run A.
- The jump from ~3–4s avg latency (Run A) to ~10–12s avg latency (Run C) strongly suggests **external conditions** (provider throttling, transient network slowness, timeouts) rather than CPU limits (CPU stayed low).

---

# Head-to-head comparison

## Performance & reliability (ensemble rows)

| Run | Pipelines | Ensemble mode | Ensemble “Success” %* | Ensemble Field Success % | Ensemble Avg Lat (s) | Ensemble P95 Lat (s) | Throughput (items/sec) |
|---|---|---|---:|---:|---:|---:|---:|
| A | OpenAI + Mistral | none | 100.00 | 80.26 | 3.4103 | 4.8414 | 0.5826 |
| B | Gemini + Mistral | field_union | 75.00 | 75.00 | 4.7886 | 8.9879 | 0.4157 |
| C | OpenAI + Mistral | field_union | 80.26 | 80.26 | 11.5879 | 22.6273 | 0.1722 |

\* In `field_union` mode, “ensemble success” is driven by “fields exist” (origin/materials), not by ensemble OCR text.

## Accuracy (doc-correct)

| Run | Best single pipeline doc-correct % | Ensemble doc-correct % | Notes |
|---|---:|---:|---|
| A | openai_gpt52: **96.05%** | **96.05%** | Ensemble is not a merge (`none`). |
| B | mistral_ocr2: **82.89%** | **94.74%** | `field_union` adds real value vs either alone. |
| C | openai_gpt52: **97.37%** | **97.37%** | Merge did not improve vs OpenAI alone (already strong), but preserved accuracy. |

---

# Key takeaways

- **Best overall baseline (quality + speed + stability):** **Run A** (`openai_gpt52 + mistral_ocr2`, `--ensemble none`)  
  - Strong accuracy (**96.05% doc-correct**) and the best throughput/latency profile in these runs.
- **Best “combine the two” outcome among mixed providers:** **Run B** (Gemini + Mistral, `field_union`)  
  - Ensemble accuracy improved substantially (**94.74% doc-correct**) vs either alone, but reliability fell due to **Gemini 429s** and some **Mistral timeouts**.
- **OpenAI + Mistral with `field_union` (Run C)** maintained high accuracy (**97.37% doc-correct**) but showed **major performance regression** (avg ~11.6s; throughput ~0.17 items/sec) driven by tail latency/timeouts.
- **CPU is low in all runs** → benchmarks are primarily **network/API bound**.

---

## Recommendation:
- This did not sufficiently boost results enough to justify using it over a single VLM.
- GPT 5.2 is the suggested implementation.

## Where to find artifacts

Each run writes to:

`benchmarks/outputs/<run_id>/`

Artifacts:
- `per_item.csv` — per-image status/latency/fields/errors
- `summary.json` — config + aggregated metrics + system stats
- `report.md` — readable report (tables + failure cases)
