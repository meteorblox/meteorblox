import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const gameId = "0xd9fcf2c789432d7ad59ff04918880d96842f4a42cd3032616829ca383816ac6f";
const refineryId = "0xb59cb6847c8e7582bce7d762aff44012aa9babe38cb0be7634aecc644e732d4c";
const upgradeCapId = "0x9cff31debda813ddc8b4997143ca9ed60f4f1b75147a9dd99f33948fc28acc2d";
const packageId = "0x46682f6d7f3c459cbd9859575cd610e5468cdc7959fc1c2b9db45b029a84274d";
const typeOriginPackageId = "0x9f1fa8dffd2f10481f4b91bd288e52a5a90d6cfca2e7ed542624671ed7202a09";
const ledgerId = "0xa02b0a9574fc9255d5ef6c86cd9968df6e7a7913944d343ffcca1c586a22ef9c";
const autoplayRegistryId = process.env.SUI_AUTOPLAY_REGISTRY_ID ?? process.env.NEXT_PUBLIC_SUI_AUTOPLAY_REGISTRY_ID ?? "";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type GameEntry = { player: string; round: string; tile: number; stake: string; claimed: boolean };
type GameJson = {
  round: string; closes_at_ms: string; settled: boolean; winning_tile: number | null;
  tile_totals: string[]; entries: GameEntry[]; pot: string; winner_pool_initial: string;
  winning_entries_remaining: string; mtbx_reward_initial: string; mtbx_reward_remaining: string;
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
      client.core.getObject({ objectId: ledgerId, include: { json: true } }),
      autoplayRegistryId ? client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } }) : Promise.resolve({ object: null }),
      eventClient.core.listEvents({ filter: { eventType: `${typeOriginPackageId}::game::RoundSettled` }, limit: 1, order: "descending" }).catch(() => ({ events: [] })),
    ]);
    const game = gameObject.json as GameJson;
    const refinery = refineryObject.json as RefineryJson;
    const ledger = ledgerObject.json as LedgerJson;
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
    const mtbxPool = BigInt(game.mtbx_reward_initial);
    const estimatedSui = winningTotal > 0n ? winnerPool * userWinningStake / winningTotal : 0n;
    const estimatedMtbx = winningTotal > 0n ? mtbxPool * userWinningStake / winningTotal : 0n;
    const userPositions = address ? refinery.positions.filter((position) => position.owner.toLowerCase() === address && !position.claimed) : [];
    const refinedPositions = userPositions.filter((position) => Number(position.matures_at_ms) <= now);
    const unrefinedPositions = userPositions.filter((position) => Number(position.matures_at_ms) > now);
    const refined = refinedPositions.reduce((sum, position) => sum + BigInt(position.amount), 0n);
    const unrefined = unrefinedPositions.reduce((sum, position) => sum + BigInt(position.amount), 0n);
    const ledgerCredit = address ? ledger.credits.find((credit) => credit.owner.toLowerCase() === address) : undefined;
    const autoplayPlans = address ? (registry?.plans ?? []).filter((plan) =>
      plan.owner.toLowerCase() === address && plan.active && BigInt(plan.rounds_remaining) > 0n
    ).map((plan) => ({
      planId: Number(plan.plan_id), roundsRemaining: Number(plan.rounds_remaining),
      tiles: decodeTiles(plan.tiles).map((tile) => tile + 1), tileCount: decodeTiles(plan.tiles).length,
      amountPerTileSui: sui(BigInt(plan.amount_per_tile)),
      fundedSui: sui(BigInt(plan.funds)), lastRoundPlayed: Number(plan.last_round_played),
    })) : [];
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
      lastRound,
      nextMaturityMs: unrefinedPositions.length ? Math.min(...unrefinedPositions.map((position) => Number(position.matures_at_ms))) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet state unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
