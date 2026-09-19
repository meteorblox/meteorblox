import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySeries } from '../app/sentinel/model.ts';
import { observation } from '../scripts/sentinel-monitor.mjs';
const start = 1_000_000;
const check = (offset, count, extra = {}) => ({ checkedAt: start + offset, round: '1', closesAt: start + 600_000, settled: false, connection: 'ok', settlement: 'none', transaction: null, lastSettledRound: null, playCount: count, ...extra });
const value = (checks, offset) => activitySeries(checks, start + offset).at(-1)?.value;

test('meter rises with confirmed activity, stays capped, and empty timers are zero', () => {
  assert.equal(value([check(0, 0)], 0), 0);
  assert.equal(value([check(0, 1)], 0), 1);
  assert.equal(value([check(0, 9)], 0), 3);
  assert.equal(value([check(0, 100)], 0), 5);
});
test('round transitions preserve activity and grace expires without further play', () => {
  assert.equal(value([check(0, 4), check(60_000, 0, { round: '2' })], 60_000), 1);
  assert.equal(value([check(0, 4), check(60_000, 0, { round: '2' })], 120_000), 0);
  assert.equal(value([check(0, 4), check(60_000, 9, { round: '2' })], 60_000), 3);
});
test('round closing starts decay and settled entries cannot keep activity alive', () => {
  assert.equal(value([check(0, 4, { closesAt: start + 30_000 })], 90_000), 1);
  assert.equal(value([check(0, 4, { closesAt: start + 30_000 })], 150_000), 0);
  assert.equal(value([check(0, 4, { settled: true })], 0), 0);
});
test('missing, old-format, failed and stale samples are unavailable rather than zero', () => {
  assert.equal(value([check(0, undefined)], 0), null);
  assert.equal(value([check(0, null)], 0), null);
  assert.equal(value([check(0, 4)], 180_001), null);
  assert.equal(value([check(0, 4), check(60_000, null, { connection: 'unavailable' })], 60_000), null);
  const points = activitySeries([check(0, 4), check(300_000, 4)], start + 300_000);
  assert.equal(points.some(p => p.value === null), true);
});
test('observer counts paid entries in current round including autoplay, excludes history', () => {
  const game = { round: '2', closes_at_ms: start + 60_000, settled: false, entries: [
    { round: '1', stake: '1000' }, { round: '2', stake: '1000' }, { round: '2', stake: '2000' }, { round: '2', stake: '0' },
  ] };
  const sample = observation({ status: 'fulfilled', value: { object: { json: game } } }, { status: 'fulfilled', value: { events: [] } }, start);
  assert.equal(sample.playCount, 2);
});
