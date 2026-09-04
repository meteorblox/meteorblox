import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const arg = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
};
const players = Math.max(1, arg("players", 500));
const rounds = Math.max(1, arg("rounds", 100));
const concurrency = Math.max(1, arg("concurrency", 10));
const live = process.argv.includes("--live");
const baseUrl = process.env.LOAD_TEST_URL ?? "https://www.slvrblox.com";
const BPS = 10_000n;
const FEE_BPS = 1_000n;
const DSLVR_REWARD = 250_000n;
let seed = 0x5a17b10c;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const percentile = (values, p) => values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;

function simulate() {
  let totalGross = 0n;
  let totalPaid = 0n;
  let totalFees = 0n;
  let totalDslvr = 0n;
  let peakEntries = 0;
  let peakWinningEntries = 0;
  let totalEntries = 0;

  for (let round = 1; round <= rounds; round += 1) {
    const entries = [];
    const tileTotals = Array(25).fill(0n);
    for (let player = 0; player < players; player += 1) {
      const tileCount = 1 + Math.floor(random() * 5);
      const available = Array.from({ length: 25 }, (_, index) => index);
      for (let choice = 0; choice < tileCount; choice += 1) {
        const selected = Math.floor(random() * available.length);
        const tile = available.splice(selected, 1)[0];
        const stake = BigInt(1 + Math.floor(random() * 100)) * 1_000_000n;
        entries.push({ player, tile, stake });
        tileTotals[tile] += stake;
      }
    }
    const occupied = tileTotals.map((amount, tile) => ({ amount, tile })).filter(({ amount }) => amount > 0n);
    const winningTile = occupied[Math.floor(random() * occupied.length)].tile;
    const winning = entries.filter((entry) => entry.tile === winningTile);
    const gross = tileTotals.reduce((sum, amount) => sum + amount, 0n);
    const fee = gross * FEE_BPS / BPS;
    const pool = gross - fee;
    const winningStake = winning.reduce((sum, entry) => sum + entry.stake, 0n);
    let suiRemaining = pool;
    let dslvrRemaining = DSLVR_REWARD;
    let paid = 0n;
    let dslvrPaid = 0n;
    winning.forEach((entry, index) => {
      const last = index === winning.length - 1;
      const suiAmount = last ? suiRemaining : pool * entry.stake / winningStake;
      const dslvrAmount = last ? dslvrRemaining : DSLVR_REWARD * entry.stake / winningStake;
      suiRemaining -= suiAmount;
      dslvrRemaining -= dslvrAmount;
      paid += suiAmount;
      dslvrPaid += dslvrAmount;
    });
    assert.equal(paid, pool, `round ${round} SUI conservation`);
    assert.equal(dslvrPaid, DSLVR_REWARD, `round ${round} DSLVR conservation`);
    assert.equal(gross, paid + fee, `round ${round} gross conservation`);
    totalGross += gross;
    totalPaid += paid;
    totalFees += fee;
    totalDslvr += dslvrPaid;
    totalEntries += entries.length;
    peakEntries = Math.max(peakEntries, entries.length);
    peakWinningEntries = Math.max(peakWinningEntries, winning.length);
  }
  return { players, rounds, totalEntries, averageEntriesPerRound: totalEntries / rounds, peakEntries, peakWinningEntries, totalGrossMist: totalGross.toString(), totalPaidMist: totalPaid.toString(), totalFeesMist: totalFees.toString(), totalDslvrMicro: totalDslvr.toString(), accountingErrors: 0 };
}

async function soak() {
  const paths = ["/api/game", "/api/explore", "/api/chat"];
  const jobs = Array.from({ length: concurrency * 10 }, (_, index) => paths[index % paths.length]);
  const timings = [];
  const errors = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      const path = jobs[index];
      const started = performance.now();
      try {
        const response = await fetch(`${baseUrl}${path}`, { headers: { "user-agent": "SLVRBLOX-load-validation/1.0" } });
        await response.arrayBuffer();
        timings.push(performance.now() - started);
        if (!response.ok) errors.push(`${path}: HTTP ${response.status}`);
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  timings.sort((a, b) => a - b);
  return { url: baseUrl, requests: jobs.length, concurrency, succeeded: jobs.length - errors.length, failed: errors.length, p50Ms: Math.round(percentile(timings, .5)), p95Ms: Math.round(percentile(timings, .95)), p99Ms: Math.round(percentile(timings, .99)), errors: errors.slice(0, 10) };
}

const report = { generatedAt: new Date().toISOString(), simulation: simulate(), liveSoak: live ? await soak() : "Skipped (pass --live to enable)" };
console.log(JSON.stringify(report, null, 2));
if (live && report.liveSoak.failed > 0) process.exitCode = 1;
