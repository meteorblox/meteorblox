import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { bcs } from "@mysten/sui/bcs";
import { getKeeperHealth } from "../../../db/keeper-health.ts";

const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const refineryId = "0x15596af5d595d85f7bde4fa9b76b2c04ec30569cf3f8b763f02524ae928f06fa";
const upgradeCapId = "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d";
const originPackageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const fallbackPackageId = "0x1104e6c0e56478ad3f91b77f1058416c846f278f79ff1039162d59ec132dd5b5";
const dslvrType = `${originPackageId}::dslvr::DSLVR`;
const ledgerId = "0xc065549eb934c1b628f761d1c1549c8b638bfa3ed6bfda15c129f8d0931b4476";
const autoplayRegistryId = "0x3a9762f85ef2915f02468627cd33ce3d4b33bbe7d3b31ea15b618a378e18fa3f";
const motherlodeEventPackageId = "0x0de2330f503784f12b4abf7484f336976149e4056784ebb1709a4c38889e0b99";
const keeperAddress = "0xf03dfdd7c9f36d3ceed427538f3b717e79c22119df99171cb04e7013216cb960";
const keeperLowBalanceMist = 250_000_000n;
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
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
type RefineryV2Json = { wallets: { id: { id: { bytes: string } }; size: string }; active_wallets: string; open_positions: string; migration_complete: boolean };
type LedgerJson = { game: string; credits: Array<{ owner: string; sui: string }> };
type AutoplayPlanJson = { plan_id: string; owner: string; tiles: string | number[]; amount_per_tile: string; rounds_remaining: string; last_round_played: string; funds: string; active: boolean };
type AutoplayRegistryJson = { plans: AutoplayPlanJson[]; next_plan_id: string };
type RoundSettledJson = { round?: string | number; winning_tile?: string | number; gross?: string; winner_pool?: string };
type MotherlodeUpdatedJson = { balance?: string | number };

const IdBcs = bcs.struct("ID", { bytes: bcs.Address });
const UidBcs = bcs.struct("UID", { id: IdBcs });
const SupplyBcs = bcs.struct("Supply", { value: bcs.u64() });
const TreasuryCapBcs = bcs.struct("TreasuryCap", { id: UidBcs, total_supply: SupplyBcs });
const PositionBcs = bcs.struct("UnrefinedPosition", {
  owner: bcs.Address,
  amount: bcs.u64(),
  awarded_at_ms: bcs.u64(),
  matures_at_ms: bcs.u64(),
  claimed: bcs.bool(),
});
const RefineryBcs = bcs.struct("Refinery", {
  id: UidBcs,
  treasury: TreasuryCapBcs,
  reward_cap_id: IdBcs,
  awarded: bcs.u64(),
  minted: bcs.u64(),
  forfeited: bcs.u64(),
  positions: bcs.vector(PositionBcs),
});
const TableBcs = bcs.struct("Table", { id: UidBcs, size: bcs.u64() });
const RefineryV2Bcs = bcs.struct("RefineryV2", {
  id: UidBcs,
  refinery_id: IdBcs,
  reward_cap_id: IdBcs,
  wallets: TableBcs,
  active_wallets: bcs.u64(),
  open_positions: bcs.u64(),
  migration_complete: bcs.bool(),
});
const WalletPositionsBcs = bcs.struct("WalletPositions", { positions: bcs.vector(PositionBcs) });

export function rewardAccounting(
  address: string,
  refinery: Pick<RefineryJson, "positions">,
  ledger: LedgerJson | undefined,
  now: number,
) {
  const normalizedAddress = address.toLowerCase();
  const userPositions = normalizedAddress ? refinery.positions.filter((position) =>
    position.owner.toLowerCase() === normalizedAddress && !position.claimed
  ) : [];
  const portions = userPositions.map((position) => {
    const amount = BigInt(position.amount);
    const starts = BigInt(position.awarded_at_ms);
    const matures = BigInt(position.matures_at_ms);
    const timestamp = BigInt(now);
    const refined = timestamp >= matures ? amount : timestamp <= starts ? 0n : amount * (timestamp - starts) / (matures - starts);
    return { position, refined, unrefined: amount - refined };
  });
  const refinedPositions = portions.filter(({ refined }) => refined > 0n);
  const unrefinedPositions = portions.filter(({ unrefined }) => unrefined > 0n);
  const refined = refinedPositions.reduce((sum, portion) => sum + portion.refined, 0n);
  const unrefined = unrefinedPositions.reduce((sum, portion) => sum + portion.unrefined, 0n);
  const ledgerCredits = normalizedAddress ? (ledger?.credits ?? []).filter((credit) =>
    credit.owner.toLowerCase() === normalizedAddress && BigInt(credit.sui) > 0n
  ) : [];
  const ledgerCreditTotal = ledgerCredits.reduce((sum, credit) => sum + BigInt(credit.sui), 0n);

  return { refinedPositions, unrefinedPositions, refined, unrefined, ledgerCredits, ledgerCreditTotal };
}

const sui = (mist: bigint) => Number(mist) / 1_000_000_000;
const mtbx = (units: bigint) => Number(units) / 1_000_000;
const decodeTiles = (value: string | number[]) => Array.isArray(value) ? value : Array.from(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object: gameObject }, { object: refineryObject }, { object: upgradeCapObject }, { object: ledgerObject }, registryResult, settledEvents, motherlodeEvents, walletBalanceResult, walletDslvrBalanceResult, keeperBalanceResult, keeperHealth] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      // The refinery position vector is large enough that public nodes can omit
      // its JSON representation. BCS remains complete and authoritative.
      client.core.getObject({ objectId: refineryId, include: { content: true } }),
      client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
      ledgerId ? client.core.getObject({ objectId: ledgerId, include: { json: true } }) : Promise.resolve({ object: null }),
      autoplayRegistryId ? client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } }) : Promise.resolve({ object: null }),
      eventClient.core.listEvents({ filter: { eventType: `${originPackageId}::game::RoundSettled` }, limit: 1, order: "descending" }).catch(() => ({ events: [] })),
      eventClient.core.listEvents({ filter: { eventType: `${motherlodeEventPackageId}::game::MotherlodeUpdated` }, limit: 1, order: "descending" }).catch(() => ({ events: [] })),
      address ? client.core.getBalance({ owner: address }).catch(() => null) : Promise.resolve(null),
      address ? client.core.getBalance({ owner: address, coinType: dslvrType }).catch(() => null) : Promise.resolve(null),
      client.core.getBalance({ owner: keeperAddress }).catch(() => null),
      getKeeperHealth().catch(() => null),
    ]);
    const motherlodeJson = (motherlodeEvents.events[0]?.json ?? null) as MotherlodeUpdatedJson | null;
    const upgradeCap = (upgradeCapObject as { json?: { package?: string } }).json ?? null;
    const packageId = upgradeCap?.package ?? fallbackPackageId;
    const motherlodeBalance = BigInt(motherlodeJson?.balance ?? "0");
    const game = gameObject.json as GameJson;
    if (!refineryObject.content) throw new Error("Refinery data unavailable");
    const refinery = RefineryBcs.parse(refineryObject.content) as RefineryJson;
    const refineryV2Id = process.env.REFINERY_V2_ID?.trim() ?? "";
    let refineryV2: RefineryV2Json | null = null;
    let v2Positions: Position[] = [];
    if (refineryV2Id) {
      const { object: v2Object } = await client.core.getObject({ objectId: refineryV2Id, include: { content: true } });
      if (!v2Object.content) throw new Error("Refinery V2 data unavailable");
      refineryV2 = RefineryV2Bcs.parse(v2Object.content) as RefineryV2Json;
      if (address) {
        try {
          const { dynamicField } = await client.core.getDynamicField({
            parentId: refineryV2.wallets.id.id.bytes,
            name: { type: "address", bcs: bcs.Address.serialize(address).toBytes() },
          });
          v2Positions = (WalletPositionsBcs.parse(dynamicField.value.bcs) as { positions: Position[] }).positions;
        } catch {
          v2Positions = [];
        }
      }
    }
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
    const combinedRefinery = { positions: [...refinery.positions, ...v2Positions] };
    const { refinedPositions, unrefinedPositions, refined, unrefined, ledgerCredits, ledgerCreditTotal } =
      rewardAccounting(address, combinedRefinery, ledger, now);
    const legacyAccounting = rewardAccounting(address, refinery, undefined, now);
    const v2Accounting = rewardAccounting(address, { positions: v2Positions }, undefined, now);
    const autoplayPlans = address ? (registry?.plans ?? []).filter((plan) =>
      plan.owner.toLowerCase() === address && plan.active && BigInt(plan.rounds_remaining) > 0n
    ).map((plan) => ({
      planId: Number(plan.plan_id), roundsRemaining: Number(plan.rounds_remaining),
      tiles: decodeTiles(plan.tiles).map((tile) => tile + 1), tileCount: decodeTiles(plan.tiles).length,
      amountPerTileSui: sui(BigInt(plan.amount_per_tile)),
      fundedSui: sui(BigInt(plan.funds)), lastRoundPlayed: Number(plan.last_round_played),
    })) : [];
    const activeGlobalPlans = (registry?.plans ?? []).filter((plan) => plan.active && BigInt(plan.rounds_remaining) > 0n);
    const pendingGlobalPlans = activeGlobalPlans.filter((plan) => BigInt(plan.last_round_played) < round);
    const carriedOverPlans = activeGlobalPlans.filter((plan) => BigInt(plan.last_round_played) + 1n < round);
    const oldestPlanLag = activeGlobalPlans.reduce((lag, plan) => Math.max(lag, Number(round - BigInt(plan.last_round_played))), 0);
    const globalAutoplay = {
      activePlans: activeGlobalPlans.length,
      pendingPlans: pendingGlobalPlans.length,
      remainingRounds: activeGlobalPlans.reduce((sum, plan) => sum + Number(plan.rounds_remaining), 0),
      batchSize: Math.max(1, Number(process.env.AUTOPLAY_BATCH_SIZE ?? 10)),
      packageVersion: Number((upgradeCap as { version?: string } | null)?.version ?? 0),
      carriedOverPlans: carriedOverPlans.length,
      oldestPlanLag,
    };
    const playedTiles = address ? Array.from(new Set(game.entries.filter((entry) =>
      entry.player.toLowerCase() === address && BigInt(entry.round) === round
    ).map((entry) => entry.tile + 1))) : [];
    const lastEvent = settledEvents.events[0];
    const lastJson = (lastEvent?.json ?? null) as RoundSettledJson | null;
    const lastRound = lastJson ? {
      round: Number(lastJson.round ?? 0), winningTile: Number(lastJson.winning_tile ?? 0) + 1,
      deployedSui: sui(BigInt(lastJson.gross ?? "0")), rewardPoolSui: sui(BigInt(lastJson.winner_pool ?? "0")),
      mtbxAwarded: 0, transaction: lastEvent?.transactionDigest ?? null,
    } : null;

    return Response.json({
      packageId, gameId, refineryId, refineryV2Id: refineryV2Id || null, upgradeCapId, ledgerId,
      gameType: (gameObject as { type?: string }).type ?? null,
      refineryType: (refineryObject as { type?: string }).type ?? null,
      upgradeCap,
      round: Number(game.round), closesAtMs: Number(game.closes_at_ms),
      remainingMs: Math.max(0, Number(game.closes_at_ms) - now), settled: game.settled,
      rewardsBound: game.reward_cap !== null, winningTile: winner === null ? null : winner + 1,
      tileTotals: game.tile_totals.map((value) => sui(BigInt(value))), potSui: sui(BigInt(game.pot)),
      winningEntriesRemaining: Number(game.winning_entries_remaining),
      claimableWinningEntries: userWinningEntries.length, estimatedSuiWinnings: sui(estimatedSui), estimatedMtbxWinnings: mtbx(estimatedMtbx),
      refinedMtbx: mtbx(refined), unrefinedMtbx: mtbx(unrefined), refinedPositions: refinedPositions.length,
      unrefinedPositions: unrefinedPositions.length,
      legacyRefinedPositions: legacyAccounting.refinedPositions.length,
      legacyUnrefinedPositions: legacyAccounting.unrefinedPositions.length,
      v2RefinedPositions: v2Accounting.refinedPositions.length,
      v2UnrefinedPositions: v2Accounting.unrefinedPositions.length,
      v2WalletPositions: v2Positions.filter((position) => !position.claimed).length,
      ledgerSui: sui(ledgerCreditTotal), ledgerCreditCount: ledgerCredits.length,
      walletSui: walletBalanceResult ? sui(BigInt(walletBalanceResult.balance.balance)) : 0,
      walletDslvr: walletDslvrBalanceResult ? mtbx(BigInt(walletDslvrBalanceResult.balance.balance)) : 0,
      keeperSui: keeperBalanceResult ? sui(BigInt(keeperBalanceResult.balance.balance)) : 0,
      keeperLow: !keeperBalanceResult || BigInt(keeperBalanceResult.balance.balance) < keeperLowBalanceMist,
      alertsConfigured: Boolean(process.env.RESEND_API_KEY && process.env.OPS_ALERT_EMAIL),
      keeperHealth,
      motherlodeDslvr: mtbx(motherlodeBalance),
      refineryTotals: {
        awardedDslvr: mtbx(BigInt(refinery.awarded)),
        mintedDslvr: mtbx(BigInt(refinery.minted)),
        forfeitedDslvr: mtbx(BigInt(refinery.forfeited)),
        openPositions: refineryV2 ? Number(refineryV2.open_positions) : refinery.positions.filter((position) => !position.claimed).length,
      },
      autoplayPlans,
      globalAutoplay,
      playedTiles,
      lastRound,
      nextMaturityMs: unrefinedPositions.length ? Math.min(...unrefinedPositions.map(({ position }) => Number(position.matures_at_ms))) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet state unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
