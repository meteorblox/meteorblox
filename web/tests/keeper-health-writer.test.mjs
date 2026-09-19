import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHealthWriter } from "../scripts/keeper-health-writer.mjs";

test("a locked database cannot crash heartbeat updates and file fallback remains fresh", () => {
  const directory = mkdtempSync(join(tmpdir(), "keeper-health-"));
  const file = join(directory, "health.json");
  const db = { prepare() { throw new Error("database is locked"); } };
  const write = createHealthWriter({ db, file, log() {} });
  try {
    write({ success: true, consecutiveFailures: 0, autoplayExecuted: true, now: 100 });
    write({ success: false, error: "RPC unavailable", consecutiveFailures: 1, autoplayExecuted: false, now: 200 });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
      updatedAt: 200, lastSuccessAt: 100, lastAutoplayAt: 100,
      consecutiveFailures: 1, lastError: "RPC unavailable",
    });
  } finally { unlinkSync(file); rmdirSync(directory); }
});

test("unavailable database and file never throw into the keeper loop", () => {
  const write = createHealthWriter({ db: { prepare() { throw Error("locked"); } }, file: "/nonexistent/keeper/health.json", log() {} });
  assert.doesNotThrow(() => write({ success: true, consecutiveFailures: 0, now: 100 }));
});
