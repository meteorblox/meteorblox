import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const gameId = "0x07385f18763978170f254199cdc3468b05935037916549ac60984c68e7ba31b5";
const refineryId = "0xb0804c01a08e5e1fc86c831b7ed5cd18fd9189e4d8d45ca7e3617acda1560ec2";
const upgradeCapId = "0xf9e2905b15ddecdebeac8d6195169660d5998d0a76f2e4af7fda8adc70a2c83a";
const packageId = "0xbd82e0552e768059b7768e78963c59c9020003b1cf6c9c078744e6b617628f6e";
const ledgerId = "0x7f795f4533202fbcd83a5c20a505f18126e9740a8e804e1496eb56f872a6cb8f";
const autoplayRegistryId = "0x12686fca999b0457f572ca716c2eb7276510a13f26772b8222aa8cdf88f154cf";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type GameEntry = { player: string; round: string; tile: number; stake: string; claimed: boolean };
type GameJson = {
  round: string; closes_at_ms: string; settled: boolean; winning_tile: number | null;
  tile_totals: string[]; entries: GameEntry[]; pot: string; winner_pool_initial: string;
  winning_entries_remaining: string; dslvr_reward_initial: string; dslvr_reward_remaining: string;
  reward_cap: unknown | null;
};
type Position = { owner: string; amount: string; awarded_at_ms: string; matures_at_ms: string; claimed: boolean };
type RefineryJson = { positions: Position[]; awarded: string; minted: string; forfeited: string };
type LedgerJson = { game: string; credits: Array<{ owner: string; sui: string }> };
type AutoplayPlanJson = { plan_id: string; owner: string; tiles: string | number[]; amount_per_tile: string; rounds_remaining: string; last_round_played: string; funds: string; active: boolean };
type AutoplayRegistryJson = { plans: AutoplayPlanJson[]; next_plan_id: string };
type RoundSettledJson = { round?: string | number; winning_tile?: string | number; gross?: string; winner_pool?: string };

const sui = (mist: bigint) => Number(mist) / 1_000_000_000;
const mtbx = (units: bigint) => Number(units) / 1_000_000;
const decodeTiles = (value: string | number[]) => Array.isArray(value) ? value : Array.from(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object: gameObject }, { object: refineryObject }, { object: upgradeCapObject }, { object: ledgerObject }, registryResult, settledEvents, walletBalanceResult] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      client.core.getObject({ objectId: refineryId, include: { json: true } }),
      client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
      ledgerId ? client.core.getObject({ objectId: ledgerId, include: { json: true } }) : Promise.resolve({ object: null }),
      autoplayRegistryId ? client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } }) : Promise.resolve({ object: null }),
      eventClient.core.listEvents({ filter: { eventType: `${packageId}::game::RoundSettled` }, limit: 1, order: "descending" }).catch(() => ({ events: [] })),
      address ? client.core.getBalance({ owner: address }).catch(() => null) : Promise.resolve(null),
    ]);
    const game = gameObject.json as GameJson;
    const refinery = refineryObject.json as RefineryJson;
    const ledger = ledgerObject?.json as LedgerJson | undefined;
    const registry = registryResult.object?.json as AutoplayRegistryJson | undefined;
    const now = Date.now();
    const round = BigInt(game.round);
    const winner = game.winning_tile;
    const winningTotal = winner === null ? 0n : BigInt(game.tile_totals[winner] ?? "0");
    const userWinningEntries = address && winner !== null ? game.entries.filter((entry) =>
      entry.player.toLowerCase() === address && BigInt(entry.round) === round && entry.tile === winner && !entry.claimed
    ) : [];
    const userWinningStake = userWinningEntries.reduce((sum, entry) => sum + BigInt(entry.stake), 0n);
    const winnerPool = BigInt(game.winner_pool_initial);
    const mtbxPool = BigInt(game.dslvr_reward_initial);
    const estimatedSui = winningTotal > 0n ? winnerPool * userWinningStake / winningTotal : 0n;
    const estimatedMtbx = winningTotal > 0n ? mtbxPool * userWinningStake / winningTotal : 0n;
    const userPositions = address ? refinery.positions.filter((position) => position.owner.toLowerCase() === address && !position.claimed) : [];
    const refinedPositions = userPositions.filter((position) => Number(position.matures_at_ms) <= now);
    const unrefinedPositions = userPositions.filter((position) => Number(position.matures_at_ms) > now);
    const refined = refinedPositions.reduce((sum, position) => sum + BigInt(position.amount), 0n);
    const unrefined = unrefinedPositions.reduce((sum, position) => sum + BigInt(position.amount), 0n);
    const ledgerCredit = address ? ledger?.credits.find((credit) => credit.owner.toLowerCase() === address) : undefined;
    const autoplayPlans = address ? (registry?.plans ?? []).filter((plan) =>
      plan.owner.toLowerCase() === address && plan.active && BigInt(plan.rounds_remaining) > 0n
    ).map((plan) => ({
      planId: Number(plan.plan_id), roundsRemaining: Number(plan.rounds_remaining),
      tiles: decodeTiles(plan.tiles).map((tile) => tile + 1), tileCount: decodeTiles(plan.tiles).length,
      amountPerTileSui: sui(BigInt(plan.amount_per_tile)),
      fundedSui: sui(BigInt(plan.funds)), lastRoundPlayed: Number(plan.last_round_played),
    })) : [];
    const playedTiles = address ? Array.from(new Set(game.entries.filter((entry) =>
      entry.player.toLowerCase() === address && BigInt(entry.round) === round
    ).map((entry) => entry.tile + 1))) : [];
    const lastEvent = settledEvents.events[0];
    const lastJson = (lastEvent?.json ?? null) as RoundSettledJson | null;
    const lastRound = lastJson ? {
      round: Number(lastJson.round ?? 0), winningTile: Number(lastJson.winning_tile ?? 0) + 1,
      deployedSui: sui(BigInt(lastJson.gross ?? "0")), rewardPoolSui: sui(BigInt(lastJson.winner_pool ?? "0")),
      mtbxAwarded: 0.25, transaction: lastEvent?.transactionDigest ?? null,
    } : null;

    return Response.json({
      packageId, gameId, refineryId, upgradeCapId, ledgerId,
      gameType: (gameObject as { type?: string }).type ?? null,
      refineryType: (refineryObject as { type?: string }).type ?? null,
      upgradeCap: (upgradeCapObject as { json?: unknown }).json ?? null,
      round: Number(game.round), closesAtMs: Number(game.closes_at_ms),
      remainingMs: Math.max(0, Number(game.closes_at_ms) - now), settled: game.settled,
      rewardsBound: game.reward_cap !== null, winningTile: winner === null ? null : winner + 1,
      tileTotals: game.tile_totals.map((value) => sui(BigInt(value))), potSui: sui(BigInt(game.pot)),
      winningEntriesRemaining: Number(game.winning_entries_remaining),
      claimableWinningEntries: userWinningEntries.length, estimatedSuiWinnings: sui(estimatedSui), estimatedMtbxWinnings: mtbx(estimatedMtbx),
      refinedMtbx: mtbx(refined), unrefinedMtbx: mtbx(unrefined), refinedPositions: refinedPositions.length,
      unrefinedPositions: unrefinedPositions.length,
      ledgerSui: sui(BigInt(ledgerCredit?.sui ?? "0")),
      walletSui: walletBalanceResult ? sui(BigInt(walletBalanceResult.balance.balance)) : 0,
      autoplayPlans,
      playedTiles,
      lastRound,
      nextMaturityMs: unrefinedPositions.length ? Math.min(...unrefinedPositions.map((position) => Number(position.matures_at_ms))) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet state unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const gameId = "0x07385f18763978170f254199cdc3468b05935037916549ac60984c68e7ba31b5";
const refineryId = "0xb0804c01a08e5e1fc86c831b7ed5cd18fd9189e4d8d45ca7e3617acda1560ec2";
const upgradeCapId = "0xf9e2905b15ddecdebeac8d6195169660d5998d0a76f2e4af7fda8adc70a2c83a";
const packageId = "0xbd82e0552e768059b7768e78963c59c9020003b1cf6c9c078744e6b617628f6e";
const ledgerId = "0x7f795f4533202fbcd83a5c20a505f18126e9740a8e804e1496eb56f872a6cb8f";
const autoplayRegistryId = "0x12686fca999b0457f572ca716c2eb7276510a13f26772b8222aa8cdf88f154cf";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type GameEntry = { player: string; round: string; tile: number; stake: string; claimed: boolean };
type GameJson = {
  round: string; closes_at_ms: string; settled: boolean; winning_tile: number | null;
  tile_totals: string[]; entries: GameEntry[]; pot: string; winner_pool_initial: string;
  winning_entries_remaining: string; dslvr_reward_initial: string; dslvr_reward_remaining: string;
  reward_cap: unknown | null;
};
type Position = { owner: string; amount: string; awarded_at_ms: string; matures_at_ms: string; claimed: boolean };
type RefineryJson = { positions: Position[]; awarded: string; minted: string; forfeited: string };
type LedgerJson = { game: string; credits: Array<{ owner: string; sui: string }> };
type AutoplayPlanJson = { plan_id: string; owner: string; tiles: string | number[]; amount_per_tile: string; rounds_remaining: string; last_round_played: string; funds: string; active: boolean };
type AutoplayRegistryJson = { plans: AutoplayPlanJson[]; next_plan_id: string };
type RoundSettledJson = { round?: string | number; winning_tile?: string | number; gross?: string; winner_pool?: string };

const sui = (mist: bigint) => Number(mist) / 1_000_000_000;
const mtbx = (units: bigint) => Number(units) / 1_000_000;
const decodeTiles = (value: string | number[]) => Array.isArray(value) ? value : Array.from(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object: gameObject }, { object: refineryObject }, { object: upgradeCapObject }, { object: ledgerObject }, registryResult, settledEvents] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      client.core.getObject({ objectId: refineryId, include: { json: true } }),
      client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
      ledgerId ? client.core.getObject({ objectId: ledgerId, include: { json: true } }) : Promise.resolve({ object: null }),
      autoplayRegistryId ? client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } }) : Promise.resolve({ object: null }),
      eventClient.core.listEvents({ filter: { eventType: `${packageId}::game::RoundSettled` }, limit: 1, order: "descending" }).catch(() => ({ events: [] })),
    ]);
    const game = gameObject.json as GameJson;
    const refinery = refineryObject.json as RefineryJson;
    const ledger = ledgerObject?.json as LedgerJson | undefined;
    const registry = registryResult.object?.json as AutoplayRegistryJson | undefined;
    const now = Date.now();
    const round = BigInt(game.round);
    const winner = game.winning_tile;
    const winningTotal = winner === null ? 0n : BigInt(game.tile_totals[winner] ?? "0");
    const userWinningEntries = address && winner !== null ? game.entries.filter((entry) =>
      entry.player.toLowerCase() === address && BigInt(entry.round) === round && entry.tile === winner && !entry.claimed
    ) : [];
    const userWinningStake = userWinningEntries.reduce((sum, entry) => sum + BigInt(entry.stake), 0n);
    const winnerPool = BigInt(game.winner_pool_initial);
    const mtbxPool = BigInt(game.dslvr_reward_initial);
    const estimatedSui = winningTotal > 0n ? winnerPool * userWinningStake / winningTotal : 0n;
    const estimatedMtbx = winningTotal > 0n ? mtbxPool * userWinningStake / winningTotal : 0n;
    const userPositions = address ? refinery.positions.filter((position) => position.owner.toLowerCase() === address && !position.claimed) : [];
    const refinedPositions = userPositions.filter((position) => Number(position.matures_at_ms) <= now);
    const unrefinedPositions = userPositions.filter((position) => Number(position.matures_at_ms) > now);
    const refined = refinedPositions.reduce((sum, position) => sum + BigInt(position.amount), 0n);
    const unrefined = unrefinedPositions.reduce((sum, position) => sum + BigInt(position.amount), 0n);
    const ledgerCredit = address ? ledger?.credits.find((credit) => credit.owner.toLowerCase() === address) : undefined;
    const autoplayPlans = address ? (registry?.plans ?? []).filter((plan) =>
      plan.owner.toLowerCase() === address && plan.active && BigInt(plan.rounds_remaining) > 0n
    ).map((plan) => ({
      planId: Number(plan.plan_id), roundsRemaining: Number(plan.rounds_remaining),
      tiles: decodeTiles(plan.tiles).map((tile) => tile + 1), tileCount: decodeTiles(plan.tiles).length,
      amountPerTileSui: sui(BigInt(plan.amount_per_tile)),
      fundedSui: sui(BigInt(plan.funds)), lastRoundPlayed: Number(plan.last_round_played),
    })) : [];
    const playedTiles = address ? Array.from(new Set(game.entries.filter((entry) =>
      entry.player.toLowerCase() === address && BigInt(entry.round) === round
    ).map((entry) => entry.tile + 1))) : [];
    const lastEvent = settledEvents.events[0];
    const lastJson = (lastEvent?.json ?? null) as RoundSettledJson | null;
    const lastRound = lastJson ? {
      round: Number(lastJson.round ?? 0), winningTile: Number(lastJson.winning_tile ?? 0) + 1,
      deployedSui: sui(BigInt(lastJson.gross ?? "0")), rewardPoolSui: sui(BigInt(lastJson.winner_pool ?? "0")),
      mtbxAwarded: 0.25, transaction: lastEvent?.transactionDigest ?? null,
    } : null;

    return Response.json({
      packageId, gameId, refineryId, upgradeCapId, ledgerId,
      gameType: (gameObject as { type?: string }).type ?? null,
      refineryType: (refineryObject as { type?: string }).type ?? null,
      upgradeCap: (upgradeCapObject as { json?: unknown }).json ?? null,
      round: Number(game.round), closesAtMs: Number(game.closes_at_ms),
      remainingMs: Math.max(0, Number(game.closes_at_ms) - now), settled: game.settled,
      rewardsBound: game.reward_cap !== null, winningTile: winner === null ? null : winner + 1,
      tileTotals: game.tile_totals.map((value) => sui(BigInt(value))), potSui: sui(BigInt(game.pot)),
      winningEntriesRemaining: Number(game.winning_entries_remaining),
      claimableWinningEntries: userWinningEntries.length, estimatedSuiWinnings: sui(estimatedSui), estimatedMtbxWinnings: mtbx(estimatedMtbx),
      refinedMtbx: mtbx(refined), unrefinedMtbx: mtbx(unrefined), refinedPositions: refinedPositions.length,
      unrefinedPositions: unrefinedPositions.length,
      ledgerSui: sui(BigInt(ledgerCredit?.sui ?? "0")),
      autoplayPlans,
      playedTiles,
      lastRound,
      nextMaturityMs: unrefinedPositions.length ? Math.min(...unrefinedPositions.map((position) => Number(position.matures_at_ms))) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet state unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
