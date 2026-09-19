import { renameSync, writeFileSync } from "node:fs";

// Heartbeat persistence is observability, never a reason to stop settlement.
export function createHealthWriter({ db, file, log = console.error }) {
  let previous = { lastSuccessAt: 0, lastAutoplayAt: 0 };
  return ({ success, error = "", consecutiveFailures, autoplayExecuted, now = Date.now() }) => {
    try {
      const prior = db?.prepare("SELECT last_success_at, last_autoplay_at FROM keeper_health WHERE id = 1").get();
      if (prior) previous = {
        lastSuccessAt: Math.max(previous.lastSuccessAt, Number(prior.last_success_at)),
        lastAutoplayAt: Math.max(previous.lastAutoplayAt, Number(prior.last_autoplay_at)),
      };
    } catch { log("[keeper] Heartbeat database read unavailable; using last known timestamps."); }
    const record = {
      updatedAt: now,
      lastSuccessAt: success ? now : previous.lastSuccessAt,
      lastAutoplayAt: autoplayExecuted ? now : previous.lastAutoplayAt,
      consecutiveFailures, lastError: error.slice(0, 500),
    };
    previous = record;
    try {
      db?.prepare(`INSERT INTO keeper_health
        (id, updated_at, last_success_at, last_autoplay_at, consecutive_failures, last_error)
        VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        updated_at=excluded.updated_at, last_success_at=excluded.last_success_at,
        last_autoplay_at=excluded.last_autoplay_at,
        consecutive_failures=excluded.consecutive_failures, last_error=excluded.last_error`)
        .run(now, record.lastSuccessAt, record.lastAutoplayAt, consecutiveFailures, record.lastError);
    } catch { log("[keeper] Heartbeat database write unavailable; settlement will continue."); }
    try {
      if (file) { writeFileSync(`${file}.tmp`, JSON.stringify(record)); renameSync(`${file}.tmp`, file); }
    } catch { log("[keeper] Heartbeat file write unavailable; settlement will continue."); }
    return record;
  };
}
