import { getD1 } from "./runtime.ts";
import type { D1DatabaseLike } from "./runtime.ts";
import type { ProtocolCheck, SentinelNode } from "../app/sentinel/model.ts";

export async function sentinelDb() {
  const db = await getD1();
  if (!db) throw new Error("Sentinel durable storage is not configured");
  await db.prepare(`CREATE TABLE IF NOT EXISTS sentinel_nodes (
    address TEXT PRIMARY KEY NOT NULL, activated_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sentinel_checks (
    bucket INTEGER PRIMARY KEY NOT NULL, checked_at INTEGER NOT NULL, payload TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sentinel_demo_rewards (
    address TEXT PRIMARY KEY NOT NULL, earned INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0, last_bucket INTEGER NOT NULL DEFAULT -1
  )`).run();
  await db.prepare(`INSERT INTO sentinel_demo_rewards (address)
    SELECT address FROM sentinel_nodes WHERE true ON CONFLICT(address) DO NOTHING`).run();
  return db;
}

export async function readNode(db: D1DatabaseLike, address: string) {
  return db.prepare("SELECT address, activated_at AS activatedAt FROM sentinel_nodes WHERE address = ?")
    .bind(address).first<SentinelNode>();
}

export async function activateNode(db: D1DatabaseLike, address: string, now = Date.now()) {
  // Repeated approvals are harmless: neither identity nor activation time changes.
  await db.prepare("INSERT INTO sentinel_nodes (address, activated_at) VALUES (?, ?) ON CONFLICT(address) DO NOTHING")
    .bind(address, now).run();
  await db.prepare("INSERT INTO sentinel_demo_rewards (address) VALUES (?) ON CONFLICT(address) DO NOTHING").bind(address).run();
  return readNode(db, address);
}

export async function readChecks(db: D1DatabaseLike): Promise<ProtocolCheck[]> {
  const result = await db.prepare("SELECT payload FROM sentinel_checks ORDER BY bucket DESC LIMIT 30")
    .bind().all<{ payload: string }>();
  return (result.results ?? []).map((row) => JSON.parse(row.payload) as ProtocolCheck);
}

export async function saveCheck(db: D1DatabaseLike, check: ProtocolCheck) {
  await db.prepare("INSERT INTO sentinel_checks (bucket, checked_at, payload) VALUES (?, ?, ?) ON CONFLICT(bucket) DO NOTHING")
    .bind(Math.floor(check.checkedAt / 60_000), check.checkedAt, JSON.stringify(check)).run();
  // One integer demo credit = 0.01 simulated DSLVR. No chain writes.
  // This single UPDATE is atomic and replay-safe across monitor restarts.
  if (check.connection === "ok" && check.settlement !== "unavailable" && Math.abs(Date.now() - check.checkedAt) < 180_000) {
    const bucket = Math.floor(check.checkedAt / 60_000);
    await db.prepare(`UPDATE sentinel_demo_rewards SET earned = earned + 1, last_bucket = ?
      WHERE last_bucket < ? AND address IN (SELECT address FROM sentinel_nodes WHERE activated_at <= ?)`)
      .bind(bucket, bucket, check.checkedAt).run();
  }
  await db.prepare("DELETE FROM sentinel_checks WHERE checked_at < ?")
    .bind(check.checkedAt - 7 * 86_400_000).run();
}

export async function readDemoRewards(db: D1DatabaseLike, address: string) {
  return db.prepare("SELECT earned, claimed FROM sentinel_demo_rewards WHERE address = ?")
    .bind(address).first<{ earned: number; claimed: number }>();
}

export async function claimDemoRewards(db: D1DatabaseLike, address: string, upTo: number) {
  // Approval authorizes only this snapshot: replay cannot claim future earnings.
  await db.prepare(`UPDATE sentinel_demo_rewards SET claimed = ?
    WHERE address = ? AND claimed < ? AND earned >= ?`).bind(upTo, address, upTo, upTo).run();
  return readDemoRewards(db, address);
}
