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
};

export function activationMessage(address: string, timestamp: number) {
  return `SLVRBLOX Sentinel testnet activation\nWallet: ${address}\nTimestamp: ${timestamp}\nActivate one free test node. No purchase or token transfer. This is not a mainnet node.`;
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
  if (check.settled === false && check.closesAt !== null && now > check.closesAt + 300_000) return "attention";
  return "current";
}
