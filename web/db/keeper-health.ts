import { getD1 } from "./runtime.ts";

export type KeeperHealth = {
  updatedAt: number;
  lastSuccessAt: number;
  lastAutoplayAt: number;
  consecutiveFailures: number;
  lastError: string;
};

export async function getKeeperHealth(): Promise<KeeperHealth | null> {
  if (typeof process !== "undefined" && process.env.CHAT_DB_PATH) {
    try {
      const specifier = ["node", "fs/promises"].join(":");
      const { readFile } = await import(/* @vite-ignore */ specifier) as { readFile(path: string, encoding: string): Promise<string> };
      return JSON.parse(await readFile(`${process.env.CHAT_DB_PATH}.keeper-health.json`, "utf8")) as KeeperHealth;
    } catch { /* The keeper may not have written its first heartbeat yet. */ }
  }
  const db = await getD1();
  if (!db) return null;
  await db.prepare(`CREATE TABLE IF NOT EXISTS keeper_health (
    id INTEGER PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    last_success_at INTEGER NOT NULL,
    last_autoplay_at INTEGER NOT NULL,
    consecutive_failures INTEGER NOT NULL,
    last_error TEXT NOT NULL
  )`).run();
  return db.prepare(`SELECT updated_at AS updatedAt, last_success_at AS lastSuccessAt,
    last_autoplay_at AS lastAutoplayAt, consecutive_failures AS consecutiveFailures,
    last_error AS lastError FROM keeper_health WHERE id = 1`).first<KeeperHealth>();
}
