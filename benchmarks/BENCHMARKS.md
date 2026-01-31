# Benchmarking:
We benchmarked the current CPU-based OCR pipeline (EasyOCR + Multi-variant Preprocessing) on the "Cropped Tags" dataset. The system prioritizes accuracy over speed, running 5 different image processing variants per tag to ensure text extraction. While accuracy is strong for an open-source solution (72%), the latency (26s/image) indicates a need for optimization before scaling.

### Test Environemnt:
This shows the current environment I have been working on.
#### OS
- **Product:** macOS
- **Version:** 15.7.3
- **Build:** 24G419

#### CPU
- **Model:** Apple M2 Pro
- **Cores:** 10

#### Python
- **Python:** 3.13.3
- **pip:** 25.3

---

### Performance Metrics:

| Metric | Result | Notes |
|---|---|---|
| **Success Rate** | 72.3% (55/76) | Successfully extracted Origin or Materials. |
| **Avg Latency** | 25.94s / image | High due to 5x brute-force inference loop. |
| **Throughput**| 0.04 img / sec | Current capacity: ~144 images per hour. |
| **Peak RAM** | 1.1 GB | Very lightweight; runs easily on consumer hardware. |
| **Min Latency** | 6.05s | Occurs when the "Original" image works immediately. |
| **Max Latency** | 49.38s | Occurs when the system forces all 5 filters. |

---

### Failure Analysis
Identified two primary failures: 
1. **Data Extraction Failures:** The OCR detected text, but the <span style="padding:2px 4px;border-radius:999px;margin:1px;background:#333;color:#d42432;font-weight:600;">tag parser</span>could not find a specific Country or Material. This suggests the OCR output was <span style="padding:2px 4px;border-radius:999px;margin:1px;background:#333;color:#d9aa59;font-weight:600;">garbage</span> or the tag contained only washing instructions.

---

### Reccomendations:
Optimize the Loop: We can drop latency by running the 5 variants in parallel or training a lightweight classifier to pick the best filter before OCR.

---

### Next Steps
**Implement "Early Exit":** Currently, the system runs all 5 filters even if the first one yields 99%. Adding an exit condition (e.g., if confidence > 85%: return) will likely drop average latency.

**Filter Profiling:** Determine which of the 5 image filters contributes most to success. Such as if "Bilateral Filter" accounts for 50% of the runtime but only 1% of the success, we should remove it.

**Parallelization:** Python's multiprocessing could allow us to run the 5 filters simultaneously, potentially capping latency.

**Test Different CPUs**: Utilizing 