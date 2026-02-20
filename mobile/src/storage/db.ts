import { SQLiteDatabase, openDatabaseSync } from "expo-sqlite";

const DB_NAME = "ecotag.db";
const SCHEMA_VERSION = 1;

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

  if (currentVersion !== SCHEMA_VERSION) {
    database.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}
