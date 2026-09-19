import test from 'node:test';
import assert from 'node:assert/strict';
import { expiredRoundAction, hasFundedAutoplay } from '../scripts/keeper-policy.mjs';
const game = { round: '9', closes_at_ms: '1000', settled: false, pot: '0', entries: [] };
const plan = { active: true, rounds_remaining: '2', amount_per_tile: '1000', funds: '4000', tiles: [0, 1], last_round_played: '9' };
test('empty expired rounds sleep without active funded autoplay', () => {
  assert.equal(expiredRoundAction(game, [], 2000), 'idle');
  assert.equal(expiredRoundAction(game, [{ ...plan, active: false }], 2000), 'idle');
  assert.equal(expiredRoundAction(game, [{ ...plan, rounds_remaining: '0' }], 2000), 'idle');
  assert.equal(expiredRoundAction(game, [{ ...plan, funds: '1' }], 2000), 'idle');
});
test('funded autoplay can wake the next round even if it already played this one', () => {
  assert.equal(expiredRoundAction(game, [plan], 2000), 'wake-autoplay');
  assert.equal(hasFundedAutoplay([{ ...plan, tiles: 'AAE=' }]), true);
  assert.equal(hasFundedAutoplay([{ ...plan, tiles: [] }]), false);
});
test('occupied rounds settle, never take the empty wake path', () => {
  assert.equal(expiredRoundAction({ ...game, pot: '1000' }, [plan], 2000), 'settle');
  assert.equal(expiredRoundAction({ ...game, entries: [{ round: '9' }] }, [], 2000), 'settle');
  assert.equal(expiredRoundAction({ ...game, entries: [{ round: '8' }] }, [], 2000), 'idle');
});
test('open and already-settled rounds wait', () => {
  assert.equal(expiredRoundAction(game, [plan], 900), 'wait');
  assert.equal(expiredRoundAction({ ...game, settled: true }, [plan], 2000), 'wait');
});
