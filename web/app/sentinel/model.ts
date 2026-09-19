export const SENTINEL_VMH = 5;
export const CHECK_STALE_MS = 180_000;
export const WALLET_PATTERN = /^0x[a-f0-9]{64}$/;

export type SentinelNode = { address: string; activatedAt: number };
export type ProtocolCheck = {
  checkedAt: number;
  round: string | null;
  closesAt: number | null;
  settled: boolean | null;
  connection: "ok" | "unavailable";
  settlement: "observed" | "none" | "unavailable";
  lastSettledRound: string | null;
  transaction: string | null;
  // Missing in observations recorded before activity monitoring was introduced.
  playCount?: number | null;
};

export const ACTIVITY_GRACE_MS = 120_000;
export type ActivityPoint = { time: number; value: number | null };

// An activity index only. Never use this value for reward accounting.
export function activitySeries(checks: ProtocolCheck[], now = Date.now()): ActivityPoint[] {
  const ordered = [...checks].filter((check) => check.checkedAt <= now).sort((a, b) => a.checkedAt - b.checkedAt);
  let lastActiveAt = -Infinity;
  let lastStrength = 0;
  let previousAt = -Infinity;
  const points: ActivityPoint[] = [];
  for (const check of ordered) {
    if (check.checkedAt - previousAt > CHECK_STALE_MS) {
      lastActiveAt = -Infinity;
      lastStrength = 0;
      if (points.length) points.push({ time: previousAt + CHECK_STALE_MS, value: null });
    }
    previousAt = check.checkedAt;
    if (check.connection !== "ok" || !Number.isSafeInteger(check.playCount) || check.playCount! < 0) {
      points.push({ time: check.checkedAt, value: null });
      lastActiveAt = -Infinity;
      lastStrength = 0;
      continue;
    }
    const playing = check.playCount! > 0 && check.settled === false && check.closesAt !== null && check.checkedAt < check.closesAt;
    if (playing) {
      lastActiveAt = check.checkedAt;
      lastStrength = Math.min(5, Math.sqrt(check.playCount!));
    }
    points.push({ time: check.checkedAt, value: playing ? lastStrength : lastStrength * Math.max(0, 1 - (check.checkedAt - lastActiveAt) / ACTIVITY_GRACE_MS) });
  }
  const latest = ordered.at(-1);
  if (latest && now > latest.checkedAt) {
    const valid = now - latest.checkedAt <= CHECK_STALE_MS && points.at(-1)?.value !== null;
    const playing = valid && latest.playCount! > 0 && latest.settled === false && latest.closesAt !== null && now < latest.closesAt;
    // The round closing is the last possible activity boundary for this sample.
    const anchor = latest.playCount! > 0 && latest.settled === false && latest.closesAt !== null
      ? Math.max(lastActiveAt, Math.min(latest.closesAt, now)) : lastActiveAt;
    points.push({ time: now, value: !valid ? null : playing ? lastStrength : lastStrength * Math.max(0, 1 - (now - anchor) / ACTIVITY_GRACE_MS) });
  }
  return points;
}

export function activationMessage(address: string, timestamp: number) {
  return `SLVRBLOX Sentinel testnet activation\nWallet: ${address}\nTimestamp: ${timestamp}\nActivate one free test node. No purchase or token transfer. This is not a mainnet node.`;
}

export function demoClaimMessage(address: string, timestamp: number, upTo: number) {
  return `SLVRBLOX Sentinel simulated reward claim\nWallet: ${address}\nTimestamp: ${timestamp}\nClaim through demo credit: ${upTo}\nDemo only. No monetary value, token transfer, gas payment, or mainnet entitlement.`;
}

export function validActivation(address: unknown, timestamp: unknown, now = Date.now()): address is string {
  return typeof address === "string" && WALLET_PATTERN.test(address)
    && typeof timestamp === "number" && Number.isSafeInteger(timestamp)
    && timestamp <= now + 30_000 && timestamp >= now - 600_000;
}

export function checkState(check: ProtocolCheck | null, now = Date.now()) {
  if (!check) return "waiting";
  if (now - check.checkedAt > CHECK_STALE_MS) return "stale";
  if (check.connection !== "ok" || check.settlement === "unavailable") return "unavailable";
  // Empty rounds intentionally sleep to conserve keeper gas.
  if (check.settled === false && check.playCount !== 0 && check.closesAt !== null && now > check.closesAt + 300_000) return "attention";
  return "current";
}
