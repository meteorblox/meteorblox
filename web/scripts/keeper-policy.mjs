export function hasFundedAutoplay(plans) {
  return plans.some((plan) => {
    if (!plan.active || BigInt(plan.rounds_remaining) <= 0n) return false;
    const tiles = Array.isArray(plan.tiles) ? plan.tiles.length
      : typeof plan.tiles === 'string' ? Buffer.from(plan.tiles, 'base64').length : 0;
    return tiles > 0 && BigInt(plan.amount_per_tile) > 0n
      && BigInt(plan.funds) >= BigInt(plan.amount_per_tile) * BigInt(tiles);
  });
}

export function expiredRoundAction(game, plans, now) {
  if (game.settled || now < Number(game.closes_at_ms)) return 'wait';
  const occupied = BigInt(game.pot ?? '0') > 0n
    || (game.entries ?? []).some((entry) => BigInt(entry.round) === BigInt(game.round));
  if (occupied) return 'settle';
  return hasFundedAutoplay(plans) ? 'wake-autoplay' : 'idle';
}
