import { getDb } from "./db";
import { NewScanRecord, ScanRecord } from "./types";

const ALLOWED_TOP_LEVEL_KEYS = new Set(["parsed", "emissions", "error"]);
const BLOCKED_KEYS = new Set([
  "image",
  "dataUrl",
  "base64",
  "raw_ocr",
  "prompt",
  "response",
  "logs",
]);

function sanitizeResult(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) continue;
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = value;
  }

  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
}

export function addScan(input: NewScanRecord): string {
  const db = getDb();
  db.runSync(
    `INSERT INTO scans (
      id, created_at, success, co2e_grams, display_name, category, error_code, result_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    input.created_at,
    input.success,
    input.co2e_grams,
    input.display_name,
    input.category,
    input.error_code,
    sanitizeResult(input.result),
  );
  pruneOldScans(100);
  return input.id;
}

export function listScans(limit = 50, offset = 0): ScanRecord[] {
  const db = getDb();
  return db.getAllSync<ScanRecord>(
    `SELECT id, created_at, success, co2e_grams, display_name, category, error_code, result_json
     FROM scans
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
}

export function clearAllScans(): void {
  getDb().runSync("DELETE FROM scans");
}

export function pruneOldScans(max = 100): void {
  if (max <= 0) return;
  getDb().runSync(
    `DELETE FROM scans
     WHERE id NOT IN (
       SELECT id FROM scans ORDER BY created_at DESC LIMIT ?
     )`,
    max,
  );
}
