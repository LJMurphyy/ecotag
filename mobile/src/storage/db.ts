import { SQLiteDatabase, openDatabaseSync } from "expo-sqlite";

const DB_NAME = "ecotag.db";
const SCHEMA_VERSION = 3;

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync(DB_NAME);
  }
  return db;
}

export function initDb(): void {
  const database = getDb();
  database.execSync("PRAGMA foreign_keys = ON;");

  const row = database.getFirstSync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion < 1) {
    database.execSync(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        success INTEGER NOT NULL,
        co2e_grams INTEGER NOT NULL,
        display_name TEXT NULL,
        category TEXT NULL,
        error_code TEXT NULL,
        result_json TEXT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
    `);
  }

  // check the schema version and create the image cache table if it doesn't exist
  if (currentVersion < 2) {
    database.execSync(`
      CREATE TABLE IF NOT EXISTS image_cache (
        image_hash TEXT PRIMARY KEY NOT NULL,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  if (currentVersion < 3) {
    database.execSync(`
      ALTER TABLE scans ADD COLUMN in_closet INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_scans_in_closet ON scans(in_closet);
    `);
  }

  if (currentVersion !== SCHEMA_VERSION) {
    database.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}
