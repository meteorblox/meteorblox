import { SuiGraphQLClient } from "@mysten/sui/graphql";

const packageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
// Sui event types retain the package version where the struct was introduced.
const motherlodePackageId = "0x0de2330f503784f12b4abf7484f336976149e4056784ebb1709a4c38889e0b99";
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type EventRecord = { json?: Record<string, unknown>; timestamp?: string | null; transactionDigest?: string | null };
const sui = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000_000;
const dslvr = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000;
const asBigInt = (value: unknown) => BigInt(String(value ?? "0"));

async function recentEvents(eventType: string, pages = 6) {
  const events: EventRecord[] = [];
  let before: string | null | undefined;
  for (let page = 0; page < pages; page += 1) {
    const result = await eventClient.core.listEvents({ filter: { eventType }, limit: 50, order: "descending", ...(before ? { before } : {}) });
    events.push(...result.events as EventRecord[]);
    if (!result.hasNextPage || !result.endCursor) break;
    before = result.endCursor;
  }
  return events;
}

export async function GET() {
  try {
    const [settledResult, entryResult, motherlodeResult, winnings] = await Promise.all([
      eventClient.core.listEvents({ filter: { eventType: `${packageId}::game::RoundSettled` }, limit: 25, order: "descending" }),
      eventClient.core.listEvents({ filter: { eventType: `${packageId}::game::EntryPlaced` }, limit: 50, order: "descending" }),
      eventClient.core.listEvents({ filter: { eventType: `${motherlodePackageId}::game::MotherlodeUpdated` }, limit: 25, order: "descending" }),
      recentEvents(`${packageId}::game::WinningsClaimed`),
    ]);
    const entries = entryResult.events as EventRecord[];
    const miners = new Set(entries.map((event) => String(event.json?.player ?? "").toLowerCase()).filter(Boolean));
    const rounds = (settledResult.events as EventRecord[]).map((event) => {
      const round = Number(event.json?.round ?? 0);
      const gross = asBigInt(event.json?.gross);
      const winnerPool = asBigInt(event.json?.winner_pool);
      const claims = winnings.filter((claim) => Number(claim.json?.round ?? 0) === round);
      const winningWallets = [...new Set(claims.map((claim) => String(claim.json?.player ?? "").toLowerCase()).filter(Boolean))];
      const dslvrPaid = claims.reduce((sum, claim) => sum + asBigInt(claim.json?.dslvr_amount), 0n);
      return {
        round,
        winningTile: Number(event.json?.winning_tile ?? 0) + 1,
        winnerType: winningWallets.length > 1 ? "split" : winningWallets.length === 1 ? "individual" : "pending",
        winnerAddress: winningWallets.length === 1 ? winningWallets[0] : null,
        winnerCount: winningWallets.length,
        winningEntries: claims.length,
        deployedSui: sui(gross),
        vaultedSui: sui(gross - winnerPool),
        winningsSui: sui(winnerPool),
        dslvrWinnings: dslvr(dslvrPaid),
        rewardPoolSui: sui(winnerPool),
        transaction: event.transactionDigest ?? null,
        timestamp: event.timestamp ?? null,
      };
    });
    const audit = rounds.slice(0, 10).map((round) => {
      const settled = (settledResult.events as EventRecord[]).find((event) => Number(event.json?.round ?? 0) === round.round);
      const gross = asBigInt(settled?.json?.gross);
      const winnerPool = asBigInt(settled?.json?.winner_pool);
      const protocolFee = gross * 1_000n / 10_000n;
      const expectedWinnerPool = gross - protocolFee;
      const treasury = gross * 500n / 10_000n;
      const rewards = gross * 200n / 10_000n;
      const ops = protocolFee - treasury - rewards;
      const claims = winnings.filter((event) => Number(event.json?.round ?? 0) === round.round);
      const paidSui = claims.reduce((sum, event) => sum + asBigInt(event.json?.amount), 0n);
      const paidDslvr = claims.reduce((sum, event) => sum + asBigInt(event.json?.dslvr_amount), 0n);
      const poolMatches = winnerPool === expectedWinnerPool;
      const payoutsMatch = claims.length > 0 && paidSui === winnerPool;
      const dslvrMatches = claims.length > 0 && paidDslvr === 250_000n;
      return {
        round: round.round,
        expectedWinnerPoolSui: sui(expectedWinnerPool), actualWinnerPoolSui: sui(winnerPool),
        treasurySui: sui(treasury), rewardsSui: sui(rewards), opsSui: sui(ops),
        paidSui: sui(paidSui), paidDslvr: dslvr(paidDslvr), winnerClaims: claims.length,
        status: poolMatches && payoutsMatch && dslvrMatches ? "pass" : claims.length ? "mismatch" : "pending",
      };
    });
    return Response.json({
      packageId,
      indexedEntries: entries.length,
      indexedMiners: miners.size,
      indexedDeployedSui: entries.reduce((sum, event) => sum + sui(event.json?.amount), 0),
      rounds,
      audit,
      auditSummary: { checked: audit.length, passed: audit.filter((item) => item.status === "pass").length, mismatches: audit.filter((item) => item.status === "mismatch").length, pending: audit.filter((item) => item.status === "pending").length },
      motherlodes: (motherlodeResult.events as EventRecord[]).map((event) => ({
        round: Number(event.json?.round ?? 0), winningTile: Number(event.json?.tile ?? 0) + 1,
        addedDslvr: dslvr(event.json?.added), balanceDslvr: dslvr(event.json?.balance), hit: Boolean(event.json?.hit),
        transaction: event.transactionDigest ?? null, timestamp: event.timestamp ?? null,
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Explore activity unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
