import time
import os
import sys
import csv
import psutil
import cv2
import numpy as np
import easyocr
import json
from datetime import datetime

# --- SETUP PATHS (CORRECTED) ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) # .../benchmarks
PARENT_DIR = os.path.dirname(CURRENT_DIR)                # .../ProjectRoot
CODE_DIR = os.path.join(PARENT_DIR, 'code')              # .../ProjectRoot/code

# Add both paths to ensure we find the modules
sys.path.append(CODE_DIR)
sys.path.append(PARENT_DIR)

try:
    from tag_parser import parse_from_text
    from calculate_co2 import estimate
except ImportError as e:
    print(f"\nCRITICAL ERROR: Could not import project modules.")
    print(f"Failed to find 'tag_parser.py' in these paths:")
    print(f"1. {CODE_DIR}")
    print(f"2. {PARENT_DIR}")
    print(f"Python Error: {e}\n")
    sys.exit(1)

# --- CONFIGURATION ---
INPUT_DIR = os.path.join(PARENT_DIR, "cropped_tags")
OUTPUT_CSV = os.path.join(CURRENT_DIR, "outputs", "detailed_logs.csv")
SUMMARY_FILE = os.path.join(CURRENT_DIR, "outputs", "summary_report.md")

# --- PIPELINE LOGIC ---
def resize_if_needed(img, max_dimension=1920):
    height, width = img.shape[:2]
    if max(height, width) > max_dimension:
        scale = max_dimension / max(height, width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
    return img

def preprocess_variants(img):
    """Replicating the 5-variant logic from demo.py"""
    variants = []
    # Original
    variants.append((img, 'original'))
    
    # CLAHE
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    variants.append((enhanced_bgr, 'clahe'))
    
    # Denoised
    denoised = cv2.fastNlMeansDenoising(enhanced, None, 10, 7, 21)
    denoised_bgr = cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR)
    variants.append((denoised_bgr, 'denoised'))
    
    # Adaptive Threshold
    adaptive = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 11, 2
    )
    adaptive_bgr = cv2.cvtColor(adaptive, cv2.COLOR_GRAY2BGR)
    variants.append((adaptive_bgr, 'adaptive_thresh'))
    
    # Bilateral
    bilateral = cv2.bilateralFilter(gray, 9, 75, 75)
    bilateral_bgr = cv2.cvtColor(bilateral, cv2.COLOR_GRAY2BGR)
    variants.append((bilateral_bgr, 'bilateral'))
    
    return variants

def run_pipeline_on_image(image_path, reader):
    """
    Runs the full OCR + Parse + CO2 pipeline on a single image.
    Returns: (text, confidence, parsed_record, co2_result)
    """
    img = cv2.imread(image_path)
    if img is None:
        return None, 0, None, None
        
    img = resize_if_needed(img)
    variants = preprocess_variants(img)
    
    best_text = ""
    best_conf = 0
    
    # OCR Phase
    for processed_img, method in variants:
        try:
            result = reader.readtext(processed_img)
            if not result: continue
            
            texts = [r[1] for r in result]
            confs = [r[2] for r in result]
            
            avg_conf = np.mean(confs) if confs else 0
            full_text = " ".join(texts)
            
            if avg_conf > best_conf:
                best_conf = avg_conf
                best_text = full_text
        except Exception:
            continue

    # Parsing Phase
    if best_text:
        record = parse_from_text(best_text)
        co2_result = estimate(record)
        return best_text, best_conf, record, co2_result
    
    return None, 0, None, None

def get_system_metrics():
    """Returns current CPU percent and RAM usage in MB"""
    process = psutil.Process(os.getpid())
    mem_mb = process.memory_info().rss / 1024 / 1024
    cpu_pct = psutil.cpu_percent(interval=None) # Instant check
    return cpu_pct, mem_mb

# BENCHMARK LOOP
def main():
    print(f"--- STARTING BENCHMARK ---")
    print(f"Target Directory: {INPUT_DIR}")
    
    # 1. Cold Start (Model Loading)
    print("Loading EasyOCR Model (Cold Start)...")
    start_load = time.perf_counter()
    reader = easyocr.Reader(['en'], gpu=False) # CPU Mode
    end_load = time.perf_counter()
    load_time = end_load - start_load
    print(f"Model Loaded in {load_time:.2f} seconds")

    # Prepare Inputs
    if not os.path.exists(INPUT_DIR):
        print(f"ERROR: Directory not found: {INPUT_DIR}")
        return

    images = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    images.sort()
    
    if not images:
        print("No images found! Check path.")
        return

    # CSV Setup
    print(f"Found {len(images)} images. Starting inference loop...")
    
    # Ensure outputs dir exists
    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)

    with open(OUTPUT_CSV, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            "filename", "status", "inference_time_sec", 
            "cpu_pct", "ram_mb", "ocr_confidence", 
            "text_length", "origin_detected", "materials_detected"
        ])
        
        # Warmup (Run first image twice without logging to fill caches)
        if len(images) > 0:
            print("Warming up pipeline...")
            run_pipeline_on_image(os.path.join(INPUT_DIR, images[0]), reader)

        # Main Loop
        success_count = 0
        total_inference_time = 0
        
        for idx, filename in enumerate(images):
            filepath = os.path.join(INPUT_DIR, filename)
            
            # Start Timer
            t_start = time.perf_counter()
            
            # Run Pipeline
            text, conf, record, result = run_pipeline_on_image(filepath, reader)
            
            # End Timer
            t_end = time.perf_counter()
            duration = t_end - t_start
            total_inference_time += duration
            
            # Capture System Stats
            cpu, ram = get_system_metrics()
            
            # Determine Status
            status = "SUCCESS"
            if not text:
                status = "OCR_FAIL"
            elif record and (not record.materials and not record.origin_country):
                status = "PARSE_PARTIAL" # OCR worked, but extracted no useful data
            
            if status == "SUCCESS": success_count += 1
            
            # Log Data
            writer.writerow([
                filename,
                status,
                round(duration, 4),
                cpu,
                round(ram, 2),
                round(conf * 100, 2), # Convert to pct
                len(text) if text else 0,
                record.origin_country if record else "N/A",
                len(record.materials) if record else 0
            ])
            
            print(f"[{idx+1}/{len(images)}] {filename}: {status} ({duration:.2f}s) | RAM: {ram:.1f}MB")

    # Summary Calculation
    avg_latency = total_inference_time / len(images)
    throughput = len(images) / total_inference_time
    
    print("\n--- BENCHMARK COMPLETE ---")
    print(f"Total Images: {len(images)}")
    print(f"Success Rate: {success_count}/{len(images)}")
    print(f"Avg Latency: {avg_latency:.2f}s per image")
    print(f"Throughput:  {throughput:.2f} images/sec")
    print(f"Detailed logs saved to: {OUTPUT_CSV}")

if __name__ == "__main__":
    main()