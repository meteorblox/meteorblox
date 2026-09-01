import assert from "node:assert/strict";
import test from "node:test";

import { qualificationProgress, settledEntries, summarize } from "../app/api/airdrop/route.ts";

const player = `0x${"1".repeat(64)}`;
const other = `0x${"2".repeat(64)}`;

function entry(round, checkpoint, address = player) {
  return { player: address, round, checkpoint: String(checkpoint) };
}

test("only completed rounds qualify", () => {
  const entries = [entry(9, 90), entry(10, 100), entry(11, 110)];
  assert.deepEqual(settledEntries(entries, { round: "10", settled: false }).map(({ round }) => round), [9]);
  assert.deepEqual(settledEntries(entries, { round: "10", settled: true }).map(({ round }) => round), [9, 10]);
});

test("one wallet round counts once and uses its earliest checkpoint day", () => {
  const entries = [entry(7, 200), entry(7, 100), entry(8, 300), entry(8, 301, other)];
  const days = new Map([["100", "2026-08-30"], ["200", "2026-08-31"], ["300", "2026-08-31"], ["301", "2026-08-31"]]);
  const result = summarize(player, entries, days);
  assert.equal(result.qualifyingRounds, 2);
  assert.equal(result.activeDays, 2);
});

test("daily qualification is capped at 50 unique rounds", () => {
  const entries = Array.from({ length: 75 }, (_, index) => entry(index + 1, index + 1));
  const days = new Map(entries.map(({ checkpoint }) => [checkpoint, "2026-08-31"]));
  const result = summarize(player, entries, days);
  assert.equal(result.qualifyingRounds, 50);
  assert.equal(result.activeDays, 1);
});

test("a level requires both its round and active-day thresholds", () => {
  const entries = Array.from({ length: 75 }, (_, index) => entry(index + 1, index + 1));
  const fiveDays = new Map(entries.map(({ checkpoint }, index) => [checkpoint, `2026-08-${String(25 + (index % 5)).padStart(2, "0")}`]));
  const tenDays = new Map(entries.map(({ checkpoint }, index) => [checkpoint, `2026-08-${String(20 + (index % 10)).padStart(2, "0")}`]));
  assert.equal(summarize(player, entries, fiveDays).currentLevel, "BLOX TESTER");
  assert.equal(summarize(player, entries, tenDays).currentLevel, "ACTIVE MINER");
});

test("Master Miner remains explicitly provisional pending manual review", () => {
  const entries = Array.from({ length: 1_000 }, (_, index) => entry(index + 1, index + 1));
  const days = new Map(entries.map(({ checkpoint }, index) => [checkpoint, `2026-08-${String(1 + (index % 30)).padStart(2, "0")}`]));
  const result = summarize(player, entries, days);
  assert.equal(result.currentLevel, "MASTER MINER (PROVISIONAL)");
  assert.equal(qualificationProgress(result), 100);
});

test("progress is limited by the less-complete requirement", () => {
  const entries = Array.from({ length: 50 }, (_, index) => entry(index + 1, index + 1));
  const days = new Map(entries.map(({ checkpoint }, index) => [checkpoint, `2026-08-${String(28 + (index % 3)).padStart(2, "0")}`]));
  const result = summarize(player, entries, days);
  assert.equal(result.nextLevel?.name, "BLOX TESTER");
  assert.equal(qualificationProgress(result), 60);
});
