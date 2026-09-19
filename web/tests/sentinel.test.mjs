import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { activateNode, readNode, readChecks, saveCheck, sentinelDb, readDemoRewards } from "../db/sentinel.ts";
import { activationMessage, demoClaimMessage, checkState, validActivation } from "../app/sentinel/model.ts";
import { observation } from "../scripts/sentinel-monitor.mjs";
import { GET, POST } from "../app/api/sentinel/route.ts";

// An isolated SQL database, never the production CHAT_DB_PATH.
process.env.CHAT_DB_PATH = ":memory:";
process.env.SENTINEL_ENABLED = "true";
process.env.SENTINEL_ACTIVATION_PAUSED = "false";
globalThis[Symbol.for("slvrblox.sqlite-store")] = new DatabaseSync(":memory:");
const wallet = Ed25519Keypair.generate();
const address = wallet.toSuiAddress();
const request = (body) => new Request("http://localhost/api/sentinel", { method: "POST", body: JSON.stringify(body) });
async function approval() {
  const timestamp = Date.now();
  const signed = await wallet.signPersonalMessage(new TextEncoder().encode(activationMessage(address, timestamp)));
  return { address, timestamp, ...signed };
}

test("activation validates ownership, is idempotent, and persists across reads", async () => {
  const body = await approval();
  const first = await POST(request(body));
  assert.equal(first.status, 200);
  const node = (await first.json()).node;
  assert.equal(node.address, address);
  assert.equal((await POST(request(body))).status, 200);
  const read = await GET(new Request(`http://localhost/api/sentinel?address=${address}`));
  assert.deepEqual((await read.json()).node, node);
  assert.deepEqual({ ...await activateNode(await sentinelDb(), address, Date.now() + 9999) }, node);
});

test("another wallet cannot activate with a copied signature", async () => {
  const body = await approval();
  const other = Ed25519Keypair.generate().toSuiAddress();
  body.address = other;
  // Keep the message consistent with the claimed wallet but use the wrong key.
  const forged = await wallet.signPersonalMessage(new TextEncoder().encode(activationMessage(other, body.timestamp)));
  Object.assign(body, forged);
  assert.equal((await POST(request(body))).status, 400);
  assert.equal(await readNode(await sentinelDb(), other), null);
});

test("altered messages, old approvals, malformed addresses and disabled activation are rejected", async () => {
  const body = await approval();
  assert.equal((await POST(request({ ...body, timestamp: body.timestamp - 1 }))).status, 400);
  assert.equal((await POST(request({ ...body, timestamp: Date.now() - 700_000 }))).status, 400);
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await GET(new Request("http://localhost/api/sentinel?address=bad"))).status, 400);
  assert.equal(validActivation(address, Date.now() + 100_000), false);
  process.env.SENTINEL_ACTIVATION_PAUSED = "true";
  assert.equal((await POST(request(body))).status, 503);
  assert.equal((await (await GET(new Request(`http://localhost/api/sentinel?address=${address}`))).json()).node.address, address);
  process.env.SENTINEL_ACTIVATION_PAUSED = "false";
  process.env.SENTINEL_ENABLED = "false";
  assert.equal((await POST(request(body))).status, 503);
  assert.equal((await (await GET(new Request("http://localhost/api/sentinel"))).json()).enabled, false);
  process.env.SENTINEL_ENABLED = "true";
});

test("activation fails closed without a persistent storage configuration", async () => {
  delete process.env.CHAT_DB_PATH;
  assert.equal((await POST(request(await approval()))).status, 503);
  process.env.CHAT_DB_PATH = ":memory:";
});

test("observations retain real round and transaction data and expose lookup failures", async () => {
  const now = Date.now();
  const game = { status: "fulfilled", value: { object: { json: { round: "42", closes_at_ms: String(now + 60_000), settled: false } } } };
  const event = { status: "fulfilled", value: { events: [{ json: { round: "41" }, transactionDigest: "real-test-fixture-digest" }] } };
  const check = observation(game, event, now);
  assert.equal(check.round, "42");
  assert.equal(check.lastSettledRound, "41");
  assert.equal(check.transaction, "real-test-fixture-digest");
  assert.equal(checkState(check, now), "current");
  assert.equal(checkState(check, now + 180_001), "stale");
  assert.equal(checkState({ ...check, closesAt: now - 400_000 }, now), "attention");
  assert.equal(checkState(observation(game, { status: "rejected" }, now), now), "unavailable");
  assert.equal(observation({ status: "rejected" }, event, now).connection, "unavailable");
  assert.equal(observation(game, { status: "fulfilled", value: { events: [] } }, now).settlement, "none");
  const db = await sentinelDb();
  await saveCheck(db, check);
  await saveCheck(db, check);
  assert.equal((await readChecks(db)).length, 1);
  assert.deepEqual((await readChecks(db))[0], check);
});

test("saved activation survives a database close and reopen", async () => {
  const key = Symbol.for("slvrblox.sqlite-store");
  const original = globalThis[key];
  const directory = mkdtempSync(join(tmpdir(), "sentinel-test-"));
  const file = join(directory, "nodes.sqlite");
  try {
    globalThis[key] = new DatabaseSync(file);
    const saved = await activateNode(await sentinelDb(), address, 123456);
    globalThis[key].close();
    globalThis[key] = new DatabaseSync(file);
    const restored = await readNode(await sentinelDb(), address);
    assert.deepEqual(restored, saved);
    assert.equal(restored.activatedAt, 123456);
  } finally {
    globalThis[key].close();
    globalThis[key] = original;
    rmSync(file);
    rmdirSync(directory);
  }
});

test("demo credits deduplicate observations; signed claims cannot replay into future earnings", async () => {
  const db = await sentinelDb();
  const tester = Ed25519Keypair.generate();
  const address = tester.toSuiAddress();
  const now = Date.now();
  await activateNode(db, address, now - 300_000);
  const check = { checkedAt: now - 120_000, connection: "ok", round: "42", closesAt: now - 200_000, settled: false, settlement: "none", lastSettledRound: null, transaction: null, playCount: 0 };
  await Promise.all([saveCheck(db, check), saveCheck(db, check)]);
  assert.deepEqual({ ...await readDemoRewards(db, address) }, { earned: 1, claimed: 0 });
  await saveCheck(db, { ...check, checkedAt: now - 60_000, connection: "unavailable" });
  assert.equal((await readDemoRewards(db, address)).earned, 1);
  const timestamp = Date.now();
  const signed = await tester.signPersonalMessage(new TextEncoder().encode(demoClaimMessage(address, timestamp, 1)));
  const body = { action: "claim-demo", address, timestamp, upTo: 1, ...signed };
  assert.equal((await POST(request(body))).status, 200);
  assert.equal((await POST(request({ ...body, upTo: 2 }))).status, 400);
  await saveCheck(db, { ...check, checkedAt: now });
  await Promise.all([POST(request(body)), POST(request(body))]);
  assert.deepEqual({ ...await readDemoRewards(db, address) }, { earned: 2, claimed: 1 });
  const other = Ed25519Keypair.generate().toSuiAddress();
  assert.equal((await POST(request({ ...body, address: other }))).status, 400);
});
