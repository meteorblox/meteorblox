import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const gameId = "0xbf0cc524c08bb56d806c2e760b9b1de2c757a74aed3034737a5784cb292257c9";
const refineryId = "0x26588ea54aa0a0be7081177c172e7e5fa7dfb986a53aa672f66b77a092b90c71";
const upgradeCapId = "0xe6759658c4f3e412ee0d88142671eff44c3149a8c188364b1ab0e9ff4fd143a4";
const packageId = "0x9073976791cd99b492144abc91268709b241dfc9f9c142c72490f9b0cee02c3e";
const typeOriginPackageId = "0x9f1fa8dffd2f10481f4b91bd288e52a5a90d6cfca2e7ed542624671ed7202a09";
const ledgerId = "0xa02b0a9574fc9255d5ef6c86cd9968df6e7a7913944d343ffcca1c586a22ef9c";
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
type RoundSettledJson = { round?: string | number; winning_tile?: string | number; gross?: string; winner_pool?: string };

const sui = (mist: bigint) => Number(mist) / 1_000_000_000;
const mtbx = (units: bigint) => Number(units) / 1_000_000;

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object: gameObject }, { object: refineryObject }, { object: upgradeCapObject }, { object: ledgerObject }, settledEvents] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      client.core.getObject({ objectId: refineryId, include: { json: true } }),
      client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
      client.core.getObject({ objectId: ledgerId, include: { json: true } }),
      eventClient.core.listEvents({ filter: { eventType: `${typeOriginPackageId}::game::RoundSettled` }, limit: 1, order: "descending" }).catch(() => ({ events: [] })),
    ]);
    const game = gameObject.json as GameJson;
    const refinery = refineryObject.json as RefineryJson;
    const ledger = ledgerObject.json as LedgerJson;
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
      lastRound,
      nextMaturityMs: unrefinedPositions.length ? Math.min(...unrefinedPositions.map((position) => Number(position.matures_at_ms))) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet state unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
