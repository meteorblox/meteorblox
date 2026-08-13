
import { SuiGrpcClient } from "@mysten/sui/grpc";

const gameId = "0xed69d2784a34e80ac206750ddfef18ede5f447aa8c9299c4bc64c81434c1f7fe";
const refineryId = "0x6d66c03dc8b5d5994af512a66bdc09f2b22917f7c2d19d5430d6867e22c13895";
const upgradeCapId = "0xe8a428db6b93487e7f59ffe593bb8f6e384e56ecbad5df1fd0ddc1811d1f972c";
const packageId = "0xc40d6b489086ef619baac0cc2e6396159fe30c235d122e89ce9e7d4c8c2231f7";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });

type GameEntry = { player: string; round: string; tile: number; stake: string; claimed: boolean };
type GameJson = {
  round: string; closes_at_ms: string; settled: boolean; winning_tile: number | null;
  tile_totals: string[]; entries: GameEntry[]; pot: string; winner_pool_initial: string;
  winning_entries_remaining: string; mtbx_reward_initial: string; mtbx_reward_remaining: string;
  reward_cap: unknown | null;
};
type Position = { owner: string; amount: string; awarded_at_ms: string; matures_at_ms: string; claimed: boolean };
type RefineryJson = { positions: Position[]; awarded: string; minted: string; forfeited: string };

const sui = (mist: bigint) => Number(mist) / 1_000_000_000;
const mtbx = (units: bigint) => Number(units) / 1_000_000;

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object: gameObject }, { object: refineryObject }, { object: upgradeCapObject }] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      client.core.getObject({ objectId: refineryId, include: { json: true } }),
      client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
    ]);
    const game = gameObject.json as GameJson;
    const refinery = refineryObject.json as RefineryJson;
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

    return Response.json({
      packageId, gameId, refineryId, upgradeCapId,
      gameType: (gameObject as { type?: string }).type ?? null,
      refineryType: (refineryObject as { type?: string }).type ?? null,
      upgradeCap: (upgradeCapObject as { json?: unknown }).json ?? null,
      round: Number(game.round), closesAtMs: Number(game.closes_at_ms), settled: game.settled,
      rewardsBound: game.reward_cap !== null, winningTile: winner === null ? null : winner + 1,
      tileTotals: game.tile_totals.map((value) => sui(BigInt(value))), potSui: sui(BigInt(game.pot)),
      winningEntriesRemaining: Number(game.winning_entries_remaining),
      claimableWinningEntries: userWinningEntries.length, estimatedSuiWinnings: sui(estimatedSui), estimatedMtbxWinnings: mtbx(estimatedMtbx),
      refinedMtbx: mtbx(refined), unrefinedMtbx: mtbx(unrefined), refinedPositions: refinedPositions.length,
      unrefinedPositions: unrefinedPositions.length,
      nextMaturityMs: unrefinedPositions.length ? Math.min(...unrefinedPositions.map((position) => Number(position.matures_at_ms))) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet state unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}

