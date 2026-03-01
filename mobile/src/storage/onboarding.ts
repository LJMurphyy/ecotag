import { getDb } from "./db";

export function hasSeenOnboarding(): boolean {
  try {
    const db = getDb();
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'onboarding_complete';"
    );
    return row?.value === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  const db = getDb();
  db.runSync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarding_complete', '1');"
  );
}
