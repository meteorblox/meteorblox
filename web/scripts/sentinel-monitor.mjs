import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { sentinelDb, saveCheck } from "../db/sentinel.ts";

export const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const originPackageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";

export function observation(gameResult, eventResult, checkedAt = Date.now()) {
  const game = gameResult.status === "fulfilled" ? gameResult.value?.object?.json : null;
  const validGame = game && /^\d+$/.test(String(game.round)) && Number.isFinite(Number(game.closes_at_ms)) && typeof game.settled === "boolean";
  const events = eventResult.status === "fulfilled" ? eventResult.value?.events : null;
  const event = Array.isArray(events) ? events[0] : null;
  return {
    checkedAt,
    connection: validGame ? "ok" : "unavailable",
    round: validGame ? String(game.round) : null,
    closesAt: validGame ? Number(game.closes_at_ms) : null,
    settled: validGame ? game.settled : null,
    settlement: !Array.isArray(events) ? "unavailable" : event ? "observed" : "none",
    lastSettledRound: event?.json?.round == null ? null : String(event.json.round),
    transaction: typeof event?.transactionDigest === "string" ? event.transactionDigest : null,
  };
}

export async function runMonitor() {
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443" });
  const events = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  while (!stopping) {
    try {
      const db = await sentinelDb();
      const signal = AbortSignal.timeout(15_000);
      const [game, settlement] = await Promise.allSettled([
        client.core.getObject({ objectId: gameId, include: { json: true }, signal }),
        events.core.listEvents({ filter: { eventType: `${originPackageId}::game::RoundSettled` }, limit: 1, order: "descending", signal }),
      ]);
      await saveCheck(db, observation(game, settlement));
    } catch { console.error("[sentinel] Could not persist protocol observation; dashboard will show stale data."); }
    for (let i = 0; i < 60 && !stopping; i++) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

if (process.argv.includes("--run")) await runMonitor();
