import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { getDb } from "./db";
import { TagApiResponse } from "../types/api";

// change the max entries for cache here
const CACHE_MAX_ENTRIES = 100;

// create a hash of the image uri
async function hashImageUri(imageUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64" as any,
  });
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
}

// lookup the cache for the image uri
// if the cache is hit, return the response
// if the cache is miss, return null
export async function lookupCache(imageUri: string): Promise<TagApiResponse | null> {
  try {
    const hash = await hashImageUri(imageUri);
    const db = getDb();
    const row = db.getFirstSync<{ response_json: string }>(
      "SELECT response_json FROM image_cache WHERE image_hash = ?",
      hash,
    );
    if (!row) {
      console.log("[EcoTag Cache] MISS", hash.slice(0, 8));
      return null;
    }
    const parsed = JSON.parse(row.response_json) as Partial<TagApiResponse>;
    if (!parsed.parsed || !parsed.emissions) return null;
    console.log("[EcoTag Cache] HIT", hash.slice(0, 8));
    return parsed as TagApiResponse;
  } catch (err) {
    console.warn("[EcoTag] Local cache lookup failed:", err);
    return null;
  }
}

// uses FIFO to evict the oldest cache entry (creation time) when the cache is full
// stores the hash of the image uri, the response, and the creation time
export async function storeCache(imageUri: string, response: TagApiResponse): Promise<void> {
  try {
    const hash = await hashImageUri(imageUri);
    const db = getDb();
    // insert or replace the cache entry
    db.runSync(
      `INSERT OR REPLACE INTO image_cache (image_hash, response_json, created_at)
       VALUES (?, ?, ?)`,
      hash,
      JSON.stringify(response),
      Date.now(),
    );
    // evict the oldest cache entry when the cache is full
    db.runSync(
      `DELETE FROM image_cache WHERE image_hash NOT IN (
         SELECT image_hash FROM image_cache ORDER BY created_at DESC LIMIT ?
       )`,
      CACHE_MAX_ENTRIES,
    );
  } catch (err) {
    console.warn("[EcoTag] Local cache store failed:", err);
  }
}
